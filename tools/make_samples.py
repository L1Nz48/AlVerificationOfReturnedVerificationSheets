"""สร้าง PDF ตัวอย่างเลียนแบบเอกสารจริง "บัญชีรายชื่อนักศึกษา (ขอตรวจสอบวุฒิ)"

python3 tools/make_samples.py --count 8 --out data/Inbox
"""

import argparse
import json
import random
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "fonts" / "Sarabun-Regular.ttf"
FONT_BOLD = ROOT / "fonts" / "Sarabun-Bold.ttf"

SCHOOLS = [
    ("โรงเรียนเฉลิมพระเกียรติสมเด็จพระศรีนครินทร์ กาญจนบุรี", "00040384"),
    ("โรงเรียนสตรีวิทยา", "00010112"),
    ("โรงเรียนสวนกุหลาบวิทยาลัย", "00010101"),
    ("โรงเรียนหอวัง", "00010455"),
    ("โรงเรียนบดินทรเดชา (สิงห์ สิงหเสนี)", "00010233"),
]
FACULTIES = ["คณะนิเทศศาสตร์", "คณะบริหารธุรกิจ", "คณะวิศวกรรมศาสตร์", "คณะบัญชี",
             "คณะนิติศาสตร์", "คณะศิลปศาสตร์", "คณะเทคโนโลยีสารสนเทศ",
             "คณะสถาปัตยกรรมศาสตร์", "คณะการท่องเที่ยวและการบริการ", "คณะวิทยาการสารสนเทศ"]
FIRST = ["วิชญ์", "กมลวรรณ", "ณัฐวุฒิ", "ปิยธิดา", "ธนภัทร", "อริสรา", "กฤษฎา",
         "ชลธิชา", "ภาคิน", "สุพิชญา", "ปุณยวีร์", "ธีรภัทร", "ญาณิศา"]
LAST = ["พลดี อินทร์", "รัตนโกมล", "ศรีสุวรรณ", "มณีนิล", "วงศ์สวัสดิ์", "ทองมาก",
        "เลิศพิบูลย์", "แก้วกาญจน์", "จันทร์ประเสริฐ", "นาคะศรี", "อินทรสุข"]
VERIFIERS = [("จิรพร รัตนวิไล", "จนท."), ("สมชาย ใจกว้าง", "หัวหน้างานทะเบียน"),
             ("วรรณา ศรีสุข", "เจ้าหน้าที่ทะเบียน")]

# ตำแหน่ง x ของคอลัมน์: (x, width)
C_NO    = (46, 40)
C_SID   = (86, 78)
C_NAME  = (164, 108)
C_FAC   = (272, 104)
GROUPS  = [(376, 40, 40), (456, 40, 40), (536, 40, 40)]   # (x, w_yes, w_no)
C_NOTE  = (616, 84)
ROW_H = 34


def tick(page, x, y, w, rng):
    """ขีด / แบบลายมือในช่อง"""
    x0 = x + w * 0.3 + rng.uniform(-3, 3)
    y0 = y + ROW_H * 0.72
    page.draw_line(fitz.Point(x0, y0), fitz.Point(x0 + 11, y0 - 15),
                   color=(.12, .2, .6), width=1.4)


def build(path: Path, rng: random.Random, directory: list) -> dict:
    doc = fitz.open()
    page = doc.new_page(width=744, height=1052)          # ~A4 แนวตั้ง
    page.insert_font(fontname="th", fontfile=str(FONT))
    page.insert_font(fontname="thb", fontfile=str(FONT_BOLD))

    school, code = rng.choice(SCHOOLS)
    is_other_form = rng.random() < .15
    doc_no = "มหป.(ตทน) {0:05d}/2569".format(rng.randint(1000, 99999))
    set_no = str(rng.randint(60000, 69999))

    # ---- หัวเอกสาร ----------------------------------------------------
    if is_other_form:
        page.insert_text((250, 70), "บัญชีรายชื่อผู้สำเร็จการศึกษา", fontname="thb", fontsize=15)
        page.insert_text((280, 92), "({0})".format(school), fontname="th", fontsize=10)
    else:
        page.insert_text((300, 70), "มหาวิทยาลัยศรีปทุม", fontname="thb", fontsize=15)
        page.insert_text((305, 92), "บัญชีรายชื่อนักศึกษา", fontname="thb", fontsize=15)
        page.insert_text((110, 130), "ขอตรวจสอบวุฒิ ชื่อโรงเรียน/สถาบัน {0} ({1})".format(school, code),
                         fontname="th", fontsize=10)
        page.insert_text((60, 162), "ที่ {0}".format(doc_no), fontname="th", fontsize=11)
        page.insert_text((60, 184), "ชุดที่ {0}".format(set_no), fontname="th", fontsize=11)

    page.insert_text((60, 224), "โปรดทำเครื่องหมาย ✓ ในช่องที่ตรงกับผลการตรวจสอบ", fontname="th", fontsize=9.5)

    # ---- หัวตาราง -----------------------------------------------------
    y = 240
    head_h = 56
    def box(x, w, h, yy=y):
        page.draw_rect(fitz.Rect(x, yy, x + w, yy + h), color=(.25, .25, .3), width=.7)

    for x, w, label in [(C_NO[0], C_NO[1], "ลำดับ"), (C_SID[0], C_SID[1], "รหัส\nนักศึกษา"),
                        (C_NAME[0], C_NAME[1], "ชื่อ-สกุล"), (C_FAC[0], C_FAC[1], "คณะ/วิทยาลัย")]:
        box(x, w, head_h)
        for k, line in enumerate(label.split("\n")):
            page.insert_text((x + 5, y + 26 + k * 12), line, fontname="thb", fontsize=8)

    gx0 = GROUPS[0][0]
    gw = sum(g[1] + g[2] for g in GROUPS)
    box(gx0, gw, 18)
    page.insert_text((gx0 + gw / 2 - 42, y + 13), "ผลการตรวจสอบวุฒิ", fontname="thb", fontsize=8)
    for (gx, wy, wn), title, yes, no in zip(
            GROUPS,
            ["การสำเร็จการศึกษา", "วันที่สำเร็จในเอกสาร", "วุฒิฯ ที่สำเร็จในเอกสาร"],
            ["สำเร็จ", "ถูกต้อง", "ถูกต้อง"], ["ไม่สำเร็จ", "ไม่ถูกต้อง", "ไม่ถูกต้อง"]):
        box(gx, wy + wn, 20, y + 18)
        page.insert_text((gx + 3, y + 32), title, fontname="thb", fontsize=6.5)
        box(gx, wy, 18, y + 38)
        box(gx + wy, wn, 18, y + 38)
        page.insert_text((gx + 5, y + 50), yes, fontname="th", fontsize=6.5)
        page.insert_text((gx + wy + 3, y + 50), no, fontname="th", fontsize=6.5)

    box(C_NOTE[0], C_NOTE[1], head_h)
    page.insert_text((C_NOTE[0] + 20, y + 32), "หมายเหตุ", fontname="thb", fontsize=8)
    y += head_h

    # ---- แถวข้อมูล ----------------------------------------------------
    n = rng.randint(6, 10)
    forged_from = rng.randint(n // 2 + 1, n) if rng.random() < .45 else n + 1
    rows_meta = []

    for i in range(1, n + 1):
        sid = "68{0:06d}".format(rng.randint(50000, 59999))
        name = "{0}{1} {2}".format(rng.choice(["นาย", "นางสาว"]), rng.choice(FIRST), rng.choice(LAST))
        faculty = rng.choice(FACULTIES)
        directory.append({"student_id": sid, "full_name": name, "faculty": faculty})

        forged = i >= forged_from
        skip_tick = (not forged) and rng.random() < .07     # เจ้าหน้าที่ลืมกาบางช่อง

        for x, w, text, size in [(C_NO[0], C_NO[1], str(i), 8),
                                 (C_SID[0], C_SID[1], sid, 8),
                                 (C_NAME[0], C_NAME[1], name, 7.5),
                                 (C_FAC[0], C_FAC[1], faculty, 7)]:
            box(x, w, ROW_H)
            page.insert_text((x + 4, y + 20), text, fontname="th", fontsize=size)

        for gi, (gx, wy, wn) in enumerate(GROUPS):
            box(gx, wy, ROW_H)
            box(gx + wy, wn, ROW_H)
            if skip_tick and gi == 1:
                continue
            if forged:
                tick(page, gx + wy, y, wn, rng)             # กาช่องลบ
            else:
                tick(page, gx, y, wy, rng)

        box(C_NOTE[0], C_NOTE[1], ROW_H)
        note = "ปลอมแปลง" if forged else "-"
        page.insert_text((C_NOTE[0] + 6, y + 21), note, fontname="th", fontsize=8,
                         color=(.12, .2, .6) if forged else (0, 0, 0))

        rows_meta.append({"row_no": i, "student_id": sid, "full_name": name, "faculty": faculty,
                          "graduation": "fail" if forged else "pass",
                          "doc_date": None if skip_tick else ("incorrect" if forged else "correct"),
                          "degree": "incorrect" if forged else "correct",
                          "note": "ปลอมแปลง" if forged else None})
        y += ROW_H

    page.insert_text((60, y + 18), '*กรณีเลือก "ไม่สำเร็จ, ไม่ถูกต้อง" ให้ระบุเหตุผลเจ้าของเอกสาร',
                     fontname="th", fontsize=8)

    # ---- ท้ายเอกสาร: ลายมือชื่อผู้ตรวจสอบ -------------------------------
    vname, vpos = rng.choice(VERIFIERS)
    signed = rng.random() > .12
    page.insert_text((250, y + 62), "ตรวจสอบและตรวจทานความถูกต้องแล้ว", fontname="th", fontsize=9.5)
    page.insert_text((210, y + 96), "ลงชื่อ..................................................ผู้ตรวจสอบ",
                     fontname="th", fontsize=10)
    if signed:
        page.insert_text((262, y + 92), vname.split()[0], fontname="th", fontsize=12, color=(.12, .2, .6))
        page.insert_text((252, y + 118), vname, fontname="th", fontsize=9, color=(.12, .2, .6))
        page.insert_text((252, y + 142), vpos, fontname="th", fontsize=9, color=(.12, .2, .6))
    page.insert_text((228, y + 120), "(..............................................................)",
                     fontname="th", fontsize=10)
    page.insert_text((215, y + 144), "ตำแหน่ง.......................................", fontname="th", fontsize=10)

    doc.save(str(path))
    doc.close()
    return {"file": path.name, "form_type": "other" if is_other_form else "spu",
            "doc_no": doc_no, "set_no": set_no, "school_name": school, "school_code": code,
            "verifier_signed": signed, "verifier_name": vname if signed else None,
            "rows": rows_meta}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=8)
    ap.add_argument("--out", default=str(ROOT / "data" / "Inbox"))
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)
    directory: list = []
    truth: list = []

    for i in range(1, args.count + 1):
        path = out / "VERIFY-2569-{0:03d}.pdf".format(i)
        truth.append(build(path, rng, directory))
        print("สร้าง", path)

    (ROOT / "data" / "scms_students.json").write_text(
        json.dumps(directory, ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "data" / "ground_truth.json").write_text(
        json.dumps(truth, ensure_ascii=False, indent=2), encoding="utf-8")
    print("เขียนทะเบียนอ้างอิง {0} รายการ + ground truth".format(len(directory)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
