import { STEPS } from "../../lib/steps";

export default function HelpPanel() {
  return (
    <>
      <p style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 0 }}>
        โปรแกรมนี้ทำเฉพาะ lane <b>ระบบอัตโนมัติ (AI / RPA)</b> — กล่องสีเขียวในผังงาน คือขั้นที่ 3 ถึง 10
      </p>
      <table className="t">
        <thead><tr><th>ขั้น</th><th>งาน</th><th>ผู้ทำ</th></tr></thead>
        <tbody>
          {STEPS.map(s => (
            <tr key={s.no}>
              <td className="num">{s.no}</td>
              <td>{s.nm}<div style={{ fontSize: 11, color: "var(--ink-3)" }}>{s.ds}</div></td>
              <td>{s.human ? <span className="chip c-violet">เจ้าหน้าที่</span> : <span className="chip c-cyan">ระบบ</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 14 }}>
        ขั้นที่ 1–2 (นักศึกษายื่น / เจ้าหน้าที่รับเอกสาร) อยู่นอกขอบเขต
      </p>
    </>
  );
}
