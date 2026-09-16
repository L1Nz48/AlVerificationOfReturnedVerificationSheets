"""เปิดโปรแกรมแบบเดสก์ท็อป (pywebview) — โหลด UI จากโฟลเดอร์ web/"""

import sys
from pathlib import Path

import webview

from app.api import Api

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "web" / "index.html"


def main() -> int:
    if not INDEX.exists():
        print("ไม่พบไฟล์ UI ที่ {0}".format(INDEX))
        return 1

    api = Api()
    window = webview.create_window(
        "ระบบตรวจสอบแบบยืนยันฯ อัตโนมัติ — SPU",
        str(INDEX),
        js_api=api,
        width=1440,
        height=920,
        min_size=(1100, 720),
    )
    api.window = window
    webview.start(debug="--debug" in sys.argv)
    api.storage.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
