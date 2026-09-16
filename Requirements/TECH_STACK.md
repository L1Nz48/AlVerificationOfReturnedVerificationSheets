# 🛠️ รายละเอียด Tech Stack — AI Document Assistant
> **ระบบผู้ช่วยจัดการเอกสาร กยศ. ด้วย AI (AI Document Assistant)**
> โครงสร้างเทคโนโลยี ไลบรารี และเครื่องมือทั้งหมดที่ใช้ในการพัฒนาระบบ

---

## 🏗️ ภาพรวมสถาปัตยกรรมระบบ (System Architecture)

ระบบถูกออกแบบเป็น **Hybrid Desktop Application (Local-first / Client-Server DB)** ที่ผสมผสานความเร็วและความเบาของ Desktop Native Bridge เข้ากับความยืดหยุ่นของ Web UI และความสามารถของ Multimodal AI

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│      HTML5 + CSS3 (Glassmorphism / Dark-Light) + ES6+ JS    │
└──────────────────────────────┬──────────────────────────────┘
                               │  window.pywebview.api (JSON-RPC)
┌──────────────────────────────▼──────────────────────────────┐
│                  Desktop & Bridge Layer                     │
│    Python 3.10+ / pywebview (WebView2 / WebKit) / Threading │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
┌──────────────▼──────────────┐┌──────────────▼───────────────┐
│     AI & Processing Engine  ││    Security & Database       │
│  - Google Gemini API        ││  - MySQL (InnoDB / utf8mb4)  │
│  - Pillow (Image Opt.)      ││  - PyMySQL + bcrypt (Hash)   │
│  - Rule & Validation Engine ││  - RBAC Permission System    │
└──────────────┬──────────────┘└──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────────────────────┐
│               Packaging & DevOps / CI/CD                    │
│   PyInstaller / Inno Setup / macOS DMG / GitHub Actions     │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. 🖥️ Frontend & UI Layer (ส่วนต่อประสานผู้ใช้)

หน้าต่างโปรแกรมทำงานด้วยเว็บเทคโนโลยี แล้วเรนเดอร์ผ่าน Native Webview ทำให้ได้หน้าตาที่ทันสมัย ลื่นไหล และปรับแต่งได้ระดับสูง

* **Core Web Technologies:**
  * **HTML5 (Semantic HTML):** โครงสร้างหน้าเว็บแบบ Single Page Application (SPA) แบ่งเป็น 4 หน้าหลัก:
    1. **Dashboard (หน้าหลัก):** สรุปผลสถิติ กราฟภาพรวม และสถานะการทำงาน
    2. **Process (ประมวลผลเอกสาร):** เมนูควบคุมการสแกน และแสดง Live Log แบบ Real-time
    3. **History (ประวัติการทำงาน):** ตรวจสอบบันทึกการทำงานย้อนหลัง พร้อม Signature Checklist Drawer
    4. **Settings (ตั้งค่าระบบ):** กำหนดค่า Gemini API Key, เส้นทางโฟลเดอร์ และตั้งค่าความปลอดภัย
  * **Vanilla JavaScript (ES6+):** จัดการ Application State, Tab Navigation, Dark/Light Theme Switching, Event Handling และการสื่อสาร Asynchronous กับ Python Backend
  * **Vanilla CSS3 (Custom Design System):**
    * **Design System & CSS Variables:** จัดการชุดสีและธีม Light/Dark Mode
    * **Modern Aesthetics:** Glassmorphism, Micro-animations, Progress Ring/Bar, Status Badges, Tooltips และ Custom Modals
    * **Layouts:** จัดโครงสร้างด้วย CSS Grid และ Flexbox รองรับ Responsive Layout
* **Typography & Fonts:**
  * **Google Fonts:** ฟอนต์ **Sarabun** (สำหรับเอกสารและเนื้อหาภาษาไทย) และ **Prompt** (สำหรับหัวข้อและ UI)
  * **Local Offline Fallback:** ฝังไฟล์ฟอนต์ไว้ในโฟลเดอร์ `fonts/` เพื่อให้แสดงผลได้ถูกต้องแม้ไม่มีอินเทอร์เน็ต
* **Iconography:**
  * **Vector SVG Icons:** ไอคอนแบบ Inline SVG คมชัดทุกขนาดหน้าจอโดยไม่ต้องพึ่งพา External Icon Font

---

## 2. 🔌 Application & Desktop Bridge Layer (สะพานเชื่อม Desktop กับ Web)

* **Programming Language:** **Python 3.10+** (รองรับและทดสอบบน Python 3.12)
* **Desktop Wrapper / Webview Engine:**
  * **`pywebview` (v6.2.1):** Desktop GUI Bridge ขนาดเล็ก (Lightweight) ไม่กินทรัพยากรเครื่องเหมือน Chromium/Electron
  * **Underlying Engines:**
    * **Windows:** Microsoft Edge WebView2 (`EdgeChromium`) ผ่านไลบรารี `pythonnet` (v3.0.4)
    * **macOS:** Apple WebKit Engine (`WKWebView`)
* **Two-way IPC / Bridge:**
  * **JS ➔ Python:** เรียกฟังก์ชันจากฝั่ง JavaScript ผ่าน `window.pywebview.api.<method>()`
  * **Python ➔ JS:** ส่งสถานะกลับมายัง UI แบบ Real-time (Live Logs, Progress Tracking, Notifications) ผ่าน `window.evaluate_js()`
* **Concurrency & Background Worker:**
  * **Python `threading.Thread`:** แยก Worker Thread สำหรับประมวลผลไฟล์เอกสาร และ Ticker Thread สำหรับจับเวลาแบบ Non-blocking ไม่ทำให้ GUI ค้าง
* **Legacy GUI (สำรอง):**
  * **`customtkinter` (v5.2.2):** GUI Desktop ดั้งเดิม (`main.py`) สำหรับกรณีที่ต้องการรันแบบ Standalone Tkinter

---

## 3. 🧠 AI, Vision & Document Processing (ระบบวิเคราะห์เอกสาร)

* **AI Model:**
  * **Google Gemini Multimodal API (`gemini-3.1-flash-lite` / `gemini-1.5-flash`):** วิเคราะห์ภาพถ่ายและเอกสาร PDF สแกนของแบบยืนยันการเบิกเงินกู้ยืม กยศ.
* **AI SDK:**
  * **`google-generativeai` (v0.8.3):** ไคลเอนต์ Python อย่างเป็นทางการสำหรับเชื่อมต่อ Gemini API
* **Image Processing & Optimization:**
  * **`Pillow` (PIL v11.0.0):**
    * ปรับขนาดภาพเอกสาร (Max Dimension 2048px / Retry 3072px)
    * บีบอัดภาพเป็น JPEG Quality 85 เพื่อลด Bandwidth และเพิ่มความเร็วในการส่ง API โดยไม่สูญเสียความคมชัด
    * รองรับนามสกุลไฟล์: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.heic`
* **Rule-Based Engine & Data Extraction:**
  * ดึงข้อมูลสำคัญตามโครงสร้าง:
    * **ชื่อ-นามสกุลผู้กู้ยืม**
    * **เลขบัตรประจำตัวประชาชน 13 หลัก** (ตรวจสอบโครงสร้างและ Cross-check ระหว่างหัวเอกสารกับเนื้อหา)
    * **ประเภทการกู้ยืม (Loan Type)**: Type1 (ลักษณะที่ 1), Type2, Type3, Type4
    * **การตรวจสอบลายมือชื่อ 5 จุด (Multi-Signature Verification)**:
      * *Mandatory (กรอบแดง):* ผู้กู้ยืมเงิน, พยานคนที่ 1, พยานคนที่ 2
      * *Optional (กรอบม่วง):* ผู้แทนโดยชอบธรรม/ผู้ปกครอง คนที่ 1 และ 2
    * **ข้อมูลทางการเงิน:** ค่าเล่าเรียน, ค่าครองชีพรายเดือน, จำนวนเดือน, ยอดรวมสุทธิ
* **File Operations & Organization:**
  * ค้นหาและสแกนโฟลเดอร์ต้นทาง (`NewDocs*`)
  * เปลี่ยนชื่อไฟล์อัตโนมัติ: `ชื่อ-นามสกุล_เลขบัตรประชาชน_ประเภทการกู้.pdf`
  * ย้ายเอกสารเข้าโฟลเดอร์ปลายทาง (`Type1/`, `Type2/`, `Type3/`, `Type4/` หรือ `Manual/`)
  * ป้องกันการเขียนทับไฟล์เดิมด้วยระบบ Auto-suffix เช่น `(1)`, `(2)`

---

## 4. 🔐 Security, Authentication & Database Layer (ระบบความปลอดภัยและฐานข้อมูล)

* **Database Management System (DBMS):**
  * **MySQL (InnoDB Engine):** สำหรับจัดเก็บข้อมูล Users, Roles, Permissions และ Sessions
  * **Character Set:** `utf8mb4` / `utf8mb4_unicode_ci` รองรับภาษาไทยสมบูรณ์
* **Database Driver:**
  * **`PyMySQL` (v1.1.1):** เชื่อมต่อฐานข้อมูล MySQL ผ่าน Context Manager (`DictCursor`) พร้อมระบบ Transaction Management
* **Cryptography & Security:**
  * **`bcrypt` (v4.2.1):** แฮชและตรวจสอบรหัสผ่านด้วย Salt Rounds
  * **UUID v4:** สร้างรหัส Session Token ป้องกันการคาดเดา
* **Role-Based Access Control (RBAC):**
  * กำหนดระดับสิทธิ์ตามบทบาท (เช่น `admin`, `officer`)
  * ควบคุมการเข้าถึงฟังก์ชันด้วย Python Decorators: `@require_role`, `@require_permission`
  * ซ่อน/แสดง เมนูและปุ่มควบคุมบนหน้าเว็บตามสิทธิ์ด้วย `data-require-permission`
* **Configuration Management:**
  * **`python-dotenv` (v1.0.1):** จัดการ Environment Variables จากไฟล์ `.env` เช่น `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `GEMINI_API_KEY`
* **Local Persistence (State & Cache):**
  * บันทึกการตั้งค่า, ประวัติการประมวลผลย้อนหลัง (History), และ Run State ในรูปแบบไฟล์ **JSON** ภายในเครื่อง

---

## 5. 📊 Evaluation & Accuracy Benchmarking (ระบบทดสอบและวัดผลความแม่นยำ)

* **`eval_accuracy.py`:** สคริปต์ Command-line Tool สำหรับทดสอบ Benchmark ความแม่นยำของ AI
* **Hash-based Ground Truth Matching:** ใช้ `hashlib.sha256` เทียบไฟล์กับชุดข้อมูลทดสอบใน `sample-pdf/`
* **Report Generator:** คำนวณความแม่นยำรายฟิลด์ (Precision/Accuracy) และสร้างรายงานผลสรุปเป็นไฟล์ CSV (`eval_report/eval_data.csv`)

---

## 6. 📦 Packaging, Installer & DevOps / CI/CD (การแปลงไฟล์และติดตั้ง)

* **Executable Bundler:**
  * **`PyInstaller` (v6.11.1):** รวมโปรแกรม Python และ Assets ทั้งหมด (`web/`, `fonts/`, `auth/`) เป็น Standalone Executable (`.exe` หรือ `.app`)
* **Installers & Deployment Tools:**
  * **Windows Inno Setup 6 (`installer/windows/setup.iss`):** สร้างตัวติดตั้ง `AI_Document_Assistant_Setup.exe` พร้อมช็อตคัตและตัวถอนการติดตั้งใน Control Panel
  * **Windows Batch Scripts (`install.bat`, `uninstall.bat`):** ตัวติดตั้งแบบ Portable สำหรับเครื่องที่มี Python Runtime
  * **macOS DMG Builder (`installer/mac/build_dmg.sh`):** สร้างไฟล์ `.dmg` แบบ Drag-to-Applications พร้อม Script ถอนการติดตั้ง
* **CI/CD & Cloud Build Automation:**
  * **GitHub Actions:**
    * `.github/workflows/build-windows.yml`: ทำการ Compile บน Windows Runner และสร้างทั้ง `.exe` + Setup Installer อัตโนมัติ
    * `.github/workflows/build-mac.yml`: ทำการ Build และแพ็ก `.dmg` บน macOS Runner อัตโนมัติ

---

## 📋 สรุปรายการ Dependencies & Tools (ตารางภาพรวม)

| หมวดหมู่ (Category) | เทคโนโลยี / ไลบรารี | เวอร์ชัน | หน้าที่หลัก |
| :--- | :--- | :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JS | ES6+ | ส่วนติดต่อผู้ใช้งาน (Dashboard SPA) |
| **Desktop Shell** | `pywebview` | `6.2.1` | ตัวเปิดหน้าต่าง Desktop Webview และเป็น Python-JS Bridge |
| **Windows Backend** | `pythonnet` | `3.0.4` | เชื่อมต่อ Microsoft Edge WebView2 บน Windows |
| **AI Vision API** | `google-generativeai` | `0.8.3` | เชื่อมต่อ Gemini Multimodal API เพื่ออ่านเอกสาร |
| **Image Processing** | `Pillow` | `11.0.0` | จัดการ/แปลง/ย่อขนาดไฟล์ภาพและเตรียมข้อมูลส่ง AI |
| **Database** | `PyMySQL` | `1.1.1` | ไคลเอนต์เชื่อมต่อ MySQL Database |
| **Security / Hash** | `bcrypt` | `4.2.1` | แฮชและตรวจสอบรหัสผ่านอย่างปลอดภัย |
| **Config Loader** | `python-dotenv` | `1.0.1` | อ่านค่าคอนฟิกจากไฟล์ `.env` |
| **Packaging** | `pyinstaller` | `6.11.1` | บิลด์โปรแกรมเป็น Standalone Executable (.exe / .app) |
| **Windows Installer** | Inno Setup | `6.x` | ตัวสร้างไฟล์ Setup Installer บน Windows |
| **CI/CD** | GitHub Actions | Workflows | ระบบ Build Artifacts (.exe, .dmg) อัตโนมัติบน Cloud |
