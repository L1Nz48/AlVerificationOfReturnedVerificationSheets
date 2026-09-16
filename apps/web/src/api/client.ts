import type { AuditEntry, DocResult, PollEvent, PollState, RowResult, RunSummary, Settings } from "../types";

// This prototype runs entirely in the browser. No uploaded file is read or sent anywhere.
const KEY = "spu-verification-prototype-v2";
const now = () => new Date().toLocaleString("th-TH");
const time = () => new Date().toLocaleTimeString("th-TH", { hour12: false });

const sampleNames = ["นายกิตติ ตัวอย่าง", "นางสาวปาริชาติ สมมติ", "นายธีรภัทร สาธิต", "นางสาวณิชา ทดลอง", "นายธนภัทร ใจดี", "นางสาวพิชญา แสงทอง", "นายภาคิน วิริยะ", "นางสาววรินทร์ สุขใจ", "นายชยพล ศึกษาดี", "นางสาวอัญชลี มั่นคง"];
function row(docId: number, no: number, variant: "ok" | "negative" | "unclear" = "ok"): RowResult {
  return {
    row_no: no, student_id: `6805${String(docId).padStart(2, "0")}${String(no).padStart(2, "0")}`, full_name: sampleNames[(docId * 3 + no) % sampleNames.length],
    faculty: ["คณะเทคโนโลยีสารสนเทศ", "คณะบริหารธุรกิจ", "คณะนิเทศศาสตร์"][no % 3],
    graduation: variant === "negative" ? "fail" : "pass", doc_date: variant === "unclear" ? "unclear" : "correct", degree: "correct",
    note: variant === "negative" ? "ผลตรวจไม่ผ่าน" : null, confidence: variant === "ok" ? 0.98 : 0.78,
    source_page: 1, scms_match: variant === "ok", scms_name: null, issues: variant === "ok" ? [] : ["ต้องตรวจสอบผลกับเอกสาร"],
    edited: false, adverse: variant === "negative",
  };
}

function document(id: number, name: string, variant: "ok" | "negative" | "unclear" | "other" | "escalate" | "completed"): DocResult {
  const auto = variant === "ok";
  const rows = [row(id, 1), row(id, 2, variant === "negative" || variant === "escalate" ? "negative" : variant === "unclear" ? "unclear" : "ok"), row(id, 3)];
  if (variant === "escalate") rows[1].note = "สงสัยเอกสารปลอมแปลง";
  return {
    id, file_name: name, form_type: variant === "other" ? "other" : "spu", doc_no: `มหป.(ตทน) 01933/2569`, set_no: String(68530 + id),
    school_name: ["โรงเรียนสาธิตตัวอย่าง", "โรงเรียนประชาศึกษา (ข้อมูลสมมติ)", "วิทยาลัยตัวอย่าง"][id % 3], school_code: `00040${String(380 + id)}`,
    verifier_signed: variant !== "unclear", verifier_name: variant === "unclear" ? null : "ผู้ตรวจสอบ ตัวอย่าง", verifier_position: "งานทะเบียน",
    rows, row_count: rows.length, readable_rows: variant === "unclear" ? 2 : 3, min_confidence: auto ? 0.98 : 0.78,
    verdict: auto ? "auto" : "exception", reasons: auto ? [] : [variant === "other" ? "ไม่ใช่แบบฟอร์มของมหาวิทยาลัย" : variant === "negative" ? "ผลตรวจไม่ตรงกับข้อมูลที่คาดไว้" : variant === "escalate" ? "พบหมายเหตุส่อว่าปลอมแปลง ต้องส่งต่อพิจารณา" : variant === "completed" ? "เจ้าหน้าที่ตรวจสอบและยืนยันแล้ว" : "อ่านผลตรวจไม่ชัดหรือไม่พบลายมือชื่อ"],
    status: auto ? "posted" : variant === "completed" ? "confirmed" : "pending",
  };
}

const defaults: Settings = {
  ai_provider: "demo", model: "Gemini (จำลอง)", workers: 3, min_confidence: 0.95, require_all_rows: true, cross_check_scms: true,
  dry_run: true, store_original_scan: false, notify_student: false, prompt: "อ่านข้อมูลจากแบบตรวจสอบวุฒิและส่งเคสที่ไม่มั่นใจให้เจ้าหน้าที่ตรวจ (ข้อความตัวอย่าง)",
  scms_endpoint: "SCMS (จำลอง)", scms_account: "demo-officer", source_dir: "ไฟล์ตัวอย่างในเบราว์เซอร์", archive_dir: "ไม่มีการจัดเก็บไฟล์", has_api_key: false,
};

type DemoData = { docs: DocResult[]; runs: RunSummary[]; settings: Settings; uploads: string[]; audit: Record<number, AuditEntry[]> };
const seed = (): DemoData => ({
  docs: [document(1, "SAMPLE-VERIFY-001.pdf", "ok"), document(2, "SAMPLE-VERIFY-002.pdf", "negative"), document(3, "SAMPLE-VERIFY-003.pdf", "unclear"), document(4, "SAMPLE-VERIFY-004.pdf", "other"), document(5, "SAMPLE-VERIFY-005.pdf", "escalate"), document(6, "SAMPLE-VERIFY-006.pdf", "completed")],
  runs: [{ id: 1, started_at: now(), finished_at: now(), total: 6, auto: 1, exception: 5, posted: 2, status: "done", operator: "เจ้าหน้าที่ (จำลอง)" }],
  settings: defaults, uploads: [], audit: { 1: [{ ts: now(), action: "demo_run", actor: "ระบบจำลอง", detail: { file: "SAMPLE-VERIFY-001.pdf" } }] },
});

function restore(): DemoData {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return JSON.parse(saved) as DemoData;
  } catch { /* private mode or invalid storage */ }
  return seed();
}
let data = restore();
let events: PollEvent[] = [];
let running = false;
let step = 0;
let currentFile = "";
let started = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* demo still works in memory */ } };
const log = (group: string, message: string) => events.push({ kind: "log", ts: time(), group, message });
const queue = () => data.docs.filter(d => d.status === "pending");

export const api = {
  resetDemo: () => { data = seed(); save(); },
  ping: async () => ({ ok: true, backend: "demo", ai: "demo", has_api_key: false }),
  getSettings: async () => ({ ...data.settings }),
  saveSettings: async (patch: Partial<Settings>) => {
    data.settings = { ...data.settings, ...patch, dry_run: true, store_original_scan: false, notify_student: false };
    save(); return { ok: true, settings: { ...data.settings } };
  },
  testAi: async (): Promise<{ ok: boolean; provider?: string; error?: string }> => ({ ok: true, provider: "ตัวอ่านจำลอง — ไม่มีการเรียก AI จริง" }),
  upload: async (files: FileList) => {
    const names = Array.from(files).map(f => f.name);
    data.uploads.push(...names); save();
    return { ok: true, count: data.uploads.length, source_dir: data.settings.source_dir, archive_dir: data.settings.archive_dir, uploaded: names };
  },
  scanSource: async () => ({ ok: true, count: data.uploads.length, source_dir: data.settings.source_dir, archive_dir: data.settings.archive_dir }),
  startRun: async (_operator = "officer") => {
    if (running) return { ok: false, error: "กำลังจำลองการประมวลผลอยู่" };
    running = true; started = Date.now(); step = 3;
    const names = data.uploads.splice(0);
    const files = names.length ? names : ["SAMPLE-VERIFY-005.pdf", "SAMPLE-VERIFY-006.pdf"];
    log("INFO", `เริ่มจำลองการประมวลผล ${files.length} ชุดเอกสาร`);
    let index = 0;
    const advance = () => {
      if (!running) return;
      if (index >= files.length) {
        running = false; step = 10; currentFile = "";
        const recent = data.docs.slice(-files.length);
        const run: RunSummary = { id: (data.runs[0]?.id || 0) + 1, started_at: now(), finished_at: now(), total: recent.length,
          auto: recent.filter(d => d.verdict === "auto").length, exception: recent.filter(d => d.verdict === "exception").length,
          posted: recent.filter(d => d.status === "posted").length, status: "done", operator: "เจ้าหน้าที่ (จำลอง)" };
        data.runs.unshift(run); data.audit[run.id] = recent.map(d => ({ ts: now(), action: "demo_processed", actor: "ระบบจำลอง", detail: { file: d.file_name, verdict: d.verdict } }));
        log("INFO", "ประมวลผลตัวอย่างเสร็จแล้ว"); events.push({ kind: "finished", ts: time(), summary: run }); save(); return;
      }
      currentFile = files[index]; step = 4 + index % 4;
      log("AI", `จำลองการอ่าน ${currentFile}`);
      const id = Math.max(...data.docs.map(d => d.id), 0) + 1;
      const doc = document(id, currentFile, index % 2 ? "unclear" : "ok");
      data.docs.push(doc); events.push({ kind: "document", ts: time(), document: doc });
      log(doc.verdict === "auto" ? "SCMS" : "WARN", doc.verdict === "auto" ? `${currentFile}: บันทึกผลจำลองแล้ว` : `${currentFile}: ส่งเข้าคิวตรวจสอบ`);
      index += 1; save(); timer = setTimeout(advance, 900);
    };
    timer = setTimeout(advance, 650);
    return { ok: true, run_id: (data.runs[0]?.id || 0) + 1, files: files.length };
  },
  stopRun: async () => { running = false; clearTimeout(timer); step = 0; log("WARN", "หยุดการจำลองแล้ว"); return { ok: true }; },
  poll: async (): Promise<{ events: PollEvent[]; state: PollState }> => {
    const drained = events; events = [];
    return { events: drained, state: { running, step, step_name: running ? "กำลังอ่านเอกสารตัวอย่าง" : "", current_file: currentFile,
      source_files: data.uploads.length, elapsed: started ? Math.round((Date.now() - started) / 1000) : 0, run: null } };
  },
  getQueue: async () => queue().map(d => ({ ...d })),
  confirmCase: async (id: number, rows: unknown[]) => {
    const doc = data.docs.find(d => d.id === id);
    if (!doc) return { ok: false, error: "ไม่พบเอกสาร" };
    const edited = (rows as RowResult[]).filter((r, i) =>
      (["student_id", "full_name", "faculty", "graduation", "doc_date", "degree", "note"] as const)
        .some(k => (r[k] ?? null) !== (doc.rows[i]?.[k] ?? null))).length;
    doc.status = "confirmed"; doc.rows = (rows as RowResult[]).map((r, i) => ({ ...doc.rows[i], ...r,
      edited: (["student_id", "full_name", "faculty", "graduation", "doc_date", "degree", "note"] as const)
        .some(k => (r[k] ?? null) !== (doc.rows[i]?.[k] ?? null)) }));
    data.audit[data.runs[0]?.id || 1] ||= [];
    data.audit[data.runs[0]?.id || 1].push({ ts: now(), action: "demo_confirmed", actor: "เจ้าหน้าที่ (จำลอง)", detail: { file: doc.file_name } });
    save(); return { ok: true, edited_rows: edited };
  },
  rejectCase: async (id: number, _reason: string) => {
    const doc = data.docs.find(d => d.id === id);
    if (!doc) return { ok: false, error: "ไม่พบเอกสาร" };
    doc.status = "rejected"; save(); return { ok: true };
  },
  getDocument: async (id: number) => data.docs.find(d => d.id === id) || null,
  getRuns: async (limit = 20) => data.runs.slice(0, limit),
  getRunDocuments: async (_runId: number) => data.docs,
  getAudit: async (runId: number) => data.audit[runId] || [{ ts: now(), action: "demo_run", actor: "ระบบจำลอง", detail: {} }],
  getDashboard: async () => ({ latest_run: data.runs[0] || null, documents: data.docs, queue_size: queue().length, trend: [], storage: "demo" }),
};
