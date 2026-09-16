"""หน้าบ้าน JSON-RPC ที่ JavaScript เรียกผ่าน window.pywebview.api.<method>()"""

from typing import List, Optional

from . import documents
from .config import Settings
from .pipeline import Pipeline
from .storage import Storage


class Api:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or Settings.load()
        self.storage = Storage(self.settings)
        self.pipeline = Pipeline(self.settings, self.storage)
        self.window = None

    # ---- ทั่วไป ----------------------------------------------------------
    def ping(self) -> dict:
        return {"ok": True, "backend": self.storage.backend,
                "ai": self.settings.ai_provider,
                "has_api_key": bool(self.settings.gemini_api_key)}

    def get_settings(self) -> dict:
        return self.settings.to_public_dict()

    def save_settings(self, patch: dict) -> dict:
        self.settings.update(patch or {})
        self.pipeline.settings = self.settings
        return {"ok": True, "settings": self.settings.to_public_dict()}

    def test_ai(self) -> dict:
        from .ai import build_extractor

        try:
            ex = build_extractor(self.settings)
            return {"ok": True, "provider": ex.name}
        except Exception as exc:                         # noqa: BLE001
            return {"ok": False, "error": str(exc)}

    def choose_folder(self, kind: str = "source") -> dict:
        """เปิดหน้าต่างเลือกโฟลเดอร์ของระบบปฏิบัติการ"""
        if self.window is None:
            return {"ok": False, "error": "ไม่ได้รันในหน้าต่างเดสก์ท็อป"}
        import webview

        picked = self.window.create_file_dialog(webview.FOLDER_DIALOG)
        if not picked:
            return {"ok": False, "cancelled": True}
        path = picked[0]
        self.settings.update({"source_dir" if kind == "source" else "archive_dir": path})
        return {"ok": True, "path": path}

    # ---- ขั้นที่ 3–7 -----------------------------------------------------
    def scan_source(self) -> dict:
        files = documents.discover(self.settings.source_dir)
        return {"ok": True, "count": len(files), "files": [f.name for f in files],
                "source_dir": self.settings.source_dir,
                "archive_dir": self.settings.archive_dir}

    def start_run(self, operator: str = "officer") -> dict:
        return self.pipeline.start(operator=operator)

    def stop_run(self) -> dict:
        return self.pipeline.stop()

    def poll(self) -> dict:
        """UI เรียกซ้ำ ๆ เพื่อดึง event ที่สะสมไว้ + สถานะปัจจุบัน"""
        return {"events": self.pipeline.drain(), "state": self.pipeline.state()}

    # ---- ขั้นที่ 8–9 -----------------------------------------------------
    def get_queue(self) -> List[dict]:
        return self.storage.queue()

    def confirm_case(self, doc_id: int, rows: Optional[list] = None,
                     operator: str = "officer") -> dict:
        return self.pipeline.confirm_case(int(doc_id), rows, operator)

    def reject_case(self, doc_id: int, reason: str = "", operator: str = "officer") -> dict:
        return self.pipeline.reject_case(int(doc_id), reason, operator)

    def get_document(self, doc_id: int) -> Optional[dict]:
        return self.storage.get_document(int(doc_id))

    # ---- ประวัติ / ภาพรวม -------------------------------------------------
    def get_runs(self, limit: int = 20) -> List[dict]:
        return self.storage.list_runs(limit)

    def get_run_documents(self, run_id: int) -> List[dict]:
        return self.storage.list_documents(run_id=int(run_id))

    def get_audit(self, run_id: int) -> List[dict]:
        return self.storage.audit_trail(int(run_id))

    def get_dashboard(self) -> dict:
        runs = self.storage.list_runs(limit=7)
        latest = runs[0] if runs else None
        docs = self.storage.list_documents(run_id=latest["id"]) if latest else []
        return {
            "latest_run": latest,
            "documents": docs,
            "queue_size": len(self.storage.list_documents(status="pending")),
            "trend": list(reversed([
                {"run_id": r["id"], "total": r.get("total") or 0,
                 "auto": r.get("auto") or 0, "exception": r.get("exception") or 0,
                 "started_at": r.get("started_at")}
                for r in runs
            ])),
            "storage": self.storage.backend,
        }
