"""ทดสอบกฎการตัดสิน (ขั้นที่ 7) — รันด้วย: python3 -m unittest discover -s tests"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import Settings                                          # noqa: E402
from app.models import (DocResult, RowResult, FORM_OTHER, FORM_SPU,      # noqa: E402
                        VERDICT_AUTO, VERDICT_EXCEPTION)
from app.rules import validate                                           # noqa: E402


def good_row(no=1, **kw):
    base = dict(row_no=no, student_id="68056100", full_name="นายวิชญ์ พลดี อินทร์",
                faculty="คณะนิเทศศาสตร์", graduation="pass", doc_date="correct",
                degree="correct", confidence=0.99)
    base.update(kw)
    return RowResult(**base)


def doc(rows, form_type=FORM_SPU, signed=True, name="จิรพร รัตนวิไล"):
    return DocResult(file_path="x.pdf", file_name="x.pdf", form_type=form_type, rows=rows,
                     verifier_signed=signed, verifier_name=name if signed else None,
                     doc_no="มหป.(ตทน) 01933/2569", set_no="68539",
                     school_name="โรงเรียนทดสอบ", school_code="00040384")


class FakeScms:
    def __init__(self, name="นายวิชญ์ พลดี อินทร์"):
        self.name = name

    def lookup(self, student_id, citizen_id=None):
        return {"full_name": self.name} if self.name else None


class RuleTests(unittest.TestCase):
    def setUp(self):
        self.s = Settings()
        self.s.cross_check_scms = False

    # ---- ผ่านอัตโนมัติ --------------------------------------------------
    def test_all_positive_auto_posts(self):
        d = validate(doc([good_row(1), good_row(2)]), self.s)
        self.assertEqual(d.verdict, VERDICT_AUTO)
        self.assertEqual(d.reasons, [])

    # ---- กฎบังคับ -------------------------------------------------------
    def test_other_form_always_fails(self):
        d = validate(doc([good_row()], form_type=FORM_OTHER), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertIn("ฟอร์มไม่ใช่แบบของมหาวิทยาลัย", d.reasons[0])

    def test_forgery_note_blocks_autopost(self):
        d = validate(doc([good_row(1, note="ปลอมแปลง")]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertTrue(any("นิติการ" in r for r in d.reasons))

    # ---- ลายมือชื่อผู้ตรวจสอบท้ายเอกสาร ---------------------------------
    def test_missing_verifier_signature(self):
        d = validate(doc([good_row()], signed=False), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertIn("ไม่พบลายมือชื่อผู้ตรวจสอบท้ายเอกสาร", d.reasons)

    def test_signature_without_name(self):
        d = validate(doc([good_row()], name=None), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)

    # ---- ผลตรวจ 3 กลุ่ม -------------------------------------------------
    def test_failed_graduation_goes_to_queue(self):
        d = validate(doc([good_row(1, graduation="fail")]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertTrue(d.rows[0].adverse)
        self.assertTrue(any("ผลตรวจเป็นลบ" in r for r in d.reasons))

    def test_incorrect_degree_goes_to_queue(self):
        d = validate(doc([good_row(1, degree="incorrect")]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertIn("วุฒิฯ ที่สำเร็จในเอกสาร = ไม่ถูกต้อง", d.rows[0].issues)

    def test_unmarked_group_goes_to_queue(self):
        d = validate(doc([good_row(1, doc_date=None)]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertTrue(any("ยังไม่ได้กา" in r for r in d.reasons))

    def test_unclear_mark_goes_to_queue(self):
        d = validate(doc([good_row(1, degree="unclear")]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertTrue(any("ไม่ชัด" in r for r in d.reasons))

    # ---- คุณภาพการอ่าน --------------------------------------------------
    def test_low_confidence_goes_to_queue(self):
        d = validate(doc([good_row(1), good_row(2, confidence=0.80)]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertEqual(d.readable_rows, 1)
        self.assertAlmostEqual(d.min_confidence, 0.80)

    def test_missing_student_id_goes_to_queue(self):
        d = validate(doc([good_row(1, student_id=None)]), self.s)
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)

    # ---- cross-check SCMS ----------------------------------------------
    def test_scms_name_match_passes(self):
        self.s.cross_check_scms = True
        d = validate(doc([good_row(1)]), self.s, FakeScms())
        self.assertEqual(d.verdict, VERDICT_AUTO)
        self.assertTrue(d.rows[0].scms_match)

    def test_scms_name_mismatch_goes_to_queue(self):
        self.s.cross_check_scms = True
        d = validate(doc([good_row(1)]), self.s, FakeScms("นางสาวชลธิชา แก้วกาญจน์"))
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertFalse(d.rows[0].scms_match)

    def test_unknown_student_goes_to_queue(self):
        self.s.cross_check_scms = True
        d = validate(doc([good_row(1)]), self.s, FakeScms(None))
        self.assertEqual(d.verdict, VERDICT_EXCEPTION)
        self.assertIn("ไม่พบรหัสนักศึกษานี้ใน SCMS", d.rows[0].issues)

    def test_small_ocr_slip_in_name_still_matches(self):
        self.s.cross_check_scms = True
        d = validate(doc([good_row(1, full_name="นายวิชญ์ พลดี อินทร")]), self.s, FakeScms())
        self.assertTrue(d.rows[0].scms_match)

    def test_title_prefix_ignored_in_name_match(self):
        self.s.cross_check_scms = True
        d = validate(doc([good_row(1, full_name="วิชญ์ พลดี อินทร์")]), self.s, FakeScms())
        self.assertTrue(d.rows[0].scms_match)


if __name__ == "__main__":
    unittest.main()
