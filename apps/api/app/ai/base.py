"""สัญญาร่วมของตัวอ่านเอกสาร (ขั้นที่ 4–6)"""

import re
from typing import List, Optional

from ..models import DocResult, FORM_OTHER, FORM_SPU, RowResult, UNCLEAR

GRADUATION_VALUES = ("pass", "fail")
CORRECTNESS_VALUES = ("correct", "incorrect")


class Extractor:
    name = "base"

    def extract(self, file_name: str, images: List[bytes]) -> DocResult:
        raise NotImplementedError


def parse_payload(file_name: str, file_path: str, payload: dict, pages: int) -> DocResult:
    """แปลง JSON ที่โมเดลตอบกลับให้เป็น DocResult พร้อมกันค่าเพี้ยน"""
    form_type = FORM_SPU if str(payload.get("form_type", "")).lower() == "spu" else FORM_OTHER

    rows: List[RowResult] = []
    for i, raw in enumerate(payload.get("rows") or [], start=1):
        rows.append(
            RowResult(
                row_no=int(raw.get("row_no") or i),
                student_id=_clean(raw.get("student_id")),
                full_name=_clean(raw.get("full_name")),
                faculty=_clean(raw.get("faculty")),
                graduation=_choice(raw.get("graduation"), GRADUATION_VALUES),
                doc_date=_choice(raw.get("doc_date"), CORRECTNESS_VALUES),
                degree=_choice(raw.get("degree"), CORRECTNESS_VALUES),
                note=_note(raw.get("note")),
                confidence=_conf(raw.get("confidence")),
                source_page=int(raw.get("source_page") or 1),
            )
        )

    return DocResult(
        file_path=file_path,
        file_name=file_name,
        form_type=form_type,
        doc_no=_clean(payload.get("doc_no")),
        set_no=_digits(payload.get("set_no")),
        school_name=_clean(payload.get("school_name")),
        school_code=_digits(payload.get("school_code")),
        verifier_signed=bool(payload.get("verifier_signed")),
        verifier_name=_clean(payload.get("verifier_name")),
        verifier_position=_clean(payload.get("verifier_position")),
        rows=rows,
        pages=pages,
    )


def _clean(v) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _note(v) -> Optional[str]:
    s = _clean(v)
    if not s or s in ("-", "—", "–"):
        return None
    return s


def _digits(v) -> Optional[str]:
    s = _clean(v)
    if not s:
        return None
    digits = "".join(re.findall(r"\d", s))
    return digits or None


def _choice(v, allowed) -> Optional[str]:
    s = _clean(v)
    if s is None:
        return None
    s = s.lower()
    if s in allowed:
        return s
    if s in ("null", "none", ""):
        return None
    # เผื่อโมเดลตอบเป็นภาษาไทย
    thai = {"สำเร็จ": "pass", "ไม่สำเร็จ": "fail", "ถูกต้อง": "correct", "ไม่ถูกต้อง": "incorrect"}
    if s in thai and thai[s] in allowed:
        return thai[s]
    return UNCLEAR


def _conf(v) -> float:
    try:
        c = float(v)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, c))
