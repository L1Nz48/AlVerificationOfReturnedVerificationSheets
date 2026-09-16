"""ขั้นที่ 7 — Rule & Validation Engine (อิงเอกสาร "บัญชีรายชื่อนักศึกษา — ขอตรวจสอบวุฒิ")

Auto-Post ได้ต่อเมื่อทุกข้อต่อไปนี้จริง:
  * เป็นแบบฟอร์มของมหาวิทยาลัย
  * มีลายมือชื่อผู้ตรวจสอบท้ายเอกสาร
  * ทุกแถวกาครบทั้ง 3 กลุ่ม และผลเป็นบวกทั้งหมด (สำเร็จ / ถูกต้อง / ถูกต้อง)
  * ไม่มีหมายเหตุที่ส่อว่าปลอมแปลง
  * confidence ทุกแถวถึงเกณฑ์ และ cross-check รหัสนักศึกษากับ SCMS ผ่าน

กฎบังคับตาม Sequence Diagram (ปิดไม่ได้):
  * ฟอร์มที่ไม่ใช่ของมหาวิทยาลัย  -> ไม่ผ่านเกณฑ์ทันที ส่งเจ้าหน้าที่ตรวจ 100%
  * หมายเหตุที่ส่อว่า "ปลอมแปลง" -> ห้าม Auto-Post ต้องส่งนิติการเสมอ
"""

import difflib
from typing import Optional

from .config import Settings
from .models import (ADVERSE, DocResult, FORM_OTHER, GROUPS, GROUP_LABEL,
                     UNCLEAR, VERDICT_AUTO, VERDICT_EXCEPTION)
from .scms import ScmsClient

NEGATIVE_LABEL = {"fail": "ไม่สำเร็จ", "incorrect": "ไม่ถูกต้อง"}


def validate(doc: DocResult, settings: Settings, scms: Optional[ScmsClient] = None) -> DocResult:
    reasons = []

    # --- กฎบังคับ 1: ต้องเป็นฟอร์มของมหาวิทยาลัย ------------------------
    if doc.form_type == FORM_OTHER and settings.school_form_always_fails:
        reasons.append("ฟอร์มไม่ใช่แบบของมหาวิทยาลัย — ไม่ผ่านเกณฑ์ทันที ส่งเจ้าหน้าที่ตรวจ 100%")

    # --- ลายมือชื่อผู้ตรวจสอบท้ายเอกสาร (จุดเดียว) ----------------------
    if not doc.verifier_signed:
        reasons.append("ไม่พบลายมือชื่อผู้ตรวจสอบท้ายเอกสาร")
    elif not doc.verifier_name:
        reasons.append("มีลายมือชื่อผู้ตรวจสอบ แต่อ่านชื่อในวงเล็บไม่ได้")

    if not doc.rows:
        reasons.append("อ่านตารางรายชื่อไม่ได้เลย")

    low_conf = 0
    unmarked = 0
    unclear = 0
    adverse = 0
    forged = 0
    conflict = 0
    mismatch = 0
    missing_id = 0

    for row in doc.rows:
        row.issues = []

        if row.confidence < settings.min_confidence:
            row.issues.append("confidence ต่ำกว่าเกณฑ์")
            low_conf += 1
        if not row.student_id:
            row.issues.append("อ่านรหัสนักศึกษาไม่ได้")
            missing_id += 1

        # --- ผลตรวจ 3 กลุ่ม ------------------------------------------
        for g in GROUPS:
            v = getattr(row, g)
            if v is None:
                row.issues.append("ไม่ได้กาช่อง{0}".format(GROUP_LABEL[g]))
                unmarked += 1
            elif v == UNCLEAR:
                row.issues.append("กาช่อง{0} ไม่ชัด".format(GROUP_LABEL[g]))
                unclear += 1
            elif v in ADVERSE:
                row.issues.append("{0} = {1}".format(GROUP_LABEL[g], NEGATIVE_LABEL[v]))
        if row.adverse:
            adverse += 1

        # --- ขั้นที่ 5: cross-check รหัสนักศึกษากับ SCMS ----------------
        if settings.cross_check_scms and scms is not None and row.student_id:
            person = scms.lookup(row.student_id, None)
            if person is None:
                row.scms_match = False
                row.issues.append("ไม่พบรหัสนักศึกษานี้ใน SCMS")
                mismatch += 1
            else:
                row.scms_name = person.get("full_name")
                score = _name_score(row.full_name, person.get("full_name"))
                row.scms_match = score >= settings.name_match_threshold
                if not row.scms_match:
                    row.issues.append("ชื่อ-สกุลไม่ตรงกับข้อมูลใน SCMS (ความคล้าย {0:.0%})".format(score))
                    mismatch += 1

        # --- กฎบังคับ 2: หมายเหตุส่อปลอมแปลง ---------------------------
        note = row.note or ""
        if settings.forgery_note_blocks_autopost and any(k in note for k in settings.forgery_keywords):
            row.issues.append("หมายเหตุระบุการปลอมแปลง — ต้องส่งนิติการ")
            forged += 1

        # --- กันการอ่านช่องผิดข้าง ---------------------------------------
        # ฟอร์มกำหนดให้ระบุเหตุผลเมื่อเลือก "ไม่สำเร็จ / ไม่ถูกต้อง"
        # ถ้ามีหมายเหตุแต่ผลตรวจกลับเป็นบวกทั้งหมด แปลว่าอ่านผิดข้างหรือกรอกขัดกัน
        if note and not row.adverse:
            row.issues.append("มีหมายเหตุแต่ผลตรวจเป็นบวกทั้งหมด — ต้องให้เจ้าหน้าที่ยืนยัน")
            conflict += 1

    doc.readable_rows = sum(1 for r in doc.rows if r.confidence >= settings.min_confidence)
    doc.min_confidence = min((r.confidence for r in doc.rows), default=0.0)

    if forged:
        reasons.append("พบหมายเหตุระบุการปลอมแปลง {0} แถว — ห้าม Auto-Post ต้องส่งนิติการ".format(forged))
    if conflict:
        reasons.append("มีหมายเหตุแต่ผลตรวจเป็นบวก {0} แถว — อาจอ่านช่องผิดข้าง ต้องให้เจ้าหน้าที่ยืนยัน".format(conflict))
    if adverse:
        reasons.append("มีผลตรวจเป็นลบ (ไม่สำเร็จ / ไม่ถูกต้อง) {0} แถว — ต้องให้เจ้าหน้าที่ดำเนินการ".format(adverse))
    if unmarked:
        reasons.append("มีช่องผลตรวจที่ยังไม่ได้กา {0} ช่อง".format(unmarked))
    if unclear:
        reasons.append("กาเครื่องหมายไม่ชัด {0} ช่อง".format(unclear))
    if low_conf:
        reasons.append("มี {0} แถวที่ confidence ต่ำกว่าเกณฑ์ {1:.0%}".format(low_conf, settings.min_confidence))
    if missing_id:
        reasons.append("อ่านรหัสนักศึกษาไม่ได้ {0} แถว".format(missing_id))
    if mismatch:
        reasons.append("ข้อมูลไม่ตรงกับ SCMS {0} แถว".format(mismatch))
    if settings.require_all_rows and doc.rows and doc.readable_rows < doc.row_count:
        reasons.append("อ่านได้ไม่ครบทุกแถว ({0}/{1})".format(doc.readable_rows, doc.row_count))

    doc.reasons = reasons
    doc.verdict = VERDICT_AUTO if not reasons else VERDICT_EXCEPTION
    return doc


def _name_score(a: Optional[str], b: Optional[str]) -> float:
    """ความคล้ายของชื่อ 0..1 — ผ่อนให้ OCR พลาดสระ/วรรณยุกต์ได้เล็กน้อย

    ตัดคำนำหน้าออกก่อนเทียบ เพราะเอกสารกับ SCMS มักใส่ไม่ตรงกัน
    """
    def norm(s):
        if not s:
            return ""
        for t in ("นางสาว", "นาย", "นาง", "น.ส."):
            s = s.replace(t, "")
        return "".join(s.split())
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    return difflib.SequenceMatcher(None, na, nb).ratio()
