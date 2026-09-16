"""ตัวอ่านจำลอง — ใช้ทดสอบ/สาธิตโดยไม่เรียก API จริง

ผลลัพธ์ผูกกับชื่อไฟล์ (deterministic) เพื่อให้ทดสอบซ้ำได้ผลเดิม
"""

import hashlib
import json
import random
from typing import List

from ..config import ROOT, Settings
from ..models import DocResult
from .base import Extractor, parse_payload

DIRECTORY_FILE = ROOT / "data" / "scms_students.json"

SCHOOLS = [
    ("โรงเรียนเฉลิมพระเกียรติสมเด็จพระศรีนครินทร์ กาญจนบุรี", "00040384"),
    ("โรงเรียนสตรีวิทยา", "00010112"),
    ("โรงเรียนสวนกุหลาบวิทยาลัย", "00010101"),
    ("โรงเรียนหอวัง", "00010455"),
    ("โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)", "00010233"),
]
FACULTIES = ["คณะนิเทศศาสตร์", "คณะบริหารธุรกิจ", "คณะวิศวกรรมศาสตร์", "คณะบัญชี",
             "คณะนิติศาสตร์", "คณะศิลปศาสตร์", "คณะเทคโนโลยีสารสนเทศ", "คณะสถาปัตยกรรมศาสตร์"]
NAMES = ["นายวิชญ์ พลดี อินทร์", "นางสาวกมลวรรณ รัตนโกมล", "นายณัฐวุฒิ ศรีสุวรรณ",
         "นางสาวปิยธิดา มณีนิล", "นายธนภัทร วงศ์สวัสดิ์", "นางสาวอริสรา ทองมาก",
         "นายกฤษฎา เลิศพิบูลย์", "นางสาวชลธิชา แก้วกาญจน์", "นายภาคิน จันทร์ประเสริฐ",
         "นางสาวสุพิชญา นาคะศรี"]
VERIFIERS = [("จิรพร รัตนวิไล", "จนท."), ("สมชาย ใจกว้าง", "หัวหน้างานทะเบียน"),
             ("วรรณา ศรีสุข", "เจ้าหน้าที่ทะเบียน")]


def _directory() -> list:
    """ถ้ามีทะเบียนอ้างอิง ให้หยิบคนจริงมาใช้ เพื่อให้ cross-check ขั้นที่ 5 ผ่านได้"""
    if not DIRECTORY_FILE.exists():
        return []
    try:
        return json.loads(DIRECTORY_FILE.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return []


class MockExtractor(Extractor):
    name = "mock"

    def __init__(self, settings: Settings):
        self.settings = settings

    def extract(self, file_name: str, images: List[bytes]) -> DocResult:
        seed = int(hashlib.sha256(file_name.encode("utf-8")).hexdigest()[:8], 16)
        rng = random.Random(seed)

        roll = rng.random()
        kind = ("other-form" if roll < .10 else "forged" if roll < .28
                else "low-conf" if roll < .42 else "mismatch" if roll < .50 else "ok")

        people = _directory()
        school, code = rng.choice(SCHOOLS)
        n = rng.randint(5, 10)
        bad_row = rng.randint(1, n)
        rows = []

        for i in range(1, n + 1):
            bad = kind != "ok" and (i == bad_row or rng.random() < .18)
            conf = round(rng.uniform(.55, .89) if (bad and kind == "low-conf") else rng.uniform(.96, 1.0), 3)

            if people:
                person = rng.choice(people)
                sid, name, faculty = person["student_id"], person["full_name"], person.get("faculty")
                if kind == "mismatch" and bad:
                    name = rng.choice([x for x in NAMES if x != name])
            else:
                sid, name, faculty = str(rng.randint(68000000, 68999999)), rng.choice(NAMES), None

            graduation, doc_date, degree, note = "pass", "correct", "correct", None
            if bad and kind == "forged":
                graduation, doc_date, degree, note = "fail", "incorrect", "incorrect", "ปลอมแปลง"
            elif bad and kind == "low-conf" and rng.random() < .5:
                degree = "unclear"
            elif bad and rng.random() < .25:
                doc_date = None                       # ลืมกา

            rows.append({
                "row_no": i, "student_id": sid, "full_name": name,
                "faculty": faculty or rng.choice(FACULTIES),
                "graduation": graduation, "doc_date": doc_date, "degree": degree,
                "note": note, "confidence": conf, "source_page": 1,
            })

        vname, vpos = rng.choice(VERIFIERS)
        signed = not (kind != "ok" and rng.random() < .15)
        payload = {
            "form_type": "other" if kind == "other-form" else "spu",
            "doc_no": "มหป.(ตทน) {0}/2569".format(rng.randint(1000, 9999)),
            "set_no": str(rng.randint(60000, 69999)),
            "school_name": school, "school_code": code,
            "verifier_signed": signed,
            "verifier_name": vname if signed else None,
            "verifier_position": vpos if signed else None,
            "rows": rows,
        }
        return parse_payload(file_name, file_name, payload, max(1, len(images)))
