import { useApp } from "../state/store";
import type { Page } from "../types";

const ITEMS: { page: Page; cap: string; icon: React.ReactNode; badge?: boolean }[] = [
  {
    page: "dashboard", cap: "หน้าหลัก",
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  },
  {
    page: "process", cap: "ประมวลผลเอกสาร",
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 15 2 2 4-4" /></svg>,
  },
  {
    page: "queue", cap: "คิวตรวจสอบ", badge: true,
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>,
  },
  {
    page: "history", cap: "ประวัติการทำงาน",
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 4v5h5" /><path d="M3.5 13a8.5 8.5 0 1 0 2.4-6.2L3 9" /><path d="M12 8v4.5l3 1.8" /></svg>,
  },
];

export default function Rail() {
  const { state, go } = useApp();

  return (
    <nav className="rail">
      <div className="rail-brand">
        <div className="rail-logo">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></svg>
        </div>
        <div>
          <div className="rb-t">ผู้ช่วยตรวจเอกสาร AI</div>
          <div className="rb-s">Prototype · ข้อมูลสมมติ</div>
        </div>
      </div>

      <div className="rail-cap">เมนูหลัก</div>

      {ITEMS.map(it => (
        <button key={it.page} className={"rail-btn" + (state.page === it.page ? " on" : "")} onClick={() => go(it.page)}>
          {it.icon}
          <span className="rb-cap">{it.cap}</span>
          {it.badge && <span className="rb-dot" style={{ display: state.queue.length ? "" : "none" }}>{state.queue.length}</span>}
        </button>
      ))}

      <div className="rail-sep" />
      <button className={"rail-btn" + (state.page === "settings" ? " on" : "")} onClick={() => go("settings")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
        <span className="rb-cap">ตั้งค่า</span>
      </button>

      <div className="rail-foot">
        <div className="rail-avatar">อบ</div>
        <div style={{ flex: 1 }}>
          <div className="rf-n">อรุณี บุญมี</div>
          <div className="rf-r">เจ้าหน้าที่งานทะเบียน</div>
        </div>
      </div>
    </nav>
  );
}
