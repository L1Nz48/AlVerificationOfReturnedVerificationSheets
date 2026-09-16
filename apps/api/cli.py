"""รันไปป์ไลน์แบบไม่มีหน้าจอ — ใช้ทดสอบและรันเป็นงานเบื้องหลัง

ตัวอย่าง:
    python3 cli.py --source data/Inbox --provider mock
    python3 cli.py --queue                # ดูคิวที่รอเจ้าหน้าที่
    python3 cli.py --confirm 3            # ยืนยันเคสหมายเลข 3 เข้า SCMS
"""

import argparse
import sys
import time

from app.config import Settings
from app.pipeline import Pipeline
from app.storage import Storage

COLOR = {"INFO": "\033[36m", "AI": "\033[35m", "OK": "\033[32m",
         "WARN": "\033[33m", "ERROR": "\033[31m", "SCMS": "\033[95m"}
RESET = "\033[0m"


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="AI verification of returned verification sheets")
    p.add_argument("--source", help="โฟลเดอร์ต้นทาง")
    p.add_argument("--archive", help="โฟลเดอร์เก็บภาพต้นฉบับ")
    p.add_argument("--provider", choices=["auto", "gemini", "mock"], help="ตัวอ่านเอกสาร")
    p.add_argument("--model", help="ชื่อโมเดล Gemini เช่น gemini-3.1-flash-lite")
    p.add_argument("--live", action="store_true", help="ยิง SCMS จริง (ปิด dry-run)")
    p.add_argument("--queue", action="store_true", help="แสดงคิวที่รอเจ้าหน้าที่ตรวจ")
    p.add_argument("--confirm", type=int, metavar="DOC_ID", help="ยืนยันเคสเข้า SCMS")
    p.add_argument("--reject", type=int, metavar="DOC_ID", help="ส่งเคสกลับโรงเรียน")
    p.add_argument("--runs", action="store_true", help="แสดงประวัติรอบการทำงาน")
    args = p.parse_args(argv)

    settings = Settings.load()
    patch = {}
    if args.source:
        patch["source_dir"] = args.source
    if args.archive:
        patch["archive_dir"] = args.archive
    if args.provider:
        patch["ai_provider"] = args.provider
    if args.model:
        patch["model"] = args.model
    if args.live:
        patch["dry_run"] = False
    if patch:
        settings.update(patch)

    storage = Storage(settings)
    pipe = Pipeline(settings, storage)
    print("ฐานข้อมูล: {0} · ตัวอ่าน: {1} · dry-run: {2}".format(
        storage.backend, settings.ai_provider, settings.dry_run))

    if args.queue:
        return _print_queue(storage)
    if args.runs:
        return _print_runs(storage)
    if args.confirm:
        print(pipe.confirm_case(args.confirm, [], operator="cli"))
        return 0
    if args.reject:
        print(pipe.reject_case(args.reject, "ส่งกลับจาก CLI", operator="cli"))
        return 0

    res = pipe.start(operator="cli")
    if not res.get("ok"):
        print("เริ่มไม่ได้:", res.get("error"))
        return 1

    while pipe.running or not pipe.events.empty():
        for ev in pipe.drain():
            _print_event(ev)
        time.sleep(0.05)
    for ev in pipe.drain():
        _print_event(ev)

    run = pipe.run
    print("\nสรุป: ทั้งหมด {0} · ผ่านอัตโนมัติ {1} · เข้าคิว {2} · บันทึกเข้า SCMS {3}".format(
        run.total, run.auto, run.exception, run.posted))
    storage.close()
    return 0


def _print_event(ev: dict) -> None:
    if ev["kind"] == "log":
        c = COLOR.get(ev["group"], "")
        print("{0}  {1}[{2}]{3} {4}".format(ev["ts"], c, ev["group"], RESET, ev["message"]))
    elif ev["kind"] == "step":
        print("{0}  \033[90m→ ขั้นที่ {1} {2} ({3}/{4})\033[0m".format(
            ev["ts"], ev["step"], ev["name"], ev["index"], ev["total"]))


def _print_queue(storage: Storage) -> int:
    q = storage.queue()
    if not q:
        print("ไม่มีเคสค้างในคิว")
        return 0
    for d in q:
        print("#{0}  {1}  [{2}]  แถว {3} · อ่านได้ {4} · conf ต่ำสุด {5:.0%}".format(
            d["id"], d["file_name"], d["form_type"], d["row_count"],
            d["readable_rows"], d["min_confidence"] or 0))
        for r in d["reasons"]:
            print("      - {0}".format(r))
    return 0


def _print_runs(storage: Storage) -> int:
    for r in storage.list_runs(20):
        print("รอบที่ {0}  {1} → {2}  ทั้งหมด {3} · อัตโนมัติ {4} · คิว {5} · SCMS {6}  [{7}]".format(
            r["id"], r["started_at"], r["finished_at"] or "-", r["total"],
            r["auto"], r["exception"], r["posted"], r["status"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
