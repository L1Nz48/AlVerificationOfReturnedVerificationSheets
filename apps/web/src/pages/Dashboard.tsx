import { useMemo, useState } from "react";
import { usePanel } from "../state/panel";
import { useApp } from "../state/store";
import DocDetail from "../components/panels/DocDetail";
import type { DocResult } from "../types";

type Category = "all" | "completed" | "problem" | "followup";

const categories: { id: Category; title: string; detail: string; tone: string }[] = [
  { id: "all", title: "โรงเรียนทั้งหมด", detail: "โรงเรียนที่มีชุดเอกสารในระบบ", tone: "cyan" },
  { id: "completed", title: "โรงเรียนที่สำเร็จ", detail: "ทุกชุดดำเนินการเสร็จแล้ว", tone: "lime" },
  { id: "problem", title: "โรงเรียนที่พบปัญหา", detail: "มีเอกสารหรือผลตรวจผิดปกติ", tone: "red" },
  { id: "followup", title: "โรงเรียนที่ต้องติดตาม", detail: "มีชุดเอกสารรอตรวจเพิ่มเติม", tone: "amber" },
];

function schoolCategory(docs: DocResult[]): Exclude<Category, "all"> {
  const pending = docs.filter(d => d.status === "pending");
  if (docs.some(d => d.status === "rejected")) return "problem";
  if (!pending.length) return "completed";
  if (pending.some(d => d.form_type === "other" || d.rows.some(r => r.adverse || r.graduation === "fail" || r.doc_date === "incorrect" || r.degree === "incorrect" || /ปลอม/.test(r.note || "")) || d.reasons.some(r => /ปลอม|ขัดแย้ง|ไม่ตรง/.test(r)))) return "problem";
  return "followup";
}

export default function Dashboard() {
  const { state, openCase } = useApp();
  const { openPanel } = usePanel();
  const [selected, setSelected] = useState<Category | null>(null);
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const schools = new Map<string, DocResult[]>();
    state.docs.forEach(doc => {
      const key = doc.school_name || "ไม่ระบุโรงเรียน";
      schools.set(key, [...(schools.get(key) || []), doc]);
    });
    const groups: Record<Category, DocResult[][]> = { all: [], completed: [], problem: [], followup: [] };
    schools.forEach(docs => { groups.all.push(docs); groups[schoolCategory(docs)].push(docs); });
    return groups;
  }, [state.docs]);
  const current = categories.find(c => c.id === selected);
  const search = query.trim().toLocaleLowerCase();
  const docs = state.docs.filter(d => !search || [d.school_name, d.form_type === "spu" ? "แบบ SPU" : "แบบโรงเรียน"].some(v => v?.toLocaleLowerCase().includes(search)));
  const schools = selected ? grouped[selected].filter(school => !search ||
    [school[0].school_name, categories.find(c => c.id === schoolCategory(school))?.title]
      .some(v => v?.toLocaleLowerCase().includes(search))) : [];

  const detail = (doc: DocResult) => openPanel(doc.file_name, `${doc.school_name || "—"} · ${doc.row_count} รายชื่อ`, <DocDetail d={doc} />);

  return (
    <div className="mini-dash">
      <div className="mini-cards" aria-label="หมวดหมู่การตรวจสอบ">
        {categories.map(c => {
          const list = grouped[c.id];
          return <button key={c.id} type="button" className={`mini-card mini-${c.tone}${selected === c.id ? " selected" : ""}`}
            aria-pressed={selected === c.id} onClick={() => { setSelected(c.id); setQuery(""); }}>
            <strong>{list.length}</strong><span className="mini-card-title">{c.title}</span><small>{c.detail}</small>
            <span className="mini-card-foot">{list.reduce((n, school) => n + school.length, 0)} ชุดเอกสาร</span>
          </button>;
        })}
      </div>

      <section className="panel mini-list">
        <div className="mini-list-head">
          <div>
            {selected && <button type="button" className="mini-back" onClick={() => { setSelected(null); setQuery(""); }}>← กลับไปชุดเอกสาร</button>}
            <h3>{current ? `รายชื่อโรงเรียน · ${current.title}` : "ชุดเอกสารทั้งหมด"}</h3>
            <p>{current ? `${schools.length} โรงเรียน · รวม ${schools.reduce((total, school) => total + school.length, 0)} ชุดเอกสาร` : `${docs.length} ชุดเอกสาร จาก ${grouped.all.length} โรงเรียน · เลือกการ์ดด้านบนเพื่อดูรายชื่อโรงเรียน`}</p>
          </div>
          <label className="mini-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={selected ? "ค้นหาโรงเรียนหรือสถานะ" : "ค้นหาโรงเรียนหรือชนิดฟอร์ม"} aria-label="ค้นหา" /></label>
        </div>
        <div className="scroll-x">
          {selected ? <table className="t mini-table mini-school-table">
            <thead><tr><th>โรงเรียน/สถาบัน</th><th>ชุดเอกสาร</th><th>สถานะ</th></tr></thead>
            <tbody>{schools.length ? schools.map(school => {
              const status = categories.find(c => c.id === schoolCategory(school))!;
              return <tr key={school[0].school_name || school[0].id}>
                <td><b>{school[0].school_name || "ไม่ระบุโรงเรียน"}</b></td>
                <td className="num">{school.length} ชุด</td>
                <td><span className={`chip c-${status.tone}`}>{status.title}</span></td>
              </tr>;
            }) : <tr><td colSpan={3}><div className="empty">ไม่พบโรงเรียนในหมวดนี้</div></td></tr>}</tbody>
          </table> : <table className="t mini-table">
            <thead><tr><th>โรงเรียน/สถาบัน</th><th>ชนิดฟอร์ม</th><th>รายชื่อ</th><th>สถานะ</th><th /></tr></thead>
            <tbody>{docs.length ? docs.map(doc => {
              const cat = categories.find(c => c.id === schoolCategory(grouped.all.find(s => s.includes(doc)) || [doc]))!;
              return <tr key={doc.id}>
                <td><b>{doc.school_name || "—"}</b></td>
                <td>{doc.form_type === "spu" ? "แบบ SPU" : "แบบโรงเรียน"}</td><td className="num">{doc.rows.length}</td>
                <td><span className={`chip c-${cat.tone}`}>{cat.title}</span></td>
                <td><button className="btn btn-sm btn-ghost" onClick={() => doc.status === "pending" ? openCase(doc.id) : detail(doc)}>{doc.status === "pending" ? "ตรวจสอบ" : "ดูรายละเอียด"}</button></td>
              </tr>;
            }) : <tr><td colSpan={5}><div className="empty">ไม่พบชุดเอกสาร</div></td></tr>}</tbody>
          </table>}
        </div>
      </section>
    </div>
  );
}
