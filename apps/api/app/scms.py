"""ตัวเชื่อม SCMS Backend

- lookup()  : ขั้นที่ 5 — ขอชื่อ-สกุลของรหัส นศ. / เลขบัตร ปชช. มา cross-check
- post()    : ขั้นที่ 10 — บันทึกผลยืนยันวุฒิ

โหมด dry_run จะไม่ยิง HTTP จริง แต่ยังคืนค่าเหมือนสำเร็จ เพื่อให้ทดสอบทั้ง flow ได้
ข้อมูล lookup ในโหมด dry-run อ่านจาก data/scms_students.json ถ้ามี
"""

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from .config import ROOT, Settings

LOCAL_DIRECTORY = ROOT / "data" / "scms_students.json"


class ScmsClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._directory = self._load_directory()

    # ---- ขั้นที่ 5 -------------------------------------------------------
    def lookup(self, student_id: Optional[str], citizen_id: Optional[str]) -> Optional[dict]:
        key = student_id or citizen_id
        if not key:
            return None
        if self.settings.dry_run or not self._directory_is_remote():
            rec = self._directory.get(student_id or "") or self._directory.get(citizen_id or "")
            return rec
        try:
            url = "{0}/students/{1}".format(self.settings.scms_endpoint.rstrip("/"), key)
            with urllib.request.urlopen(url, timeout=8) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, ValueError, OSError):
            return None

    # ---- ขั้นที่ 10 ------------------------------------------------------
    def post(self, payload: dict) -> dict:
        if self.settings.dry_run:
            return {"ok": True, "dry_run": True, "reference": "DRY-{0}".format(payload.get("file_name"))}
        try:
            req = urllib.request.Request(
                self.settings.scms_endpoint,
                data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                headers={"Content-Type": "application/json",
                         "X-Service-Account": self.settings.scms_account},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                return {"ok": True, "response": json.loads(resp.read().decode("utf-8") or "{}")}
        except (urllib.error.URLError, ValueError, OSError) as exc:
            return {"ok": False, "error": str(exc)}

    # ---- helpers --------------------------------------------------------
    def _directory_is_remote(self) -> bool:
        return not LOCAL_DIRECTORY.exists()

    @staticmethod
    def _load_directory() -> dict:
        if not LOCAL_DIRECTORY.exists():
            return {}
        try:
            data = json.loads(LOCAL_DIRECTORY.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return {}
        table = {}
        for rec in data:
            if rec.get("student_id"):
                table[rec["student_id"]] = rec
            if rec.get("citizen_id"):
                table[rec["citizen_id"]] = rec
        return table
