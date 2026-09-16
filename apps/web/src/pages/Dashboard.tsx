import { useMemo, useState } from "react";
import { cc, pct } from "../lib/format";
import { usePanel } from "../state/panel";
import { useApp } from "../state/store";
import DocDetail from "../components/panels/DocDetail";
import type { DocResult } from "../types";

type Category = "auto" | "review" | "discrepancy" | "escalate" | "completed";

const categories: { id: Category; title: string; detail: string; tone: string; symbol: string }[] = [
  { id: "auto", title: "ผ่านอัตโนมัติ", detail: "ผลครบและผ่านเกณฑ์", tone: "lime", symbol: "✓" },
  { id: "review", title: "รอเจ้าหน้าที่ตรวจ", detail: "ฟอร์มโรงเรียนหรืออ่านไม่ชัด", tone: "amber", symbol: "◷" },
  { id: "discrepancy", title: "ข้อมูลขัดแย้ง", detail: "ผลตรวจหรือข้อมูลไม่ตรงกัน", tone: "orange", symbol: "≠" },
  { id: "escalate", title: "ส่งต่อกรณีร้ายแรง", detail: "มีข้อสังเกตเรื่องปลอมแปลง", tone: "red", symbol: "!" },
  { id: "completed", title: "ดำเนินการเสร็จแล้ว", detail: "เจ้าหน้าที่ยืนยันหรือปิดเคส", tone: "cyan", symbol: "✓" },
];

function categoryOf(doc: DocResult): Category {
  if (doc.status === "confirmed" || doc.status === "rejected") return "completed";
  if (doc.rows.some(r => /ปลอม|แก้ไขเอกสาร/.test(r.note || "")) || doc.reasons.some(r => /ปลอม/.test(r))) return "escalate";
  if (doc.rows.some(r => r.adverse || r.graduation === "fail" || r.doc_date === "incorrect" || r.degree === "incorrect") || doc.reasons.some(r => /ขัดแย้ง|ไม่ตรง/.test(r))) return "discrepancy";
  if (doc.verdict === "auto") return "auto";
  return "review";
}

const resultLabel = (doc: DocResult, row: DocResult["rows"][number]) => {
  if (doc.status === "confirmed") return "เจ้าหน้าที่ยืนยันแล้ว";
  if (doc.status === "rejected") return "ส่งกลับแล้ว";
  if (row.adverse || row.graduation === "fail" || row.doc_date === "incorrect" || row.degree === "incorrect") return "พบผลลบ";
  if (row.graduation === "unclear" || row.doc_date === "unclear" || row.degree === "unclear") return "อ่านไม่ชัด";
  return "ผลบวกครบ";
};

export default function Dashboard() {
  const { state, go, openCase } = useApp();
  const { openPanel } = usePanel();
  const [selected, setSelected] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const result: Record<Category, DocResult[]> = { auto: [], review: [], discrepancy: [], escalate: [], completed: [] };
    state.docs.forEach(doc => result[categoryOf(doc)].push(doc));
    return result;
  }, [state.docs]);
  const current = categories.find(c => c.id === selected);
  const search = query.trim().toLocaleLowerCase();
  const docs = state.docs.filter(d => !search || [d.file_name, d.school_name, d.set_no].some(v => v?.toLocaleLowerCase().includes(search)));
  const students = selected ? grouped[selected].flatMap(doc => doc.rows.map(row => ({ doc, row })))
    .filter(({ doc, row }) => !search || [row.student_id, row.full_name, row.faculty, doc.file_name, doc.school_name]
      .some(v => v?.toLocaleLowerCase().includes(search))) : [];

  const detail = (doc: DocResult) => openPanel(doc.file_name, `${doc.school_name || "—"} · ${doc.row_count} รายชื่อ`, <DocDetail d={doc} />);

  return (
    <div className="mini-dash">
      <div className="mini-hero">
        <div>
          <span className="mini-eyebrow">ภาพรวมการตรวจสอบ · ข้อมูลสาธิต</span>
          <h2>ติดตามผลแบบยืนยันฯ ที่โรงเรียนส่งกลับ</h2>
          <p>เริ่มจากชุดเอกสารทั้งหมด แล้วเลือกหมวดเพื่อดูรายชื่อนักศึกษาภายในหมวดนั้น</p>
        </div>
        <div className="mini-total"><b>{state.docs.length}</b><span>ชุดเอกสารทั้งหมด</span></div>
      </div>

      <div className="mini-cards" aria-label="หมวดหมู่การตรวจสอบ">
        {categories.map(c => {
          const list = grouped[c.id];
          return <button key={c.id} type="button" className={`mini-card mini-${c.tone}${selected === c.id ? " selected" : ""}`}
            aria-pressed={selected === c.id} onClick={() => { setSelected(c.id); setQuery(""); }}>
            <span className="mini-card-top"><span className="mini-symbol">{c.symbol}</span><span className="mini-card-arrow">↗</span></span>
            <strong>{list.length}</strong><span className="mini-card-title">{c.title}</span><small>{c.detail}</small>
            <span className="mini-card-foot">{list.reduce((n, d) => n + d.rows.length, 0)} รายชื่อนักศึกษา</span>
          </button>;
        })}
      </div>

      <section className="panel mini-list">
        <div className="mini-list-head">
          <div>
            {selected && <button type="button" className="mini-back" onClick={() => { setSelected(null); setQuery(""); }}>← กลับไปชุดเอกสาร</button>}
            <h3>{current ? `รายชื่อนักศึกษา · ${current.title}` : "ชุดเอกสารทั้งหมด"}</h3>
            <p>{current ? `${students.length} รายชื่อ จาก ${grouped[selected!].length} ชุดเอกสาร · หมวดอิงผลตัดสินของทั้งชุดเอกสาร` : `${docs.length} ชุดเอกสาร · เลือกหมวดด้านบนเพื่อดูรายชื่อนักศึกษา`}</p>
          </div>
          <label className="mini-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={selected ? "ค้นหารหัส ชื่อ โรงเรียน หรือไฟล์" : "ค้นหาชื่อไฟล์หรือโรงเรียน"} aria-label="ค้นหา" /></label>
        </div>
        <div className="scroll-x">
          {selected ? <table className="t mini-table">
            <thead><tr><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>คณะ/วิทยาลัย</th><th>โรงเรียน</th><th>ชุดเอกสาร</th><th>ผลรายแถว</th><th>ความมั่นใจ</th><th /></tr></thead>
            <tbody>{students.length ? students.map(({ doc, row }) => <tr key={`${doc.id}-${row.row_no}`}>
              <td className="num">{row.student_id || "—"}</td><td><b>{row.full_name || "อ่านไม่ชัด"}</b></td><td>{row.faculty || "—"}</td>
              <td>{doc.school_name || "—"}</td><td className="num">{doc.file_name}</td>
              <td><span className={`chip c-${selected === "auto" || selected === "completed" ? "lime" : selected === "escalate" || selected === "discrepancy" ? "red" : "amber"}`}>{resultLabel(doc, row)}</span></td>
              <td className="num" style={{ color: cc(row.confidence) }}>{pct(row.confidence)}</td>
              <td><button className="btn btn-sm btn-ghost" onClick={() => detail(doc)}>ดูชุดเอกสาร</button></td>
            </tr>) : <tr><td colSpan={8}><div className="empty">ไม่พบรายชื่อในหมวดนี้</div></td></tr>}</tbody>
          </table> : <table className="t mini-table">
            <thead><tr><th>ชื่อไฟล์</th><th>โรงเรียน/สถาบัน</th><th>ชนิดฟอร์ม</th><th>รายชื่อ</th><th>สถานะ</th><th>ความมั่นใจต่ำสุด</th><th /></tr></thead>
            <tbody>{docs.length ? docs.map(doc => {
              const cat = categories.find(c => c.id === categoryOf(doc))!;
              return <tr key={doc.id}>
                <td className="num"><b>{doc.file_name}</b></td><td>{doc.school_name || "—"}</td>
                <td>{doc.form_type === "spu" ? "แบบ SPU" : "แบบโรงเรียน"}</td><td className="num">{doc.rows.length}</td>
                <td><span className={`chip c-${cat.tone === "orange" ? "red" : cat.tone}`}>{cat.title}</span></td>
                <td className="num" style={{ color: cc(doc.min_confidence) }}>{pct(doc.min_confidence)}</td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => doc.status === "pending" ? openCase(doc.id) : detail(doc)}>{doc.status === "pending" ? "ตรวจสอบ" : "ดูรายละเอียด"}</button></td>
              </tr>;
            }) : <tr><td colSpan={7}><div className="empty">ไม่พบชุดเอกสาร</div></td></tr>}</tbody>
          </table>}
        </div>
      </section>
      <div className="mini-note"><span>ℹ</span> ข้อมูลทั้งหมดเป็นข้อมูลสมมติ หมวดหมู่แสดงผลระดับชุดเอกสาร และการยืนยันหรือบันทึกเข้า SCMS เป็นการจำลอง <button onClick={() => go("process")}>ไปหน้าประมวลผล →</button></div>
    </div>
  );
}
