import { useRef, useState } from "react";
import { cc, pct } from "../lib/format";
import { STEPS } from "../lib/steps";
import { usePanel } from "../state/panel";
import { useApp } from "../state/store";
import DocDetail from "../components/panels/DocDetail";

export default function Process() {
  const { state, go, start, stop, resetView, clearLogs, setFilter, setLogFilter, uploadFiles, openCase } = useApp();
  const { openPanel } = usePanel();
  const fileInput = useRef<HTMLInputElement>(null);
  const [logFilterLocal, setLogFilterLocal] = useState<"all" | "ai" | "warn" | "scms">("all");

  const live = state.running ? state.step : 0;
  const done = state.running ? -1 : state.docs.length ? (state.queue.length ? 7 : 10) : 0;

  const total = state.total || (state.docs.length + state.sourceFiles) || 1;
  const meterPct = Math.min(100, Math.round(state.docs.length / total * 100));

  const rows = state.docs.filter(d => state.filter === "all" || d.verdict === state.filter);
  const logRows = state.logs.filter(l => logFilterLocal === "all"
    || (logFilterLocal === "ai" && l.group === "AI")
    || (logFilterLocal === "warn" && (l.group === "WARN" || l.group === "ERROR"))
    || (logFilterLocal === "scms" && l.group === "SCMS"));

  const onLogFilter = (f: typeof logFilterLocal) => { setLogFilterLocal(f); setLogFilter(f); };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) await uploadFiles(e.target.files);
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <div className="proc">
      <div>
        <div className="panel mb">
          <div className="panel-hd"><h3>แหล่งข้อมูล</h3><span className="grow" /><span className="chip c-cyan">{state.sourceFiles} ชุด</span></div>
          <div className="io-row">
            <div className="io-k">โฟลเดอร์ต้นทาง (อัปโหลดผ่านเว็บ)</div>
            <div className="io-p">{state.settings?.source_dir || "—"}</div>
            <input ref={fileInput} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.heic"
              onChange={onUpload} />
            <button className="btn btn-sm" onClick={() => fileInput.current?.click()}>อัปโหลดไฟล์</button>
          </div>
          <div className="io-row">
            <div className="io-k">โฟลเดอร์จัดเก็บภาพต้นฉบับ</div>
            <div className="io-p">{state.settings?.archive_dir || "—"}</div>
          </div>
          <div className="io-row">
            <div className="io-k">ปลายทางบันทึกผล (SCMS)</div>
            <div className="io-p">{state.settings?.scms_endpoint || "—"}</div>
            <span className="chip c-lime"><span className="led" /> เชื่อมต่อแล้ว</span>
          </div>
        </div>

        <div className="panel mb">
          <div className="panel-hd"><h3>ลำดับการทำงาน</h3><span className="grow" /><span className="tag-label">ต่อ 1 ชุดเอกสาร</span></div>
          <div className="track">
            {STEPS.map(s => {
              let cls = "";
              if (s.no === live) cls = "live";
              else if (state.running && s.no < live) cls = "done";
              else if (!state.running && state.docs.length && s.no <= (state.queue.length ? 7 : 10)) cls = "done";
              return <div className={"tstep " + cls} key={s.no}><span className="t-no">{s.no}</span><span className="t-nm">{s.nm}</span></div>;
            })}
          </div>
          <div className="meter">
            <div className="meter-hd">
              <span className="mh-k">{state.running ? `ขั้นที่ ${state.step} — ${state.stepName}` : done ? "ประมวลผลเสร็จสิ้น" : "พร้อมเริ่มประมวลผล"}</span>
              <span className="mh-v num">{meterPct}%</span>
            </div>
            <div className="meter-bar"><i style={{ width: meterPct + "%" }} /></div>
            <div className="meter-file">{state.running && state.currentFile ? state.currentFile : "idle · no document loaded"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <button className="btn btn-lime btn-xl" disabled={state.running} onClick={start}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21" /></svg> เริ่มรอบประมวลผล
          </button>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button className="btn btn-red" disabled={!state.running} onClick={stop}>หยุด</button>
            <button className="btn" onClick={resetView}>ล้างผล</button>
          </div>
        </div>
      </div>

      <div className="term">
        <div className="term-hd">
          <div>
            <div className="t-title">บันทึกการทำงานแบบเรียลไทม์</div>
            <div className="t-sub">แสดงขั้นตอนพร้อมเวลาและสาเหตุเมื่อไม่ผ่านเกณฑ์</div>
          </div>
          <span className="grow" />
          <div className="term-filters">
            {(["all", "ai", "warn", "scms"] as const).map(f => (
              <button key={f} className={"tf" + (logFilterLocal === f ? " on" : "")} onClick={() => onLogFilter(f)}>
                {f === "all" ? "ทั้งหมด" : f === "ai" ? "AI" : f === "warn" ? "เตือน" : "SCMS"}
              </button>
            ))}
          </div>
          <button onClick={clearLogs}>ล้างบันทึก</button>
        </div>
        <div className="term-bd">
          {!logRows.length ? <div className="empty">ยังไม่มีบันทึกการทำงาน — กด "เริ่มรอบประมวลผล"</div> : (
            <>
              {logRows.map((l, i) => (
                <div className="tline" key={i}>
                  <span className="tl-t">{l.ts}</span><span className={"tl-g " + l.gc}>[{l.group}]</span>
                  <span className="tl-m">{l.message}</span>
                </div>
              ))}
              {state.running && <div className="tline"><span className="tl-t" /><span className="tl-g" /><span className="tl-m"><span className="term-cursor" /></span></div>}
            </>
          )}
        </div>
      </div>

      <div className="panel dock">
        <div className="panel-hd" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <div className="tabs">
            {(["all", "auto", "exception"] as const).map(f => (
              <button key={f} className={"tab" + (state.filter === f ? " on" : "")} onClick={() => setFilter(f)}>
                {f === "all" ? "ทั้งหมด" : f === "auto" ? "ผ่านอัตโนมัติ" : "เข้าคิวตรวจ"}{" "}
                <span className="cnt">{f === "all" ? state.docs.length : state.docs.filter(d => d.verdict === f).length}</span>
              </button>
            ))}
          </div>
          <span className="grow" />
          <button className="btn btn-sm btn-ghost" onClick={() => go("queue")}>เปิดคิวตรวจ →</button>
        </div>
        <div className="scroll-x" style={{ maxHeight: 420, overflowY: "auto" }}>
          <table className="t">
            <thead><tr>
              <th>#</th><th>ชื่อไฟล์</th><th>ชนิดฟอร์ม</th><th>โรงเรียน/สถาบัน</th>
              <th>จำนวนแถว</th><th>อ่านได้</th><th>Confidence</th><th>แถวผลลบ</th><th>ลายเซ็นผู้ตรวจสอบ</th>
              <th>ผลการตรวจ</th><th /></tr></thead>
            <tbody>
              {!rows.length ? <tr><td colSpan={11}><div className="empty">ยังไม่มีผลลัพธ์ — กด "เริ่มรอบประมวลผล"</div></td></tr> : rows.map((d, i) => {
                const n = d.row_count || (d.rows || []).length;
                const adverse = (d.rows || []).filter(r => r.adverse).length;
                return (
                  <tr key={d.id ?? i}>
                    <td className="num">{d.id ?? i + 1}</td>
                    <td>{d.file_name}</td>
                    <td><span className={"chip " + (d.form_type === "spu" ? "c-cyan" : "c-red")}>{d.form_type === "spu" ? "SPU" : "ไม่ใช่ฟอร์ม SPU"}</span></td>
                    <td>{d.school_name || "-"}</td>
                    <td className="num">{n}</td>
                    <td className="num">{d.readable_rows}</td>
                    <td><span className="num" style={{ color: cc(d.min_confidence) }}>{pct(d.min_confidence)}</span></td>
                    <td className="num" style={{ color: adverse ? "var(--red)" : "var(--ink-2)" }}>{adverse || "-"}</td>
                    <td>{d.verifier_signed ? <span className="chip c-lime">มี</span> : <span className="chip c-red">ไม่มี</span>}</td>
                    <td>{d.verdict === "auto"
                      ? <span className="chip c-lime"><span className="led" /> ผ่าน · บันทึกแล้ว</span>
                      : <span className="chip c-amber"><span className="led" /> เข้าคิวตรวจ</span>}</td>
                    <td>{d.verdict === "exception"
                      ? <button className="btn btn-sm btn-pink" onClick={() => openCase(d.id)}>ตรวจสอบ</button>
                      : <button className="btn btn-sm btn-ghost" onClick={() => openPanel(d.file_name, (d.school_name || "-") + " · " + d.row_count + " แถว", <DocDetail d={d} />)}>ดูผล</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
