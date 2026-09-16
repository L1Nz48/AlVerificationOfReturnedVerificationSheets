"""วัดความแม่นยำของตัวอ่าน เทียบกับ data/ground_truth.json

python3 tools/eval_accuracy.py --provider gemini --model gemini-3.1-flash-lite
ผลสรุปเขียนลง eval_report/eval_data.csv
"""

import argparse
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import documents                     # noqa: E402
from app.ai import build_extractor            # noqa: E402
from app.config import Settings               # noqa: E402

FIELDS = ["student_id", "full_name", "faculty", "graduation", "doc_date", "degree", "note"]
DOC_FIELDS = ["form_type", "set_no", "school_code", "verifier_signed"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", default="gemini", choices=["gemini", "mock", "auto"])
    ap.add_argument("--model")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    truth_file = ROOT / "data" / "ground_truth.json"
    if not truth_file.exists():
        print("ยังไม่มี ground truth — รัน tools/make_samples.py ก่อน")
        return 1
    truth = {t["file"]: t for t in json.loads(truth_file.read_text(encoding="utf-8"))}

    s = Settings.load()
    s.ai_provider = args.provider
    if args.model:
        s.model = args.model
    extractor = build_extractor(s)

    hit = {f: 0 for f in FIELDS + DOC_FIELDS}
    total = {f: 0 for f in FIELDS + DOC_FIELDS}
    rows_out = []
    files = sorted((ROOT / "data" / "Inbox").glob("*.pdf"))
    if args.limit:
        files = files[:args.limit]

    for path in files:
        gt = truth.get(path.name)
        if not gt:
            continue
        images, pages = documents.to_images(path, s.max_image_px, s.jpeg_quality)
        doc = extractor.extract(path.name, images)

        for f in DOC_FIELDS:
            total[f] += 1
            got = getattr(doc, f)
            exp = gt.get(f)
            if f == "verifier_signed":
                ok = bool(got) == bool(exp)
            else:
                ok = (got or None) == (exp or None)
            hit[f] += int(ok)
            if not ok:
                rows_out.append([path.name, "-", f, exp, got, "MISS"])

        got_rows = {r.row_no: r for r in doc.rows}
        for exp_row in gt["rows"]:
            got = got_rows.get(exp_row["row_no"])
            for f in FIELDS:
                total[f] += 1
                g = getattr(got, f) if got else None
                e = exp_row.get(f)
                ok = (g or None) == (e or None)
                hit[f] += int(ok)
                if not ok:
                    rows_out.append([path.name, exp_row["row_no"], f, e, g, "MISS"])

        print("อ่าน {0}: {1} แถว (ground truth {2} แถว)".format(
            path.name, doc.row_count, len(gt["rows"])))

    print("\nความแม่นยำรายฟิลด์ (ตัวอ่าน: {0})".format(extractor.name))
    print("-" * 52)
    for f in DOC_FIELDS + FIELDS:
        if total[f]:
            print("{0:<18} {1:>5}/{2:<5} {3:>6.1f}%".format(f, hit[f], total[f], hit[f] / total[f] * 100))
    grand_h, grand_t = sum(hit.values()), sum(total.values())
    print("-" * 52)
    print("{0:<18} {1:>5}/{2:<5} {3:>6.1f}%".format("รวม", grand_h, grand_t, grand_h / max(grand_t, 1) * 100))

    out_dir = ROOT / "eval_report"
    out_dir.mkdir(exist_ok=True)
    with (out_dir / "eval_data.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "row_no", "field", "expected", "got", "result"])
        w.writerows(rows_out)
    print("รายการที่อ่านผิด {0} จุด → eval_report/eval_data.csv".format(len(rows_out)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
