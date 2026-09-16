import { useEffect, useState } from "react";
import { cc, pct } from "../lib/format";
import { useApp } from "../state/store";
import type { RowResult } from "../types";

const POS: Record<string, string> = { graduation: "pass", doc_date: "correct", degree: "correct" };
const NEG: Record<string, string> = { graduation: "fail", doc_date: "incorrect", degree: "incorrect" };
const OPTS: Record<string, [string, string][]> = {
  graduation: [["pass", "สำเร็จ"], ["fail", "ไม่สำเร็จ"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
  doc_date: [["correct", "ถูกต้อง"], ["incorrect", "ไม่ถูกต้อง"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
  degree: [["correct", "ถูกต้อง"], ["incorrect", "ไม่ถูกต้อง"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
};

function cellPair(value: string | null, group: string) {
  const yes = value === POS[group], no = value === NEG[group], unclear = value === "unclear";
  const tick = <span className="mk">/</span>;
  return (
    <>
      <td style={{ textAlign: "center" }} className={unclear ? "flag-amber" : ""}>{yes || unclear ? tick : ""}</td>
      <td style={{ textAlign: "center" }} className={no ? "flag-red" : ""}>{no ? tick : ""}</td>
    </>
  );
}

type RowPatch = Partial<Pick<RowResult, "student_id" | "full_name" | "faculty" | "graduation" | "doc_date" | "degree" | "note">>;

export default function Queue() {
  const { state, setSel, openCase, confirmCase, rejectCase } = useApp();
  const [edits, setEdits] = useState<Record<number, RowPatch>>({});

  const queue = state.queue;
  const sel = state.sel != null && queue.some(d => d.id === state.sel) ? state.sel : (queue[0]?.id ?? null);
  const doc = queue.find(d => d.id === sel);

  useEffect(() => { setEdits({}); }, [sel]);

  if (!queue.length) {
    return (
      <div className="q3">
        <div className="qcol qcol-list"><div className="qcol-hd"><h3>คิวรอตรวจสอบ</h3><span className="grow" /><span className="chip c-amber num">0</span></div>
          <div className="empty">ไม่มีเคสค้างในคิว<br /><span style={{ fontSize: 11 }}>เอกสารทั้งหมดผ่านเกณฑ์อัตโนมัติแล้ว</span></div>
        </div>
        <div className="qcol qcol-doc"><div className="qcol-hd"><h3>ภาพเอกสารต้นฉบับ</h3></div><div className="scan-stage"><div className="empty">ไม่มีเอกสารให้แสดง</div></div></div>
        <div className="qcol qcol-form"><div className="empty">ไม่มีเคสให้ตรวจสอบ</div></div>
      </div>
    );
  }

  const patch = (rowNo: number, field: keyof RowPatch, value: string) => {
    setEdits(prev => ({ ...prev, [rowNo]: { ...prev[rowNo], [field]: value } }));
  };
  const val = (r: RowResult, field: keyof RowPatch) => (edits[r.row_no]?.[field] ?? r[field] ?? "") as string;
  const isEdited = (rowNo: number) => !!edits[rowNo];

  const doConfirm = () => {
    if (!doc) return;
    const rows = doc.rows.map(r => ({
      row_no: r.row_no,
      student_id: val(r, "student_id") || null,
      full_name: val(r, "full_name") || null,
      faculty: val(r, "faculty") || null,
      graduation: val(r, "graduation") || null,
      doc_date: val(r, "doc_date") || null,
      degree: val(r, "degree") || null,
      note: val(r, "note") || null,
    }));
    confirmCase(doc.id, rows);
  };

  return (
    <div className="q3">
      <div className="qcol qcol-list">
        <div className="qcol-hd"><h3>คิวรอตรวจสอบ</h3><span className="grow" /><span className="chip c-amber num">{queue.length}</span></div>
        <div>
          {queue.map(d => (
            <button key={d.id} className={"qi" + (sel === d.id ? " on" : "")} onClick={() => openCase(d.id)}>
              <div className="qi-f">{d.file_name}</div>
              <div className="qi-m">
                <span className={"chip " + (d.form_type === "spu" ? "c-cyan" : "c-red")}>{d.form_type === "spu" ? "SPU" : "ไม่ใช่ฟอร์ม SPU"}</span>
                <span>{d.row_count} แถว</span>
                <span style={{ color: cc(d.min_confidence) }}>{pct(d.min_confidence)}</span>
              </div>
              <div className="qi-r">{(d.reasons || [])[0] || ""}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="qcol qcol-doc">
        <div className="qcol-hd"><h3>ภาพเอกสารต้นฉบับ</h3></div>
        <div className="scan-stage">
          {doc && (
            <div className="sheet">
              <h4>มหาวิทยาลัยศรีปทุม — บัญชีรายชื่อนักศึกษา</h4>
              <div className="s-sub">ขอตรวจสอบวุฒิ · {doc.school_name || "-"}{doc.school_code ? ` (${doc.school_code})` : ""}</div>
              <div style={{ display: "flex", gap: 18, fontSize: 10, color: "#5b5f6b", marginBottom: 8 }}>
                <span>ที่ {doc.doc_no || "-"}</span><span>ชุดที่ {doc.set_no || "-"}</span>
                <span style={{ marginLeft: "auto" }}>{doc.file_name}</span>
              </div>
              <table className="sheet-t">
                <thead>
                  <tr>
                    <th rowSpan={2}>ลำดับ</th><th rowSpan={2}>รหัส<br />นักศึกษา</th>
                    <th rowSpan={2}>ชื่อ-สกุล</th><th rowSpan={2}>คณะ/วิทยาลัย</th>
                    <th colSpan={2}>การสำเร็จการศึกษา</th>
                    <th colSpan={2}>วันที่สำเร็จในเอกสาร</th>
                    <th colSpan={2}>วุฒิฯ ที่สำเร็จในเอกสาร</th>
                    <th rowSpan={2}>หมายเหตุ</th>
                  </tr>
                  <tr>
                    <th>สำเร็จ</th><th>ไม่สำเร็จ</th>
                    <th>ถูกต้อง</th><th>ไม่ถูกต้อง</th>
                    <th>ถูกต้อง</th><th>ไม่ถูกต้อง</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.rows.map(r => (
                    <tr key={r.row_no}>
                      <td className="num" style={{ textAlign: "center" }}>{r.row_no}</td>
                      <td>{r.student_id}</td>
                      <td>{r.full_name}</td>
                      <td style={{ fontSize: 9 }}>{r.faculty}</td>
                      {cellPair(r.graduation, "graduation")}
                      {cellPair(r.doc_date, "doc_date")}
                      {cellPair(r.degree, "degree")}
                      <td style={{ textAlign: "center", color: r.note ? "#14328f" : undefined }}>{r.note || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ textAlign: "center", marginTop: 14, fontSize: 10 }}>
                ตรวจสอบและตรวจทานความถูกต้องแล้ว<br />
                <span style={{ display: "inline-block", marginTop: 6 }}>ลงชื่อ{" "}
                  {doc.verifier_signed
                    ? <span className="ink-sig">{(doc.verifier_name || "").split(" ")[0]}</span>
                    : <span style={{ color: "#c0392b" }}>— ไม่พบลายมือชื่อ —</span>}
                  {" "}ผู้ตรวจสอบ</span><br />
                <span style={{ fontSize: 9.5, color: "#5b5f6b" }}>( {doc.verifier_name || "-"} ) · ตำแหน่ง {doc.verifier_position || "-"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="qcol qcol-form">
        {doc && (
          <>
            <div className="qcol-hd">
              <div><h3>{doc.file_name}</h3>
                <div className="tag-label">{doc.school_name || "-"} · {doc.row_count} แถว · อ่านได้ {doc.readable_rows}/{doc.row_count}</div></div>
              <span className="grow" />
              <span className="chip c-amber">รอการยืนยัน</span>
            </div>

            <div className="panel-bd" style={{ padding: "14px 18px 0" }}>
              <div className={"ribbon" + (doc.form_type === "other" ? " red" : "")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: "none", marginTop: 2 }}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                <div><b>เหตุผลที่ไม่ผ่านเกณฑ์อัตโนมัติ</b>
                  <ul>{(doc.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul></div>
              </div>
            </div>

            <div className="qcol-hd" style={{ position: "static" }}><h3 style={{ fontSize: 13 }}>ข้อมูลหัวเอกสารและผู้ตรวจสอบ</h3></div>
            <div className="panel-bd" style={{ padding: "0 18px 14px" }}>
              <dl className="kv">
                <dt>ชนิดฟอร์ม</dt><dd>{doc.form_type === "spu"
                  ? <span className="chip c-cyan">บัญชีรายชื่อนักศึกษา (SPU)</span>
                  : <span className="chip c-red">ไม่ใช่แบบของมหาวิทยาลัย</span>}</dd>
                <dt>เลขที่หนังสือ</dt><dd>{doc.doc_no || "— อ่านไม่ได้ —"}</dd>
                <dt>ชุดที่</dt><dd>{doc.set_no || "— อ่านไม่ได้ —"}</dd>
                <dt>โรงเรียน/สถาบัน</dt><dd>{doc.school_name || "-"} {doc.school_code ? `(${doc.school_code})` : ""}</dd>
                <dt>ลายมือชื่อผู้ตรวจสอบ</dt><dd>{doc.verifier_signed
                  ? <span className="chip c-lime">พบลายมือชื่อ</span>
                  : <span className="chip c-red">ไม่พบลายมือชื่อ</span>}</dd>
                <dt>ชื่อผู้ตรวจสอบ</dt><dd>{doc.verifier_name || "-"}</dd>
                <dt>ตำแหน่ง</dt><dd>{doc.verifier_position || "-"}</dd>
              </dl>
            </div>

            <div className="qcol-hd" style={{ position: "static" }}><h3 style={{ fontSize: 13 }}>ค่าที่ AI อ่านได้ — แก้ไขได้ก่อนยืนยัน</h3></div>
            {doc.rows.map(r => (
              <div className="frow" key={r.row_no}>
                <div className="frow-hd">
                  <span className="fr-no">แถวที่ {r.row_no}</span>
                  {(r.issues || []).length ? <span className="chip c-amber">ต้องตรวจ</span> : <span className="chip c-lime">ปกติ</span>}
                  {(r.issues || []).map((i, idx) => <span className="chip c-red" key={idx}>{i}</span>)}
                  <span style={{ marginLeft: "auto", minWidth: 104 }}>
                    <div className="confline"><div className="confbar"><i style={{ width: pct(r.confidence), background: cc(r.confidence) }} /></div>
                      <span className="num" style={{ fontSize: 11, color: cc(r.confidence) }}>{pct(r.confidence)}</span></div></span>
                </div>
                <div className="frow-grid">
                  <div><div className="fi-lab">รหัสนักศึกษา</div>
                    <input className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "student_id")} onChange={e => patch(r.row_no, "student_id", e.target.value)} /></div>
                  <div><div className="fi-lab">คณะ/วิทยาลัย</div>
                    <input className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "faculty")} onChange={e => patch(r.row_no, "faculty", e.target.value)} /></div>
                  <div className="fg"><div className="fi-lab">ชื่อ-สกุล{r.scms_name ? " · SCMS: " + r.scms_name : ""}</div>
                    <input className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "full_name")} onChange={e => patch(r.row_no, "full_name", e.target.value)} /></div>
                  <div><div className="fi-lab">การสำเร็จการศึกษา</div>
                    <select className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "graduation")} onChange={e => patch(r.row_no, "graduation", e.target.value)}>
                      {OPTS.graduation.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                    </select></div>
                  <div><div className="fi-lab">วันที่สำเร็จในเอกสาร</div>
                    <select className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "doc_date")} onChange={e => patch(r.row_no, "doc_date", e.target.value)}>
                      {OPTS.doc_date.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                    </select></div>
                  <div><div className="fi-lab">วุฒิฯ ที่สำเร็จในเอกสาร</div>
                    <select className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "degree")} onChange={e => patch(r.row_no, "degree", e.target.value)}>
                      {OPTS.degree.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                    </select></div>
                  <div><div className="fi-lab">หมายเหตุ (ลายมือ)</div>
                    <input className={"fi" + (isEdited(r.row_no) ? " edited" : "")} value={val(r, "note")} onChange={e => patch(r.row_no, "note", e.target.value)} /></div>
                </div>
              </div>
            ))}

            <div className="qbar">
              <button className="btn btn-red" onClick={() => { setSel(null); rejectCase(doc.id); }}>ส่งกลับ / นิติการ</button>
              <span className="grow" />
              <button className="btn btn-lime" onClick={doConfirm}>ยืนยัน → บันทึกเข้า SCMS</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
