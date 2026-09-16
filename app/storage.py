"""ชั้นจัดเก็บข้อมูล — MySQL (ตาม TECH_STACK) และ fallback เป็น SQLite ในเครื่อง

ตารางเหมือนกันทั้งสองฝั่ง ต่างแค่ placeholder ของ driver
Audit trail เก็บทุกค่า: AI raw value + confidence + source page + edited flag
"""

import json
import sqlite3
import threading
from datetime import datetime
from typing import List, Optional

from .config import APP_DIR, Settings
from .models import DocResult, RowResult, RunSummary

SCHEMA_SQLITE = [
    """CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT, finished_at TEXT,
        total INTEGER DEFAULT 0, auto INTEGER DEFAULT 0,
        exception_count INTEGER DEFAULT 0, posted INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running', operator TEXT )""",
    """CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER, file_name TEXT, file_path TEXT,
        form_type TEXT, doc_no TEXT, set_no TEXT,
        school_name TEXT, school_code TEXT,
        verifier_signed INTEGER, verifier_name TEXT, verifier_position TEXT,
        row_count INTEGER, readable_rows INTEGER, min_confidence REAL,
        verdict TEXT, reasons TEXT, status TEXT, error TEXT,
        created_at TEXT )""",
    """CREATE TABLE IF NOT EXISTS doc_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER, row_no INTEGER,
        student_id TEXT, full_name TEXT, faculty TEXT,
        graduation TEXT, doc_date TEXT, degree TEXT, note TEXT,
        confidence REAL, source_page INTEGER,
        scms_match INTEGER, scms_name TEXT, issues TEXT, edited INTEGER DEFAULT 0 )""",
    """CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT, run_id INTEGER, document_id INTEGER,
        actor TEXT, action TEXT, detail TEXT )""",
]

SCHEMA_MYSQL = [
    s.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "INT AUTO_INCREMENT PRIMARY KEY")
     .replace("TEXT", "TEXT CHARACTER SET utf8mb4")
     .replace("REAL", "DOUBLE")
    for s in SCHEMA_SQLITE
]


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class Storage:
    """เปิด MySQL ก่อน ถ้าต่อไม่ได้ค่อยใช้ SQLite เพื่อให้โปรแกรมยังทำงานได้"""

    def __init__(self, settings: Settings):
        self.lock = threading.Lock()
        self.backend = "sqlite"
        self.conn = None
        self._connect(settings)
        self._migrate()

    # ---- connection -----------------------------------------------------
    def _connect(self, settings: Settings) -> None:
        cfg = settings.mysql
        if cfg["host"] and cfg["database"]:
            try:
                import pymysql

                self.conn = pymysql.connect(
                    host=cfg["host"], port=cfg["port"], user=cfg["user"],
                    password=cfg["password"], database=cfg["database"],
                    charset="utf8mb4", autocommit=True, connect_timeout=4,
                    cursorclass=pymysql.cursors.DictCursor,
                )
                self.backend = "mysql"
                return
            except Exception as exc:                     # noqa: BLE001 — fallback ตั้งใจ
                self.connect_error = str(exc)
        path = APP_DIR / "app.db"
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.backend = "sqlite"

    @property
    def ph(self) -> str:
        return "%s" if self.backend == "mysql" else "?"

    def _migrate(self) -> None:
        schema = SCHEMA_MYSQL if self.backend == "mysql" else SCHEMA_SQLITE
        with self.lock:
            cur = self.conn.cursor()
            for stmt in schema:
                cur.execute(stmt)
            if self.backend == "sqlite":
                self.conn.commit()
            cur.close()

    def _exec(self, sql: str, args=()) -> int:
        with self.lock:
            cur = self.conn.cursor()
            cur.execute(sql, args)
            last = cur.lastrowid
            if self.backend == "sqlite":
                self.conn.commit()
            cur.close()
            return last

    def _query(self, sql: str, args=()) -> List[dict]:
        with self.lock:
            cur = self.conn.cursor()
            cur.execute(sql, args)
            rows = cur.fetchall()
            cur.close()
        return [dict(r) for r in rows]

    # ---- runs -----------------------------------------------------------
    def start_run(self, operator: str = "system") -> RunSummary:
        p = self.ph
        rid = self._exec(
            "INSERT INTO runs (started_at, status, operator) VALUES ({0}, {0}, {0})".format(p),
            (_now(), "running", operator),
        )
        return RunSummary(run_id=rid, started_at=_now())

    def finish_run(self, run: RunSummary) -> None:
        p = self.ph
        self._exec(
            "UPDATE runs SET finished_at={0}, total={0}, auto={0}, exception_count={0}, "
            "posted={0}, status={0} WHERE id={0}".format(p),
            (_now(), run.total, run.auto, run.exception, run.posted, run.status, run.run_id),
        )

    def list_runs(self, limit: int = 50) -> List[dict]:
        rows = self._query(
            "SELECT * FROM runs ORDER BY id DESC LIMIT {0}".format(int(limit))
        )
        for r in rows:
            r["exception"] = r.pop("exception_count", 0)
        return rows

    # ---- documents ------------------------------------------------------
    def save_document(self, run_id: int, doc: DocResult) -> int:
        p = self.ph
        doc_id = self._exec(
            "INSERT INTO documents (run_id, file_name, file_path, form_type, doc_no, set_no, "
            "school_name, school_code, verifier_signed, verifier_name, verifier_position, "
            "row_count, readable_rows, min_confidence, verdict, reasons, status, error, created_at) "
            "VALUES ({0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0})".format(p),
            (run_id, doc.file_name, doc.file_path, doc.form_type, doc.doc_no, doc.set_no,
             doc.school_name, doc.school_code, int(doc.verifier_signed),
             doc.verifier_name, doc.verifier_position,
             doc.row_count, doc.readable_rows, doc.min_confidence, doc.verdict,
             json.dumps(doc.reasons, ensure_ascii=False), doc.status, doc.error, _now()),
        )
        doc.doc_id = doc_id
        for row in doc.rows:
            self._save_row(doc_id, row)
        return doc_id

    def _save_row(self, doc_id: int, row: RowResult) -> None:
        p = self.ph
        self._exec(
            "INSERT INTO doc_rows (document_id, row_no, student_id, full_name, faculty, "
            "graduation, doc_date, degree, note, confidence, source_page, "
            "scms_match, scms_name, issues, edited) "
            "VALUES ({0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0},{0})".format(p),
            (doc_id, row.row_no, row.student_id, row.full_name, row.faculty,
             row.graduation, row.doc_date, row.degree, row.note,
             row.confidence, row.source_page,
             None if row.scms_match is None else int(row.scms_match),
             row.scms_name, json.dumps(row.issues, ensure_ascii=False), int(row.edited)),
        )

    def update_document_status(self, doc_id: int, status: str, verdict: Optional[str] = None) -> None:
        p = self.ph
        if verdict:
            self._exec("UPDATE documents SET status={0}, verdict={0} WHERE id={0}".format(p),
                       (status, verdict, doc_id))
        else:
            self._exec("UPDATE documents SET status={0} WHERE id={0}".format(p), (status, doc_id))

    EDITABLE = ("student_id", "full_name", "faculty", "graduation", "doc_date", "degree", "note")

    def update_rows(self, doc_id: int, rows: List[dict]) -> int:
        """เขียนค่าที่เจ้าหน้าที่แก้ไข พร้อมตั้ง edited flag — คืนจำนวนแถวที่ถูกแก้"""
        p = self.ph
        edited = 0
        for r in rows or []:
            current = self._query(
                "SELECT {0} FROM doc_rows WHERE document_id={1} AND row_no={1}".format(
                    ", ".join(self.EDITABLE), p),
                (doc_id, r.get("row_no")),
            )
            if not current:
                continue
            cur = current[0]
            values = [(r.get(f) or None) for f in self.EDITABLE]
            changed = any(v != cur[f] for f, v in zip(self.EDITABLE, values))
            self._exec(
                "UPDATE doc_rows SET {0}, edited={1} WHERE document_id={1} AND row_no={1}".format(
                    ", ".join("{0}={1}".format(f, p) for f in self.EDITABLE), p),
                tuple(values) + (int(changed), doc_id, r.get("row_no")),
            )
            edited += int(changed)
        return edited

    def get_document(self, doc_id: int) -> Optional[dict]:
        p = self.ph
        docs = self._query("SELECT * FROM documents WHERE id={0}".format(p), (doc_id,))
        if not docs:
            return None
        doc = docs[0]
        doc["reasons"] = json.loads(doc.get("reasons") or "[]")
        doc["verifier_signed"] = bool(doc.get("verifier_signed"))
        doc["rows"] = self.get_rows(doc_id)
        return doc

    def get_rows(self, doc_id: int) -> List[dict]:
        p = self.ph
        rows = self._query(
            "SELECT * FROM doc_rows WHERE document_id={0} ORDER BY row_no".format(p), (doc_id,)
        )
        for r in rows:
            r["issues"] = json.loads(r.get("issues") or "[]")
            r["edited"] = bool(r.get("edited"))
            r["marks"] = [r.get("graduation"), r.get("doc_date"), r.get("degree")]
            r["adverse"] = any(m in ("fail", "incorrect") for m in r["marks"])
            if r.get("scms_match") is not None:
                r["scms_match"] = bool(r["scms_match"])
        return rows

    def list_documents(self, run_id: Optional[int] = None, status: Optional[str] = None) -> List[dict]:
        p = self.ph
        sql = "SELECT * FROM documents WHERE 1=1"
        args = []
        if run_id is not None:
            sql += " AND run_id={0}".format(p)
            args.append(run_id)
        if status:
            sql += " AND status={0}".format(p)
            args.append(status)
        sql += " ORDER BY id"
        docs = self._query(sql, tuple(args))
        for d in docs:
            d["reasons"] = json.loads(d.get("reasons") or "[]")
            d["verifier_signed"] = bool(d.get("verifier_signed"))
        return docs

    def queue(self) -> List[dict]:
        """เคสที่รอเจ้าหน้าที่ตรวจ (ขั้นที่ 8)"""
        docs = self.list_documents(status="pending")
        for d in docs:
            d["rows"] = self.get_rows(d["id"])
        return docs

    # ---- audit ----------------------------------------------------------
    def audit(self, action: str, actor: str = "system", run_id: Optional[int] = None,
              document_id: Optional[int] = None, detail: Optional[dict] = None) -> None:
        p = self.ph
        self._exec(
            "INSERT INTO audit_log (ts, run_id, document_id, actor, action, detail) "
            "VALUES ({0},{0},{0},{0},{0},{0})".format(p),
            (_now(), run_id, document_id, actor, action,
             json.dumps(detail or {}, ensure_ascii=False)),
        )

    def audit_trail(self, run_id: int) -> List[dict]:
        p = self.ph
        rows = self._query(
            "SELECT * FROM audit_log WHERE run_id={0} ORDER BY id".format(p), (run_id,)
        )
        for r in rows:
            r["detail"] = json.loads(r.get("detail") or "{}")
        return rows

    def stats(self) -> dict:
        runs = self.list_runs(limit=7)
        pending = len(self.list_documents(status="pending"))
        return {"runs": runs, "pending": pending, "backend": self.backend}

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:                                # noqa: BLE001
            pass
