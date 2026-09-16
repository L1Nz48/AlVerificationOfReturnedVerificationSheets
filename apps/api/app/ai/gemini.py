"""ตัวอ่านเอกสารด้วย Google Gemini Multimodal (ขั้นที่ 4–6)"""

import json
import re
from typing import List

from ..config import Settings
from ..models import DocResult
from .base import Extractor, parse_payload

_JSON_BLOCK = re.compile(r"\{.*\}", re.S)


class GeminiExtractor(Extractor):
    name = "gemini"

    def __init__(self, settings: Settings):
        import google.generativeai as genai

        if not settings.gemini_api_key:
            raise RuntimeError("ไม่พบ GEMINI_API_KEY")
        genai.configure(api_key=settings.gemini_api_key)
        self.settings = settings
        self.model = genai.GenerativeModel(settings.model)

    MAX_OUTPUT_TOKENS = 32768

    def extract(self, file_name: str, images: List[bytes]) -> DocResult:
        parts = [self.settings.prompt]
        for img in images:
            parts.append({"mime_type": "image/jpeg", "data": img})

        payload = None
        last_error = None
        for attempt in (1, 2):
            resp = self.model.generate_content(parts, generation_config={
                "temperature": 0.0,
                "response_mime_type": "application/json",
                "max_output_tokens": self.MAX_OUTPUT_TOKENS,
            })
            try:
                payload = self._parse(resp.text or "")
                break
            except ValueError as exc:            # JSON ขาด/เพี้ยน — ลองใหม่หนึ่งครั้ง
                last_error = exc
                parts[0] = self.settings.prompt + (
                    "\n\nIMPORTANT: your previous answer was not valid JSON. "
                    "Return ONE complete JSON object and nothing else."
                )
        if payload is None:
            raise ValueError("โมเดลตอบกลับไม่เป็น JSON ที่สมบูรณ์: {0}".format(last_error))

        doc = parse_payload(file_name, file_name, payload, len(images))
        if getattr(self.settings, "verify_marks", True):
            self._cross_verify(doc, images)
        return doc

    # ---- รอบสอง: อ่านเฉพาะช่องผลตรวจแล้วเทียบกับรอบแรก --------------------
    VERIFY_PROMPT = """Look ONLY at the three result groups of this table
(การสำเร็จการศึกษา / วันที่สำเร็จในเอกสาร / วุฒิฯ ที่สำเร็จในเอกสาร).

Each group is two cells split by a vertical line: left = สำเร็จ / ถูกต้อง,
right = ไม่สำเร็จ / ไม่ถูกต้อง. Decide from the tick's horizontal position only.
An empty pair of cells is null — never invent a tick.

Return STRICT JSON: {"rows":[{"row_no":int,"graduation":"pass"|"fail"|"unclear"|null,
"doc_date":"correct"|"incorrect"|"unclear"|null,"degree":"correct"|"incorrect"|"unclear"|null}]}"""

    def _cross_verify(self, doc, images: List[bytes]) -> None:
        """อ่านซ้ำเฉพาะเครื่องหมาย ถ้าสองรอบไม่ตรงกันให้ถือว่า unclear (บังคับเข้าคิว)"""
        parts = [self.VERIFY_PROMPT]
        for img in images:
            parts.append({"mime_type": "image/jpeg", "data": img})
        try:
            resp = self.model.generate_content(parts, generation_config={
                "temperature": 0.0,
                "response_mime_type": "application/json",
                "max_output_tokens": self.MAX_OUTPUT_TOKENS,
            })
            second = self._parse(resp.text or "")
        except (ValueError, Exception):          # noqa: BLE001 — รอบสองล้มไม่ควรทำให้ทั้งไฟล์ล้ม
            return

        by_row = {int(r.get("row_no", 0)): r for r in (second.get("rows") or [])}
        for row in doc.rows:
            other = by_row.get(row.row_no)
            if other is None:
                continue
            for field in ("graduation", "doc_date", "degree"):
                mine = getattr(row, field)
                theirs = other.get(field)
                if isinstance(theirs, str):
                    theirs = theirs.strip().lower() or None
                if mine != theirs:
                    setattr(row, field, "unclear")
                    row.confidence = min(row.confidence, 0.6)

    @staticmethod
    def _parse(text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            text = text.strip("`")
            text = text.split("\n", 1)[-1] if "\n" in text else text
        try:
            return json.loads(text)
        except ValueError:
            m = _JSON_BLOCK.search(text)
            if not m:
                raise ValueError("โมเดลไม่ได้ตอบกลับเป็น JSON")
            return json.loads(m.group(0))
