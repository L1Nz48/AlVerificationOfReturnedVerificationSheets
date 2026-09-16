# Tech stack และสถาปัตยกรรมเป้าหมาย

**สถานะปัจจุบัน:** เว็บไซต์ใน `apps/web` เป็น prototype ที่ทำงานในเบราว์เซอร์ล้วน ใช้ข้อมูลจำลองใน `localStorage` และ deploy เป็น static site บน Netlify แผนภาพด้านล่างเป็นสถาปัตยกรรมของระบบจริงในอนาคต ไม่ใช่เส้นทางทำงานของ prototype

```text
Browser (React + TypeScript + Vite)
                │ HTTP /api
                ▼
FastAPI (Python) ── pipeline/rules ── Gemini หรือ mock
       │                  │
       └── SQLite/MySQL   └── SCMS API หรือ local mock
```

- **Monorepo:** npm workspaces สำหรับ `apps/web`; Python API อยู่ใน `apps/api` และใช้ `requirements.txt` แยกต่างหาก
- **Frontend:** React 19, TypeScript, Vite 8, CSS เดิมของระบบ หน้าหลักคือ Dashboard, Process, Queue, History, Settings
- **Backend:** FastAPI และ Uvicorn ครอบ service/pipeline เดิมเป็น REST API
- **ข้อมูล:** SQLite เป็นค่าเริ่มต้น; ใช้ MySQL ได้ตามตัวแปรใน `.env`; ไฟล์ตั้งค่าและฐานข้อมูลอยู่ใน `APP_DATA_DIR`
- **AI/เอกสาร:** Gemini ผ่าน `google-generativeai`, PyMuPDF และ Pillow; มี mock provider สำหรับพัฒนา
- **การเชื่อมต่อ:** SCMS API หรือ local mock; โหมด `dry_run` เป็นค่าเริ่มต้น
- **Production:** build เว็บแล้วให้ FastAPI เสิร์ฟจาก origin เดียวกัน ต้องเพิ่มการยืนยันตัวตนและสิทธิ์ก่อนเผยแพร่บนเครือข่าย

โค้ดเดสก์ท็อปเดิมเก็บไว้ที่ `legacy/desktop` และไม่ได้อยู่ในเส้นทางรันเว็บไซต์
