import { usePanel } from "../state/panel";
import { useApp } from "../state/store";
import type { Page } from "../types";
import HelpPanel from "./panels/HelpPanel";

const META: Record<Page, [string, string, string]> = {
  dashboard: ["ขั้นที่ 3–10", "หน้าหลัก", "ภาพรวมการทำงานของระบบอัตโนมัติ (AI / RPA)"],
  process: ["ขั้นที่ 3–7", "ประมวลผลเอกสาร", "รับไฟล์ → ตรวจชนิดฟอร์ม → OCR → AI อ่านเครื่องหมาย → ตรวจตามกฎ"],
  queue: ["ขั้นที่ 8–9", "คิวตรวจสอบ (Exception)", "เจ้าหน้าที่เทียบภาพต้นฉบับกับค่าที่ AI อ่านได้ แล้วยืนยันหรือแก้ไข"],
  history: ["ย้อนหลัง", "ประวัติการทำงาน", "รอบการประมวลผลย้อนหลัง พร้อม Audit Trail"],
  settings: ["ตั้งค่า", "ตั้งค่าระบบ", "โมเดล AI · เกณฑ์การตัดสิน · พร็อมท์ · การเชื่อมต่อ SCMS"],
};

export default function Header() {
  const { state } = useApp();
  const { openPanel } = usePanel();
  const [step, title, sub] = META[state.page];

  return (
    <header className="hdr">
      <span className="hdr-step">{step}</span>
      <div>
        <div className="hdr-title">{title}</div>
        <div className="hdr-sub">{sub}</div>
      </div>

      <div className="telemetry">
        <div className="tm live"><span className="tm-k">สถานะ</span><span className="tm-v">{state.running ? "ทำงาน" : state.docs.length ? "เสร็จแล้ว" : "พร้อม"}</span></div>
        <div className="tm"><span className="tm-k">ชุดเอกสาร</span><span className="tm-v">{state.docs.length}</span></div>
        <div className="tm warn"><span className="tm-k">รอตรวจ</span><span className="tm-v">{state.queue.length}</span></div>
        <div className="tm ok"><span className="tm-k">โหมด</span><span className="tm-v">Prototype</span></div>
        <div className="hdr-tools">
          <button className="tool" title="คำอธิบายขอบเขตระบบ" onClick={() => openPanel("ขอบเขตของโปรแกรม", "เทียบกับ To-Be End-to-End Flow", <HelpPanel />)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M9.6 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.7" /><path d="M12 17h.01" /></svg>
          </button>
        </div>
      </div>
    </header>
  );
}
