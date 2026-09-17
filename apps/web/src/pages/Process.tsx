import { useRef, useState } from "react";
import { cc, pct } from "../lib/format";
import { usePanel } from "../state/panel";
import { useApp } from "../state/store";
import DocDetail from "../components/panels/DocDetail";

async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => (entry as FileSystemFileEntry).file(file => resolve([file]), reject));
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const children: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(filesFromEntry))).flat();
}

export default function Process() {
  const { state, go, start, stop, resetView, setFilter, uploadFiles, openCase } = useApp();
  const { openPanel } = usePanel();
  const input = useRef<HTMLInputElement>(null);
  const runBase = useRef(state.docs.length);
  const [hasStarted, setHasStarted] = useState(false);
  const [uploadNote, setUploadNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const docs = state.docs.filter(d => state.filter === "all" || state.filter === "auto" && d.verdict === "auto"
    || state.filter === "exception" && d.status === "pending");
  const auto = state.docs.filter(d => d.verdict === "auto").length;
  const review = state.docs.filter(d => d.status === "pending").length;
  const runTotal = Math.max(state.total - runBase.current, 1);
  const processed = Math.max(state.docs.length - runBase.current, 0);
  const progress = hasStarted ? Math.min(100, Math.round(processed / runTotal * 100)) : 0;

  const receiveFiles = async (files: File[]) => {
    const pdfs = files.filter(file => /\.pdf$/i.test(file.name));
    if (pdfs.length) await uploadFiles(pdfs);
    setUploadNote(files.length ? pdfs.length ? `เลือก PDF ${pdfs.length} ไฟล์${files.length !== pdfs.length ? ` · ข้ามไฟล์อื่น ${files.length - pdfs.length} ไฟล์` : ""}` : "ไม่พบไฟล์ PDF ในรายการที่เลือก" : "");
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await receiveFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const entries = Array.from(e.dataTransfer.items).filter(item => item.kind === "file")
      .map(item => item.webkitGetAsEntry()).filter((entry): entry is FileSystemEntry => entry !== null);
    const fallbackFiles = Array.from(e.dataTransfer.files);
    try {
      await receiveFiles(entries.length ? (await Promise.all(entries.map(filesFromEntry))).flat() : fallbackFiles);
    } catch {
      setUploadNote("ไม่สามารถอ่านรายชื่อไฟล์จากโฟลเดอร์นี้ได้");
    }
  };

  return <div className="process-page">
    <div className="process-intro">
      <div><span className="process-kicker">ขั้นที่ 3–10 · Prototype</span><h2>ประมวลผลเอกสาร</h2>
        </div>
      <span className="chip c-pink">ไม่มีการอ่านหรือส่งเนื้อหาไฟล์</span>
    </div>

    <div className="process-top">
      <section className="panel process-action">
        <div className="process-section-head"><div><h3>ประมวลผลไฟล์เอกสาร</h3></div></div>
        <div className={`process-upload${dragging ? " dragging" : ""}`}
          onDragEnter={e => { if (e.dataTransfer.types.includes("Files")) setDragging(true); }}
          onDragOver={e => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
          onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <div><strong>{state.sourceFiles ? `พร้อมจำลอง ${state.sourceFiles} ไฟล์ PDF` : "อัปโหลดเอกสาร"}</strong>
            <span>{uploadNote || (state.sourceFiles ? "รอบถัดไปจะใช้ชื่อไฟล์ที่เลือก" : "ลากไฟล์หรือโฟลเดอร์ PDF มาวางที่นี่ได้")}</span></div>

          <input ref={input} type="file" multiple hidden accept=".pdf,application/pdf" onChange={onUpload} aria-label="เลือกไฟล์ PDF" />
          <button className="btn" type="button" onClick={() => input.current?.click()}>อัปโหลด</button>
        </div>
        <div className="process-actions">
          <button className="btn btn-pink" disabled={state.running} onClick={() => { runBase.current = state.docs.length; setHasStarted(true); start(); }}>▶ เริ่มประมวลผล</button>
          {state.running && <button className="btn btn-red" onClick={stop}>หยุด</button>}
          <button className="btn btn-ghost" onClick={resetView}>ล้างผลบนหน้าจอ</button>
        </div>
      </section>

      <section className="panel process-status">
        <div className="process-section-head"><div><h3>สถานะการประมวลผล</h3><p>{state.running ? "กำลังจำลองการอ่านเอกสาร" : state.docs.length ? "ดูผลล่าสุดได้ที่ผลการประมวล" : "รอเริ่มรอบสาธิต"}</p></div>
          <span className={`chip ${state.running ? "c-pink" : "c-gray"}`}>{state.running ? "กำลังทำงาน" : "พร้อมใช้งาน"}</span></div>
        <div className="process-current"><span>ไฟล์ปัจจุบัน</span><strong>{state.currentFile || "ยังไม่มีไฟล์ที่กำลังประมวลผล"}</strong></div>
        <div className="process-progress-line"><span>{state.running ? `ขั้นที่ ${state.step} · ${state.stepName}` : "ความคืบหน้ารอบสาธิต"}</span><b>{progress}%</b></div>
        <div className="process-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>
        <div className="process-stats"><div><strong>{state.docs.length}</strong><span>ชุดเอกสารที่แสดง</span></div><div><strong>{auto}</strong><span>ผ่านอัตโนมัติ</span></div><div><strong>{review}</strong><span>รอตรวจ</span></div></div>
      </section>
    </div>

    <div className="process-bottom">
      <section className="panel process-results">
        <div className="process-block-head"><div><h3>ผลการประมวลผล</h3><p>กดดูรายละเอียดหรือไปตรวจเคสที่ยังรอเจ้าหน้าที่</p></div><button className="btn btn-sm btn-ghost" onClick={() => go("queue")}>เปิดคิวตรวจ →</button></div>
        <div className="process-filters">{(["all", "auto", "exception"] as const).map(f => <button key={f} className={state.filter === f ? "active" : ""} onClick={() => setFilter(f)}>
          {f === "all" ? "ทั้งหมด" : f === "auto" ? "ผ่านอัตโนมัติ" : "รอตรวจ"}<span>{f === "all" ? state.docs.length : f === "auto" ? auto : review}</span>
        </button>)}</div>
        <div className="process-result-list">{docs.length ? docs.map(d => <div className="process-result" key={d.id}>
          <span className={`process-result-mark ${d.verdict === "auto" ? "pass" : "check"}`}>{d.verdict === "auto" ? "✓" : "!"}</span>
          <div className="process-result-main"><strong>{d.file_name}</strong><span>{d.school_name || "ไม่ระบุโรงเรียน"} · {d.row_count} รายชื่อ</span></div>
          <div className="process-result-meta"><span className={`chip ${d.status === "confirmed" ? "c-pink" : d.verdict === "auto" ? "c-lime" : "c-amber"}`}>{d.status === "confirmed" ? "ยืนยันแล้ว" : d.status === "rejected" ? "ส่งกลับแล้ว" : d.verdict === "auto" ? "ผ่านอัตโนมัติ" : "รอตรวจ"}</span><small style={{ color: cc(d.min_confidence) }}>มั่นใจ {pct(d.min_confidence)}</small></div>
          <button className="btn btn-sm btn-ghost" onClick={() => d.status === "pending" ? openCase(d.id) : openPanel(d.file_name, `${d.school_name || "—"} · ${d.row_count} รายชื่อ`, <DocDetail d={d} />)}>{d.status === "pending" ? "ตรวจเคส →" : "ดูผล →"}</button>
        </div>) : <div className="empty">ยังไม่มีผลในหมวดนี้</div>}</div>
      </section>

    </div>
  </div>;
}
