import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useApp } from "../state/store";

export default function Settings() {
  const { state, saveSettings } = useApp();
  const [model, setModel] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => { if (state.settings) setModel(state.settings.model); }, [state.settings]);

  const testAi = async () => {
    setTesting(true);
    try {
      const res = await api.testAi();
      window.alert(res.ok ? `ทดสอบ API (จำลอง): ${res.provider}` : `ทดสอบไม่สำเร็จ: ${res.error}`);
    } finally {
      setTesting(false);
    }
  };

  if (!state.settings) return <div className="settings"><div className="empty">กำลังโหลดการตั้งค่า…</div></div>;

  return <div className="settings">
    <section className="sgroup on">
      <h2>โมเดล AI</h2>

      <div className="fld"><label htmlFor="demo-api-key">API KEY</label>
        <div className="settings-api-row">
          <input id="demo-api-key" className="inp mono" type="text" value="KEY" readOnly disabled aria-describedby="demo-key-note" />
          <button className="btn" onClick={testAi} disabled={testing}>{testing ? "กำลังทดสอบ…" : "ทดสอบ API"}</button>
        </div>

      </div>
      <div className="fld"><label htmlFor="demo-model">โมเดล</label>
        <select id="demo-model" className="sel" value={model} onChange={e => setModel(e.target.value)}>
          {model && !["gemini-3.1-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-pro"].includes(model) && <option value={model}>{model}</option>}
          <option>gemini-3.1-flash-lite</option>
          <option>gemini-2.5-flash</option>
          <option>gemini-2.0-flash</option>
          <option>gemini-2.5-pro</option>
        </select>
      </div>
      <div className="srow"><span className="grow" /><button className="btn btn-pink" onClick={() => saveSettings({ model })}>บันทึกการตั้งค่า</button></div>
    </section>
  </div>;
}
