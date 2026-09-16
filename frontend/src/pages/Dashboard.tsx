import { STEPS } from "../lib/steps";
import { useApp } from "../state/store";

export default function Dashboard() {
  const { state, go } = useApp();
  const total = state.docs.length;
  const auto = state.docs.filter(d => d.verdict === "auto").length;
  const ex = state.queue.length;
  const posted = state.docs.filter(d => d.status === "posted" || d.status === "confirmed").length;
  const avg = total ? (state.elapsed / total).toFixed(1) : "—";
  const stamp = state.runs.length ? "รอบที่ " + state.runs[0].id : "ยังไม่มีข้อมูล";

  const live = state.running ? state.step : 0;
  const done = state.running ? live - 1 : total ? (ex ? 7 : 10) : 0;
  const flowState = state.running ? "กำลังประมวลผล" : total ? "รอบล่าสุดเสร็จแล้ว" : "พร้อมทำงาน";
  const flowClass = state.running ? "c-cyan" : total ? "c-lime" : "c-gray";

  const hist = state.runs.slice(0, 7).reverse();
  const series = [
    ...hist.map(r => ({ id: String(r.id), total: r.total, auto: r.auto, exception: r.exception })),
    ...(state.running ? [{ id: "now", total, auto, exception: ex }] : []),
  ];
  const max = Math.max(6, ...series.map(r => r.total || 0));

  const C = 2 * Math.PI * 48;
  const base = Math.max(total, 1);
  const autoDash = (C * auto / base) + " " + C;
  const exDash = (C * ex / base) + " " + C;
  const exOffset = -C * auto / base;

  const feed = state.logs.slice(-8).reverse();

  return (
    <div className="dash">
      <div className="flowband">
        <div className="flowband-hd">
          <div>
            <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 600 }}>ขั้นตอนของระบบอัตโนมัติ (AI / RPA)</h3>
            <div className="tag-label">ขั้นที่ 3–10 ตาม To-Be Flow — ส่วนที่โปรแกรมนี้รับผิดชอบ</div>
          </div>
          <span className="grow" />
          <span className={"chip " + flowClass}><span className="led" /> {flowState}</span>
        </div>
        <div className="flow">
          {STEPS.map(s => {
            const cls = s.no === live ? "live" : s.no <= done ? "done" : "";
            return (
              <div key={s.no} className={"node " + cls + (s.human ? " human" : "")}>
                <div className="n-no">ขั้นที่ {s.no}</div>
                <div className="n-nm">{s.nm}</div>
                <div className="n-ds">{s.ds}</div>
                {s.human && <span className="n-hint">ต้องมีเจ้าหน้าที่</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="dash-split">
        <div className="panel">
          <div className="panel-hd"><h3>ตัวชี้วัดรอบล่าสุด</h3><span className="grow" /><span className="tag-label">{stamp}</span></div>
          <div className="mstack">
            <div className="mrow"><span className="m-k">ชุดเอกสารที่รับเข้า</span><span className="m-v num">{total}</span><span className="m-u">ชุด</span></div>
            <div className="mrow accent-lime"><span className="m-k">ผ่านเกณฑ์อัตโนมัติ</span><span className="m-v num">{auto}</span><span className="m-u">ชุด</span></div>
            <div className="mrow accent-amber"><span className="m-k">เข้าคิวตรวจสอบ</span><span className="m-v num">{ex}</span><span className="m-u">ชุด</span></div>
            <div className="mrow accent-cyan"><span className="m-k">บันทึกเข้า SCMS</span><span className="m-v num">{posted}</span><span className="m-u">ชุด</span></div>
            <div className="mrow"><span className="m-k">เวลาเฉลี่ยต่อชุด</span><span className="m-v num">{avg}</span><span className="m-u">วินาที</span></div>
            <div className="mrow" style={{ alignItems: "center" }}>
              <span className="m-k">แนวโน้ม 7 วัน</span>
              <span className="spark">
                {(series.length ? series : [{ total: 0 }]).map((r, i) => (
                  <i key={i} style={{ height: Math.max(3, Math.round((r.total || 0) / 40 * 24)) }} />
                ))}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="panel mb">
            <div className="panel-hd"><h3>ปริมาณเอกสาร 7 วัน</h3><span className="sub">แท่งซ้อน — เขียวคือผ่านอัตโนมัติ, เหลืองคือเข้าคิว</span></div>
            <div className="tp">
              {series.length ? series.map(r => {
                const h = (v: number) => Math.round((v || 0) / max * 130);
                return (
                  <div className="tp-col" key={r.id} title={`ทั้งหมด ${r.total} · ผ่าน ${r.auto} · เข้าคิว ${r.exception}`}>
                    <div className="tp-stack"><i className="ex" style={{ height: h(r.exception) }} /><i className="ok" style={{ height: h(r.auto) }} /></div>
                    <div className="tp-x">{r.id === "now" ? "รอบนี้" : "#" + r.id}</div>
                  </div>
                );
              }) : <div className="empty">ยังไม่มีรอบการทำงาน</div>}
            </div>
          </div>
          <div className="panel">
            <div className="panel-hd">
              <h3>เหตุการณ์ล่าสุด</h3><span className="grow" />
              <button className="btn btn-sm btn-ghost" onClick={() => go("process")}>ไปหน้าประมวลผล →</button>
            </div>
            <div className="feed">
              {feed.length ? feed.map((l, i) => (
                <div className={"fev " + l.cls} key={i}>
                  <span className="f-i" /><span className="f-t">{l.ts}</span>
                  <span className="f-b"><b>[{l.group}]</b> {l.message}</span>
                </div>
              )) : <div className="empty">ยังไม่มีเหตุการณ์ — เริ่มรอบประมวลผลเพื่อดู log</div>}
            </div>
          </div>
        </div>

        <div>
          <div className="panel mb">
            <div className="panel-hd"><h3>สัดส่วนการตัดสิน</h3></div>
            <div className="donut-wrap">
              <div className="donut">
                <svg width="116" height="116" viewBox="0 0 116 116">
                  <circle cx="58" cy="58" r="48" fill="none" stroke="var(--panel-3)" strokeWidth="13" />
                  <circle cx="58" cy="58" r="48" fill="none" stroke="var(--lime)" strokeWidth="13" strokeDasharray={autoDash} />
                  <circle cx="58" cy="58" r="48" fill="none" stroke="var(--amber)" strokeWidth="13" strokeDasharray={exDash} strokeDashoffset={exOffset} />
                </svg>
                <div className="donut-mid"><b>{total ? Math.round(auto / total * 100) + "%" : "—"}</b><span>ผ่านอัตโนมัติ</span></div>
              </div>
              <div className="donut-key">
                <div><i style={{ background: "var(--lime)" }} /> ผ่านอัตโนมัติ <b className="num">{auto}</b></div>
                <div><i style={{ background: "var(--amber)" }} /> เข้าคิวตรวจ <b className="num">{ex}</b></div>
                <div><i style={{ background: "var(--panel-3)" }} /> ยังไม่ประมวลผล <b className="num">{Math.max(0, state.sourceFiles)}</b></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-hd"><h3>กฎบังคับ (ห้ามข้าม)</h3></div>
            <div className="panel-bd" style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 12 }}>
              <div style={{ display: "flex", gap: 9 }}><span className="chip c-red">บังคับ</span><span>ฟอร์มที่ไม่ใช่ของมหาวิทยาลัย = ไม่ผ่านทันที ส่งเจ้าหน้าที่ตรวจ 100%</span></div>
              <div style={{ display: "flex", gap: 9 }}><span className="chip c-red">บังคับ</span><span>เคสหมายเหตุ "ปลอมแปลง" ห้าม Auto-Post ต้องส่งนิติการเสมอ</span></div>
              <div style={{ display: "flex", gap: 9 }}><span className="chip c-cyan">กฎ</span><span>ไม่ใช้ QR — อ้างตัวบุคคลด้วยรหัส นศ. / เลขบัตร ปชช. ในตาราง</span></div>
              <div style={{ display: "flex", gap: 9 }}><span className="chip c-cyan">กฎ</span><span>ทุกค่าที่บันทึกต้องเก็บคู่กับค่าที่ AI อ่านได้ · confidence · หน้าเอกสาร · edited flag</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
