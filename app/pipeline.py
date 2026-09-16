"""ตัวควบคุมการทำงาน ขั้นที่ 3–10 — รันบน worker thread ไม่ให้ GUI ค้าง

เหตุการณ์ทุกอย่างถูกส่งเข้า queue ให้ UI ดึงไปแสดง (log, ผลรายไฟล์, ความคืบหน้า)
"""

import queue
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Callable, List, Optional

from . import documents
from .ai import build_extractor
from .config import Settings
from .models import DocResult, RunSummary, VERDICT_AUTO
from .rules import validate
from .scms import ScmsClient
from .storage import Storage

STEPS = {
    3: "รับไฟล์เข้าระบบ",
    4: "ตรวจชนิดฟอร์ม",
    5: "อ่านรหัส นศ. / เลขบัตร",
    6: "AI อ่านเครื่องหมาย",
    7: "ตรวจตามกฎอัตโนมัติ",
    8: "รับเคสเข้าคิว Exception",
    9: "เจ้าหน้าที่ยืนยัน / แก้ไข",
    10: "บันทึกผลเข้า SCMS",
}


class Pipeline:
    def __init__(self, settings: Settings, storage: Storage,
                 on_event: Optional[Callable[[dict], None]] = None):
        self.settings = settings
        self.storage = storage
        self.events: "queue.Queue[dict]" = queue.Queue()
        self.on_event = on_event

        self._thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self.run: Optional[RunSummary] = None
        self.started_ts = 0.0
        self.current_step = 0
        self.current_file = ""

    # ---- event plumbing --------------------------------------------------
    def emit(self, kind: str, **data) -> None:
        ev = {"kind": kind, "ts": datetime.now().strftime("%H:%M:%S")}
        ev.update(data)
        self.events.put(ev)
        if self.on_event:
            try:
                self.on_event(ev)
            except Exception:                            # noqa: BLE001 — UI ต้องไม่ล้ม worker
                pass

    def log(self, group: str, message: str) -> None:
        self.emit("log", group=group, message=message)

    def drain(self, limit: int = 200) -> List[dict]:
        out = []
        while len(out) < limit:
            try:
                out.append(self.events.get_nowait())
            except queue.Empty:
                break
        return out

    # ---- lifecycle -------------------------------------------------------
    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def start(self, operator: str = "system") -> dict:
        if self.running:
            return {"ok": False, "error": "กำลังประมวลผลอยู่แล้ว"}

        files = documents.discover(self.settings.source_dir)
        if not files:
            return {"ok": False, "error": "ไม่พบไฟล์เอกสารในโฟลเดอร์ต้นทาง"}

        self._stop.clear()
        self.run = self.storage.start_run(operator=operator)
        self.run.total = 0
        self.started_ts = time.time()
        self.storage.audit("run.start", actor=operator, run_id=self.run.run_id,
                           detail={"files": len(files), "source": self.settings.source_dir})
        self._thread = threading.Thread(target=self._work, args=(files,), daemon=True)
        self._thread.start()
        return {"ok": True, "run_id": self.run.run_id, "files": len(files)}

    def stop(self) -> dict:
        if not self.running:
            return {"ok": False, "error": "ไม่ได้กำลังประมวลผล"}
        self._stop.set()
        return {"ok": True}

    # ---- worker ----------------------------------------------------------
    def _work(self, files: List[Path]) -> None:
        total = len(files)
        scms = ScmsClient(self.settings)
        try:
            extractor = build_extractor(self.settings)
        except Exception as exc:                         # noqa: BLE001
            self.log("ERROR", "เริ่มตัวอ่านเอกสารไม่สำเร็จ: {0}".format(exc))
            self._finish("error")
            return

        self.log("INFO", "เริ่มรอบที่ {0} — พบ {1} ชุดเอกสาร (ตัวอ่าน: {2})".format(
            self.run.run_id, total, extractor.name))

        for idx, path in enumerate(files, start=1):
            if self._stop.is_set():
                self.log("ERROR", "ผู้ใช้สั่งหยุดการประมวลผล")
                self._finish("stopped")
                return
            self.current_file = path.name
            try:
                self._process_one(path, idx, total, extractor, scms)
            except Exception as exc:                     # noqa: BLE001 — 1 ไฟล์พังต้องไม่ล้มทั้งรอบ
                self.log("ERROR", "{0}: {1}".format(path.name, exc))
                self.emit("trace", detail=traceback.format_exc())
                doc = DocResult(file_path=str(path), file_name=path.name,
                                error=str(exc), reasons=["ประมวลผลไม่สำเร็จ: {0}".format(exc)])
                self.storage.save_document(self.run.run_id, doc)
                self.run.total += 1
                self.run.exception += 1
                self.emit("document", document=doc.to_dict())

        self._finish("done")

    def _process_one(self, path: Path, idx: int, total: int, extractor, scms: ScmsClient) -> None:
        s = self.settings

        # ---- ขั้นที่ 3 : รับไฟล์ + เก็บภาพต้นฉบับ -------------------------
        self._step(3, path.name, idx, total)
        images, pages = documents.to_images(path, s.max_image_px, s.jpeg_quality)
        self.log("INFO", "รับไฟล์ {0} — {1} หน้า, ย่อภาพไม่เกิน {2}px".format(path.name, pages, s.max_image_px))
        if s.store_original_scan:
            dst = documents.archive(path, s.archive_dir)
            self.storage.audit("document.archived", run_id=self.run.run_id,
                               detail={"file": path.name, "archive": str(dst)})

        # ---- ขั้นที่ 4–6 : AI อ่านเอกสาร ---------------------------------
        self._step(4, path.name, idx, total)
        doc = extractor.extract(path.name, images)
        doc.file_path = str(path)

        if doc.form_type == "other":
            self.log("WARN", "ชนิดฟอร์ม = ไม่ใช่แบบของมหาวิทยาลัย → ไม่ผ่านเกณฑ์ทันที")
        else:
            self.log("OK", "ชนิดฟอร์ม = บัญชีรายชื่อนักศึกษา (SPU) · ที่ {0} ชุดที่ {1} · {2}".format(
                doc.doc_no or "-", doc.set_no or "-", doc.school_name or "-"))

        self._step(5, path.name, idx, total)
        self.log("AI", "อ่านรหัสนักศึกษา / ชื่อ-สกุล / คณะ {0} แถว".format(doc.row_count))
        self._step(6, path.name, idx, total)
        self.log("AI", "อ่านผลตรวจ 3 กลุ่ม + หมายเหตุลายมือ + ลายมือชื่อผู้ตรวจสอบ ({0})".format(
            "พบลายเซ็น" if doc.verifier_signed else "ไม่พบลายเซ็น"))

        # ---- ขั้นที่ 7 : ตรวจตามกฎ ---------------------------------------
        self._step(7, path.name, idx, total)
        validate(doc, s, scms)
        doc.status = "pending"
        self.storage.save_document(self.run.run_id, doc)
        self.storage.audit("document.extracted", run_id=self.run.run_id, document_id=doc.doc_id,
                           detail={"verdict": doc.verdict, "min_confidence": doc.min_confidence,
                                   "rows": [r.to_dict() for r in doc.rows]})

        self.run.total += 1
        if doc.verdict == VERDICT_AUTO:
            # ---- ขั้นที่ 10 : Auto-Post ----------------------------------
            self._step(10, path.name, idx, total)
            res = scms.post(self._payload(doc))
            if res.get("ok"):
                doc.status = "posted"
                self.storage.update_document_status(doc.doc_id, "posted")
                self.storage.audit("scms.post", run_id=self.run.run_id, document_id=doc.doc_id,
                                   detail=res)
                self.run.auto += 1
                self.run.posted += 1
                self.log("OK", "ผ่านกฎครบทุกแถว → Auto-Post")
                self.log("SCMS", "บันทึกผลเข้า SCMS + ปิด Audit Trail ({0})".format(doc.file_name))
            else:
                doc.status = "pending"
                doc.reasons.append("ส่งข้อมูลเข้า SCMS ไม่สำเร็จ: {0}".format(res.get("error")))
                self.run.exception += 1
                self.log("ERROR", "ส่งเข้า SCMS ไม่สำเร็จ: {0}".format(res.get("error")))
        else:
            # ---- ขั้นที่ 8 : เข้าคิวให้เจ้าหน้าที่ -------------------------
            self._step(8, path.name, idx, total)
            self.run.exception += 1
            self.log("WARN", "ไม่ผ่านเกณฑ์: {0}".format(doc.reasons[0] if doc.reasons else "-"))
            self.log("INFO", "ส่งเข้าคิว Exception รอเจ้าหน้าที่ตรวจ ({0})".format(doc.file_name))

        self.emit("document", document=doc.to_dict())
        self.emit("progress", done=self.run.total, total=total,
                  auto=self.run.auto, exception=self.run.exception)

    def _step(self, step: int, file_name: str, idx: int, total: int) -> None:
        self.current_step = step
        self.emit("step", step=step, name=STEPS[step], file=file_name, index=idx, total=total)

    def _payload(self, doc: DocResult) -> dict:
        return {
            "file_name": doc.file_name,
            "doc_no": doc.doc_no,
            "set_no": doc.set_no,
            "school_name": doc.school_name,
            "school_code": doc.school_code,
            "form_type": doc.form_type,
            "verifier_name": doc.verifier_name,
            "verifier_position": doc.verifier_position,
            "verified_by": "ai",
            "rows": [
                {"row_no": r.row_no, "student_id": r.student_id, "full_name": r.full_name,
                 "faculty": r.faculty, "graduation": r.graduation, "doc_date": r.doc_date,
                 "degree": r.degree, "note": r.note,
                 "ai_confidence": r.confidence, "source_page": r.source_page, "edited": r.edited}
                for r in doc.rows
            ],
        }

    def _finish(self, status: str) -> None:
        if not self.run:
            return
        self.run.status = status
        self.storage.finish_run(self.run)
        self.storage.audit("run.finish", run_id=self.run.run_id,
                           detail={"status": status, "total": self.run.total,
                                   "auto": self.run.auto, "exception": self.run.exception})
        self.current_step = 0
        elapsed = int(time.time() - self.started_ts)
        self.log("OK", "จบรอบที่ {0} — {1} ชุด · ผ่านอัตโนมัติ {2} · เข้าคิว {3} · ใช้เวลา {4}:{5:02d}".format(
            self.run.run_id, self.run.total, self.run.auto, self.run.exception,
            elapsed // 60, elapsed % 60))
        self.emit("finished", summary=self.run.to_dict(), elapsed=elapsed)

    # ---- ขั้นที่ 9 : เจ้าหน้าที่ยืนยัน / แก้ไข / ส่งกลับ ---------------------
    def confirm_case(self, doc_id: int, rows: Optional[list] = None, operator: str = "officer") -> dict:
        doc = self.storage.get_document(doc_id)
        if not doc:
            return {"ok": False, "error": "ไม่พบเอกสาร"}
        edited = self.storage.update_rows(doc_id, rows or [])
        doc = self.storage.get_document(doc_id)

        scms = ScmsClient(self.settings)
        payload = {
            "file_name": doc["file_name"], "doc_no": doc.get("doc_no"), "set_no": doc.get("set_no"),
            "school_name": doc["school_name"], "school_code": doc.get("school_code"),
            "form_type": doc["form_type"], "verified_by": operator,
            "verifier_name": doc.get("verifier_name"),
            "rows": doc["rows"],
        }
        res = scms.post(payload)
        if not res.get("ok"):
            self.log("ERROR", "ส่งเข้า SCMS ไม่สำเร็จ: {0}".format(res.get("error")))
            return {"ok": False, "error": res.get("error")}

        self.storage.update_document_status(doc_id, "confirmed", verdict=VERDICT_AUTO)
        self.storage.audit("officer.confirm", actor=operator, document_id=doc_id,
                           run_id=doc.get("run_id"),
                           detail={"edited_rows": edited, "scms": res})
        self.log("SCMS", "เจ้าหน้าที่ยืนยัน {0}{1} → บันทึกเข้า SCMS".format(
            doc["file_name"], " (มีการแก้ไขค่า)" if edited else ""))
        return {"ok": True, "edited_rows": edited}

    def reject_case(self, doc_id: int, reason: str = "", operator: str = "officer") -> dict:
        doc = self.storage.get_document(doc_id)
        if not doc:
            return {"ok": False, "error": "ไม่พบเอกสาร"}
        self.storage.update_document_status(doc_id, "rejected")
        self.storage.audit("officer.reject", actor=operator, document_id=doc_id,
                           run_id=doc.get("run_id"), detail={"reason": reason})
        self.log("WARN", "ส่งกลับ {0} — แจ้งโรงเรียนต้นสังกัดให้แก้ไขและส่งใหม่".format(doc["file_name"]))
        return {"ok": True}

    # ---- state สำหรับ UI --------------------------------------------------
    def state(self) -> dict:
        files = documents.discover(self.settings.source_dir)
        elapsed = int(time.time() - self.started_ts) if self.started_ts else 0
        return {
            "running": self.running,
            "step": self.current_step,
            "step_name": STEPS.get(self.current_step, ""),
            "current_file": self.current_file,
            "source_files": len(files),
            "elapsed": elapsed,
            "run": self.run.to_dict() if self.run else None,
        }
