"""การตั้งค่าทั้งระบบ อ่านจาก .env + ไฟล์ settings.json ในเครื่อง"""

import json
import os
from dataclasses import dataclass, asdict, field
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

APP_DIR = Path(os.environ.get("APP_DATA_DIR", Path.home() / ".ai_verification"))
APP_DIR.mkdir(parents=True, exist_ok=True)
SETTINGS_FILE = APP_DIR / "settings.json"

DEFAULT_PROMPT = """You read scanned "บัญชีรายชื่อนักศึกษา" sheets that Sripatum University
(มหาวิทยาลัยศรีปทุม) sends to a school to verify a student's prior qualification
(ขอตรวจสอบวุฒิ). The school ticks the result columns by hand and sends the sheet back.

Return STRICT JSON, no prose:

{
  "form_type": "spu" | "other",
  "doc_no":      string | null,   // "ที่ มหป.(ตทน) 01933/2569"
  "set_no":      string | null,   // "ชุดที่ 68539"  -> digits only
  "school_name": string | null,   // ชื่อโรงเรียน/สถาบัน
  "school_code": string | null,   // code in brackets, e.g. "00040384"
  "verifier_signed":   true | false,   // is the ผู้ตรวจสอบ signature line actually signed?
  "verifier_name":     string | null,  // name written in the brackets under the signature
  "verifier_position": string | null,  // ตำแหน่ง
  "rows": [
    {
      "row_no": int,
      "student_id": string | null,      // รหัสนักศึกษา as printed
      "full_name":  string | null,      // ชื่อ-สกุล with the title (นาย/นาง/นางสาว)
      "faculty":    string | null,      // คณะ/วิทยาลัย
      "graduation": "pass"|"fail"|"unclear"|null,        // การสำเร็จการศึกษา: สำเร็จ / ไม่สำเร็จ
      "doc_date":   "correct"|"incorrect"|"unclear"|null,// วันที่สำเร็จในเอกสาร: ถูกต้อง / ไม่ถูกต้อง
      "degree":     "correct"|"incorrect"|"unclear"|null,// วุฒิฯ ที่สำเร็จในเอกสาร: ถูกต้อง / ไม่ถูกต้อง
      "note":       string | null,      // หมายเหตุ, handwritten, verbatim ("-" means empty -> null)
      "confidence": 0.0-1.0
    }
  ]
}

Reading the three result groups — READ THIS SLOWLY, it is the whole job:
- Every group occupies TWO cells side by side, split by a vertical grid line.
  Left cell  = สำเร็จ / ถูกต้อง   -> "pass" / "correct"
  Right cell = ไม่สำเร็จ / ไม่ถูกต้อง -> "fail" / "incorrect"
- For each tick, decide the answer from the tick's HORIZONTAL POSITION relative to
  that vertical line — not from the row above, not from the other groups, and never
  from the หมายเหตุ column. Work group by group, row by row.
- Before answering a row, name to yourself the column header printed directly above
  the ticked cell (สำเร็จ / ไม่สำเร็จ / ถูกต้อง / ไม่ถูกต้อง) and answer accordingly.
- The ticked side commonly CHANGES partway down the table. Never copy the previous
  row's answer; a whole block of rows may be ticked on the right.
- Both cells ticked, or a mark you cannot place confidently -> "unclear".
- Neither cell ticked -> null. Do not fill in a value you did not see.

How to decide "form_type":
- "spu"   : header names มหาวิทยาลัยศรีปทุม and the title is บัญชีรายชื่อนักศึกษา.
- "other" : any sheet the school produced itself.
- When unsure answer "other" and set every row confidence to 0.5 or below —
  an "other" sheet always goes to a human, so a wrong "spu" is the costly error.

Rules:
- Never guess an unreadable character. Return null and lower the confidence.
- Copy "note" verbatim, including words such as ปลอมแปลง.
- "confidence" is your certainty for that whole row, not for the page.
"""


PROMPT_VERSION = 4  # เพิ่มเลขนี้เมื่อแก้ DEFAULT_PROMPT เพื่อล้างพร็อมท์เก่าที่ผู้ใช้ยังไม่ได้แก้เอง


@dataclass
class Settings:
    # AI
    ai_provider: str = "auto"          # auto | gemini | mock
    prompt_version: int = PROMPT_VERSION
    model: str = "gemini-3.1-flash-lite"
    max_image_px: int = 2048
    retry_image_px: int = 3072
    jpeg_quality: int = 85
    prompt: str = DEFAULT_PROMPT
    workers: int = 3
    verify_marks: bool = True   # อ่านช่องผลตรวจซ้ำรอบสอง ไม่ตรงกัน = unclear

    # เกณฑ์การตัดสิน (ขั้นที่ 7)
    min_confidence: float = 0.95
    require_all_rows: bool = True
    cross_check_scms: bool = True
    name_match_threshold: float = 0.90   # ความคล้ายชื่อขั้นต่ำที่ยังถือว่าตรงกับ SCMS
    # กฎบังคับ ตาม Sequence Diagram — แก้ไขไม่ได้
    school_form_always_fails: bool = True
    forgery_note_blocks_autopost: bool = True
    forgery_keywords: list = field(default_factory=lambda: ["ปลอม", "ปลอมแปลง", "แก้ไขเอกสาร"])

    # โฟลเดอร์
    source_dir: str = str(ROOT / "data" / "Inbox")
    archive_dir: str = str(ROOT / "data" / "Archive")

    # SCMS
    scms_endpoint: str = "https://scms.spu.ac.th/api/v1/verification"
    scms_account: str = "svc-ai-verification"
    dry_run: bool = True
    store_original_scan: bool = True
    notify_student: bool = True

    @property
    def gemini_api_key(self) -> str:
        return os.environ.get("GEMINI_API_KEY", "")

    @property
    def mysql(self) -> dict:
        return {
            "host": os.environ.get("DB_HOST", ""),
            "port": int(os.environ.get("DB_PORT", "3306") or 3306),
            "database": os.environ.get("DB_NAME", ""),
            "user": os.environ.get("DB_USER", ""),
            "password": os.environ.get("DB_PASSWORD", ""),
        }

    # ---- persistence ----------------------------------------------------
    def to_public_dict(self) -> dict:
        d = asdict(self)
        d["has_api_key"] = bool(self.gemini_api_key)
        return d

    def save(self) -> None:
        SETTINGS_FILE.write_text(
            json.dumps(asdict(self), ensure_ascii=False, indent=2), encoding="utf-8"
        )

    @classmethod
    def load(cls) -> "Settings":
        s = cls()
        if SETTINGS_FILE.exists():
            try:
                data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                return s
            known = {f for f in asdict(s)}
            for k, v in data.items():
                if k in known:
                    setattr(s, k, v)
            # พร็อมท์รุ่นเก่าที่ผู้ใช้ไม่ได้แก้เอง ให้อัปเดตเป็นค่าตั้งต้นล่าสุด
            if data.get("prompt_version", 1) < PROMPT_VERSION:
                s.prompt = DEFAULT_PROMPT
                s.prompt_version = PROMPT_VERSION
                s.save()
        return s

    def update(self, patch: dict) -> "Settings":
        locked = {"school_form_always_fails", "forgery_note_blocks_autopost"}
        known = set(asdict(self))
        for k, v in (patch or {}).items():
            if k in known and k not in locked:
                setattr(self, k, v)
        self.save()
        return self
