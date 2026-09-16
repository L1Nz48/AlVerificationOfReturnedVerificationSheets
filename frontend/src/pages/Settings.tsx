import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useApp } from "../state/store";
import type { Settings as SettingsT } from "../types";

const TABS = [
  { id: "ai", label: "โมเดล AI" },
  { id: "rules", label: "เกณฑ์การตัดสิน" },
  { id: "prompt", label: "พร็อมท์" },
  { id: "scms", label: "SCMS & จัดเก็บ" },
] as const;

export default function Settings() {
  const { state, saveSettings } = useApp();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("ai");
  const [form, setForm] = useState<SettingsT | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => { if (state.settings) setForm(state.settings); }, [state.settings]);

  if (!form) return <div className="settings"><div className="empty">กำลังโหลดการตั้งค่า…</div></div>;

  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  const save = () => {
    saveSettings({
      model: form.model, workers: form.workers, min_confidence: form.min_confidence,
      prompt: form.prompt, scms_endpoint: form.scms_endpoint, scms_account: form.scms_account,
      require_all_rows: form.require_all_rows, cross_check_scms: form.cross_check_scms,
      dry_run: form.dry_run, store_original_scan: form.store_original_scan, notify_student: form.notify_student,
    });
  };

  const testAi = async () => {
    setTesting(true);
    const res = await api.testAi();
    setTesting(false);
    if (res.ok) window.alert("เชื่อมต่อสำเร็จ — ตัวอ่าน: " + res.provider);
    else window.alert("เชื่อมต่อไม่สำเร็จ: " + res.error);
  };

  return (
    <div className="settings">
      <div className="snav">
        <div className="tag-label" style={{ padding: "4px 12px 8px" }}>หมวดการตั้งค่า</div>
        {TABS.map(t => (
          <button key={t.id} className={"snav-b" + (tab === t.id ? " on" : "")} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="spane">
        {tab === "ai" && (
          <div className="sgroup on">
            <h2>โมเดล AI</h2>
            <p className="lead">การเชื่อมต่อ Gemini Multimodal สำหรับ OCR และอ่านเครื่องหมาย/ลายเซ็นในตาราง</p>
            <div className="fld"><label>API Key</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="inp mono" type="password" disabled placeholder={form.has_api_key ? "•••••••• (ตั้งค่าไว้ใน .env แล้ว)" : "ยังไม่ได้ตั้งค่าใน .env"} />
                <button className="btn" onClick={testAi} disabled={testing}>{testing ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ"}</button>
              </div>
              <div className="hint">คีย์อ่านจากไฟล์ <span className="mono">.env</span> (ตัวแปร <span className="mono">GEMINI_API_KEY</span>) — ไม่เก็บไว้ในหน้าจอ</div>
            </div>
            <div className="g2">
              <div className="fld"><label>โมเดล</label>
                <select className="sel" value={form.model} onChange={e => set("model", e.target.value)}>
                  <option>gemini-3.1-flash-lite</option>
                  <option>gemini-2.5-flash</option>
                  <option>gemini-2.0-flash</option>
                  <option>gemini-2.5-pro</option>
                </select></div>
              <div className="fld"><label>จำนวน worker</label>
                <input className="inp num" type="number" min={1} max={8} value={form.workers} onChange={e => set("workers", Number(e.target.value))} />
                <div className="hint">ย่อภาพไม่เกิน 2048px · JPEG quality 85 ก่อนส่ง API</div></div>
            </div>
            <div className="srow"><span className="grow" /><button className="btn btn-pink" onClick={save}>บันทึกการตั้งค่า</button></div>
          </div>
        )}

        {tab === "rules" && (
          <div className="sgroup on">
            <h2>เกณฑ์การตัดสิน</h2>
            <p className="lead">ขั้นที่ 7 — ตัดสินว่าชุดเอกสารจะ Auto-Post หรือเข้าคิวให้เจ้าหน้าที่ตรวจ</p>
            <div className="srow"><div className="grow"><div className="s-t">Confidence ขั้นต่ำสำหรับ Auto-Post</div><div className="s-d">ต่ำกว่านี้ส่งเข้าคิว Exception</div></div>
              <input className="inp num" style={{ width: 74 }} type="number" min={50} max={100}
                value={Math.round((form.min_confidence || 0) * 100)}
                onChange={e => set("min_confidence", Number(e.target.value) / 100)} /><span style={{ color: "var(--ink-3)" }}>%</span></div>
            <div className="srow"><div className="grow"><div className="s-t">ต้องอ่านครบทุกแถวในตาราง</div><div className="s-d">ขาดแถวใดแถวหนึ่ง = เข้าคิวทั้งชุด</div></div>
              <label className="sw"><input type="checkbox" checked={form.require_all_rows} onChange={e => set("require_all_rows", e.target.checked)} /><span className="tr" /></label></div>
            <div className="srow"><div className="grow"><div className="s-t">Cross-check ชื่อ-สกุลกับ SCMS</div><div className="s-d">เทียบจากรหัส นศ. / เลขบัตร ปชช. ในตาราง</div></div>
              <label className="sw"><input type="checkbox" checked={form.cross_check_scms} onChange={e => set("cross_check_scms", e.target.checked)} /><span className="tr" /></label></div>
            <div className="srow"><div className="grow"><div className="s-t">ฟอร์มไม่ใช่ของมหาวิทยาลัย = ไม่ผ่านทันที</div><div className="s-d">บังคับตาม Sequence Diagram · แก้ไขไม่ได้</div></div>
              <span className="chip c-red">ล็อกไว้</span>
              <label className="sw"><input type="checkbox" checked disabled /><span className="tr" /></label></div>
            <div className="srow"><div className="grow"><div className="s-t">เคสหมายเหตุ "ปลอมแปลง" ห้าม Auto-Post</div><div className="s-d">ส่งนิติการเสมอ · แก้ไขไม่ได้</div></div>
              <span className="chip c-red">ล็อกไว้</span>
              <label className="sw"><input type="checkbox" checked disabled /><span className="tr" /></label></div>
            <div className="srow"><span className="grow" /><button className="btn btn-pink" onClick={save}>บันทึกการตั้งค่า</button></div>
          </div>
        )}

        {tab === "prompt" && (
          <div className="sgroup on">
            <h2>พร็อมท์</h2>
            <p className="lead">คำสั่งที่ส่งให้โมเดลอ่านและดึงข้อมูลรายแถวจากแบบยืนยันฯ</p>
            <div className="fld"><label>พร็อมท์ที่ใช้งานอยู่ (แก้ไขได้)</label>
              <textarea className="ta" value={form.prompt} onChange={e => set("prompt", e.target.value)} /></div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
              <span className="chip c-gray">บันทึกแล้วมีผลกับรอบถัดไปทันที</span>
              <span className="grow" style={{ marginLeft: "auto" }} />
              <button className="btn btn-pink" onClick={save}>บันทึกพร็อมท์</button>
            </div>
          </div>
        )}

        {tab === "scms" && (
          <div className="sgroup on">
            <h2>SCMS &amp; จัดเก็บ</h2>
            <p className="lead">ปลายทางการบันทึกผล (ขั้นที่ 10) และการเก็บหลักฐาน</p>
            <div className="g2">
              <div className="fld"><label>SCMS API Endpoint</label><input className="inp mono" value={form.scms_endpoint} onChange={e => set("scms_endpoint", e.target.value)} /></div>
              <div className="fld"><label>Service Account</label><input className="inp mono" value={form.scms_account} onChange={e => set("scms_account", e.target.value)} /></div>
            </div>
            <div className="srow"><div className="grow"><div className="s-t">โหมดทดสอบ (Dry-run)</div><div className="s-d">ทำงานครบทุกขั้น แต่ไม่เขียนข้อมูลจริงลง SCMS</div></div>
              <label className="sw"><input type="checkbox" checked={form.dry_run} onChange={e => set("dry_run", e.target.checked)} /><span className="tr" /></label></div>
            <div className="srow"><div className="grow"><div className="s-t">เก็บภาพต้นฉบับลง Audit Log / Storage</div><div className="s-d">พร้อม AI raw value + confidence + source page</div></div>
              <label className="sw"><input type="checkbox" checked={form.store_original_scan} onChange={e => set("store_original_scan", e.target.checked)} /><span className="tr" /></label></div>
            <div className="srow"><div className="grow"><div className="s-t">แจ้งผลยืนยันวุฒิถึงนักศึกษาผ่าน SCMS</div><div className="s-d">หลังปิด Audit Trail ของชุดเอกสาร</div></div>
              <label className="sw"><input type="checkbox" checked={form.notify_student} onChange={e => set("notify_student", e.target.checked)} /><span className="tr" /></label></div>
            <div className="srow"><span className="grow" /><button className="btn btn-pink" onClick={save}>บันทึกการตั้งค่า</button></div>
          </div>
        )}
      </div>
    </div>
  );
}
