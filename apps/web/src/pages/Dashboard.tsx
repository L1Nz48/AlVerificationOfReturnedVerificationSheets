import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
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

const schoolName = (doc: DocResult) => doc.school_name || "ไม่ระบุโรงเรียน";

function documentStatus(doc: DocResult) {
  if (doc.status === "posted") return { title: "ผ่านอัตโนมัติ", tone: "lime" };
  if (doc.status === "confirmed") return { title: "ยืนยันแล้ว", tone: "lime" };
  if (doc.status === "rejected") return { title: "ส่งกลับแล้ว", tone: "red" };
  return schoolCategory([doc]) === "problem" ? { title: "พบปัญหา", tone: "red" } : { title: "รอตรวจ", tone: "amber" };
}

function activateWithKeyboard(event: KeyboardEvent<HTMLTableRowElement>, action: () => void) {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
}

export default function Dashboard() {
  const { state, openCase } = useApp();
  const { openPanel } = usePanel();
  const [selected, setSelected] = useState<Category | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const schools = new Map<string, DocResult[]>();
    state.docs.forEach(doc => {
      const key = schoolName(doc);
      schools.set(key, [...(schools.get(key) || []), doc]);
    });
    const groups: Record<Category, DocResult[][]> = { all: [], completed: [], problem: [], followup: [] };
    schools.forEach(docs => { groups.all.push(docs); groups[schoolCategory(docs)].push(docs); });
    return groups;
  }, [state.docs]);
  const totalSchools = grouped.all.length;
  const current = categories.find(c => c.id === selected);
  const search = query.trim().toLocaleLowerCase();
  const schoolDocs = selectedSchool ? grouped.all.find(school => schoolName(school[0]) === selectedSchool) || [] : [];
  const docs = (selectedSchool ? schoolDocs : state.docs).filter(d => !search ||
    [d.file_name, d.school_name, d.form_type === "spu" ? "แบบ SPU" : "แบบโรงเรียน"].some(v => v?.toLocaleLowerCase().includes(search)));
  const schools = selected && !selectedSchool ? grouped[selected].filter(school => !search ||
    [school[0].school_name, categories.find(c => c.id === schoolCategory(school))?.title]
      .some(v => v?.toLocaleLowerCase().includes(search))) : [];

  const detail = (doc: DocResult) => openPanel(doc.file_name, `${doc.school_name || "—"} · ${doc.row_count} รายชื่อ`, <DocDetail d={doc} />);
  const openDocument = (doc: DocResult) => doc.status === "pending" ? openCase(doc.id) : detail(doc);

  return (
    <div className="mini-dash">
      <div className="mini-cards" aria-label="หมวดหมู่การตรวจสอบ">
        {categories.map(c => {
          const list = grouped[c.id];
          const percentage = totalSchools ? Math.round(list.length / totalSchools * 100) : 0;
          return <button key={c.id} type="button" className={`mini-card mini-${c.tone}${selected === c.id ? " selected" : ""}`}
            aria-pressed={selected === c.id} onClick={() => { setSelected(c.id); setSelectedSchool(null); setQuery(""); }}>
            <span className="mini-card-metrics"><strong>{list.length}</strong><span className="mini-card-percent" aria-label={`${percentage}% ของโรงเรียนทั้งหมด`}>{percentage}%</span></span>
            <span className="mini-card-title">{c.title}</span><small>{c.detail}</small>
            <span className="mini-card-foot">{list.reduce((n, school) => n + school.length, 0)} ชุดเอกสาร</span>
          </button>;
        })}
      </div>

      <section className="panel mini-list">
        <div className="mini-list-head">
          <div>
            {selected && <button type="button" className="mini-back" onClick={() => { if (selectedSchool) setSelectedSchool(null); else setSelected(null); setQuery(""); }}>{selectedSchool ? "← กลับไปรายชื่อโรงเรียน" : "← กลับไปชุดเอกสาร"}</button>}
            <h3>{selectedSchool ? `ชุดเอกสาร · ${selectedSchool}` : current ? `รายชื่อโรงเรียน · ${current.title}` : "ชุดเอกสารทั้งหมด"}</h3>
            <p>{selectedSchool ? `${schoolDocs.length} ชุดเอกสารของโรงเรียนนี้${search ? ` · แสดง ${docs.length} ชุด` : ""} · กดแถวเพื่อดูเอกสาร` : current ? `${schools.length} โรงเรียน · รวม ${schools.reduce((total, school) => total + school.length, 0)} ชุดเอกสาร · กดโรงเรียนเพื่อดูรายการ` : `${docs.length} ชุดเอกสาร จาก ${grouped.all.length} โรงเรียน · กดแถวเพื่อดูเอกสาร`}</p>
          </div>
          <label className="mini-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={selectedSchool ? "ค้นหาชื่อไฟล์หรือชนิดฟอร์ม" : selected ? "ค้นหาโรงเรียนหรือสถานะ" : "ค้นหาโรงเรียนหรือชนิดฟอร์ม"} aria-label="ค้นหา" /></label>
        </div>
        <div className="scroll-x">
          {selected && !selectedSchool ? <table className="t mini-table mini-school-table">
            <thead><tr><th>โรงเรียน/สถาบัน</th><th>ชุดเอกสาร</th><th>สถานะ</th></tr></thead>
            <tbody>{schools.length ? schools.map(school => {
              const status = categories.find(c => c.id === schoolCategory(school))!;
              const name = schoolName(school[0]);
              const openSchool = () => { setSelectedSchool(name); setQuery(""); };
              return <tr key={name} className="mini-action-row" role="button" tabIndex={0}
                aria-label={`ดู ${school.length} ชุดเอกสารของ ${name}`} onClick={openSchool}
                onKeyDown={event => activateWithKeyboard(event, openSchool)}>
                <td><b>{name}</b></td>
                <td className="num">{school.length} ชุด</td>
                <td><span className={`chip c-${status.tone}`}>{status.title}</span></td>
              </tr>;
            }) : <tr><td colSpan={3}><div className="empty">ไม่พบโรงเรียนในหมวดนี้</div></td></tr>}</tbody>
          </table> : <table className="t mini-table">
            <thead><tr><th>{selectedSchool ? "ชื่อไฟล์" : "โรงเรียน/สถาบัน"}</th><th>ชนิดฟอร์ม</th><th>รายชื่อ</th><th>สถานะ</th></tr></thead>
            <tbody>{docs.length ? docs.map(doc => {
              const status = selectedSchool ? documentStatus(doc) : categories.find(c => c.id === schoolCategory(grouped.all.find(s => s.includes(doc)) || [doc]))!;
              const open = () => openDocument(doc);
              return <tr key={doc.id} className="mini-action-row" role="button" tabIndex={0}
                aria-label={`${doc.file_name} · ${schoolName(doc)} · ${doc.status === "pending" ? "ตรวจสอบ" : "ดูรายละเอียด"}`}
                onClick={open} onKeyDown={event => activateWithKeyboard(event, open)}>
                <td><b>{selectedSchool ? doc.file_name : doc.school_name || "—"}</b></td>
                <td>{doc.form_type === "spu" ? "แบบ SPU" : "แบบโรงเรียน"}</td><td className="num">{doc.rows.length}</td>
                <td><span className={`chip c-${status.tone}`}>{status.title}</span></td>
              </tr>;
            }) : <tr><td colSpan={4}><div className="empty">ไม่พบชุดเอกสาร</div></td></tr>}</tbody>
          </table>}
        </div>
      </section>
    </div>
  );
}
