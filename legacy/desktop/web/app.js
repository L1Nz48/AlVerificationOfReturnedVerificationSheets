/* =========================================================================
   UI logic — คุยกับ Python ผ่าน window.Backend (live) หรือโหมดสาธิต (demo)
   ========================================================================= */

const app = (() => {

const STEPS = [
  { no: 3,  nm: "รับไฟล์เข้าระบบ",         ds: "สแกน 300 dpi · 1 ชุด = 1 PDF" },
  { no: 4,  nm: "ตรวจชนิดฟอร์ม",           ds: "บัญชีรายชื่อนักศึกษา (SPU) หรือไม่ใช่" },
  { no: 5,  nm: "อ่านรหัส นศ. / ชื่อ / คณะ", ds: "OCR + cross-check SCMS" },
  { no: 6,  nm: "AI อ่านผลตรวจ",            ds: "3 กลุ่ม · หมายเหตุ · ลายมือชื่อผู้ตรวจสอบ" },
  { no: 7,  nm: "ตรวจตามกฎอัตโนมัติ",       ds: "ครบทุกแถว / conf ≥ 95%" },
  { no: 8,  nm: "รับเคสเข้าคิว Exception",  ds: "เทียบภาพกับค่าที่อ่านได้", human: true },
  { no: 9,  nm: "เจ้าหน้าที่ยืนยัน/แก้ไข",   ds: "กดยืนยันทีละแถว", human: true },
  { no: 10, nm: "บันทึกผลเข้า SCMS",        ds: "อัตโนมัติ + แนบภาพหลักฐาน" },
];

const S = {
  page: "dashboard", docs: [], queue: [], runs: [], logs: [], settings: {},
  sel: null, filter: "all", logFilter: "all",
  running: false, step: 0, elapsed: 0, sourceFiles: 0, total: 0,
  edits: {},          // doc_id -> { row_no -> patch }
};

const B = () => window.Backend.current;
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s === null || s === undefined ? "" : s)
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad = n => String(n).padStart(2, "0");
const mmss = s => Math.floor(s / 60) + ":" + pad(s % 60);
const cc = c => c >= .95 ? "var(--lime)" : c >= .8 ? "var(--amber)" : "var(--red)";
const pct = c => Math.round((c || 0) * 100) + "%";

function toast(kind, msg) {
  const el = document.createElement("div");
  el.className = "toast " + ({ ok: "", warn: "warn", err: "err", info: "info" }[kind] || "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => { el.style.transition = "opacity .2s"; el.style.opacity = 0; setTimeout(() => el.remove(), 220); }, 3000);
}

/* ------------------------------ navigation ------------------------------ */

const META = {
  dashboard: ["ขั้นที่ 3–10", "หน้าหลัก", "ภาพรวมการทำงานของระบบอัตโนมัติ (AI / RPA)"],
  process:   ["ขั้นที่ 3–7",  "ประมวลผลเอกสาร", "รับไฟล์ → ตรวจชนิดฟอร์ม → OCR → AI อ่านเครื่องหมาย → ตรวจตามกฎ"],
  queue:     ["ขั้นที่ 8–9",  "คิวตรวจสอบ (Exception)", "เจ้าหน้าที่เทียบภาพต้นฉบับกับค่าที่ AI อ่านได้ แล้วยืนยันหรือแก้ไข"],
  history:   ["ย้อนหลัง",     "ประวัติการทำงาน", "รอบการประมวลผลย้อนหลัง พร้อม Audit Trail"],
  settings:  ["ตั้งค่า",       "ตั้งค่าระบบ", "โมเดล AI · เกณฑ์การตัดสิน · พร็อมท์ · การเชื่อมต่อ SCMS"],
};

async function go(page) {
  S.page = page;
  $$(".page").forEach(p => p.classList.toggle("on", p.id === "p-" + page));
  $$(".rail-btn[data-page]").forEach(b => b.classList.toggle("on", b.dataset.page === page));
  const m = META[page];
  $("#hdrStep").textContent = m[0]; $("#hdrTitle").textContent = m[1]; $("#hdrSub").textContent = m[2];
  $(".view").scrollTop = 0;
  if (page === "queue") await loadQueue();
  if (page === "history") await loadRuns();
  if (page === "dashboard") renderDash();
}

/* -------------------------------- flow ---------------------------------- */

function renderFlow() {
  const live = S.running ? S.step : 0;
  const done = S.running ? live - 1 : (S.docs.length ? (S.queue.length ? 7 : 10) : 0);
  $("#flowNodes").innerHTML = STEPS.map(s => {
    const cls = s.no === live ? "live" : s.no <= done ? "done" : "";
    return `<div class="node ${cls} ${s.human ? "human" : ""}">
      <div class="n-no">ขั้นที่ ${s.no}</div>
      <div class="n-nm">${esc(s.nm)}</div>
      <div class="n-ds">${esc(s.ds)}</div>
      ${s.human ? '<span class="n-hint">ต้องมีเจ้าหน้าที่</span>' : ""}
    </div>`;
  }).join("");
}

function renderTrack() {
  const live = S.running ? S.step : 0;
  $("#track").innerHTML = STEPS.map(s => {
    let cls = "";
    if (s.no === live) cls = "live";
    else if (S.running && s.no < live) cls = "done";
    else if (!S.running && S.docs.length && s.no <= (S.queue.length ? 7 : 10)) cls = "done";
    return `<div class="tstep ${cls}"><span class="t-no">${s.no}</span><span class="t-nm">${esc(s.nm)}</span></div>`;
  }).join("");
}

/* ------------------------------ dashboard ------------------------------- */

function renderDash() {
  const total = S.docs.length;
  const auto = S.docs.filter(d => d.verdict === "auto").length;
  const ex = S.queue.length;
  const posted = S.docs.filter(d => d.status === "posted" || d.status === "confirmed").length;

  $("#mTotal").textContent = total;
  $("#mAuto").textContent = auto;
  $("#mEx").textContent = ex;
  $("#mPosted").textContent = posted;
  $("#mAvg").textContent = total ? (S.elapsed / total).toFixed(1) : "—";
  $("#mstampt").textContent = S.runs.length ? "รอบที่ " + S.runs[0].id : "ยังไม่มีข้อมูล";

  $("#flowState").innerHTML = S.running
    ? '<span class="led"></span> กำลังประมวลผล'
    : total ? '<span class="led"></span> รอบล่าสุดเสร็จแล้ว' : '<span class="led"></span> พร้อมทำงาน';
  $("#flowState").className = "chip " + (S.running ? "c-cyan" : total ? "c-lime" : "c-gray");
  renderFlow();

  const hist = S.runs.slice(0, 7).reverse();
  const series = hist.concat(S.running ? [{ id: "now", total: total, auto: auto, exception: ex }] : []);
  $("#mSpark").innerHTML = series.map(r =>
    `<i style="height:${Math.max(3, Math.round((r.total || 0) / 40 * 24))}px"></i>`).join("")
    || '<i style="height:3px"></i>';

  const max = Math.max(6, ...series.map(r => r.total || 0));
  $("#tpChart").innerHTML = series.length ? series.map(r => {
    const h = v => Math.round((v || 0) / max * 130);
    return `<div class="tp-col" title="ทั้งหมด ${r.total} · ผ่าน ${r.auto} · เข้าคิว ${r.exception}">
      <div class="tp-stack"><i class="ex" style="height:${h(r.exception)}px"></i><i class="ok" style="height:${h(r.auto)}px"></i></div>
      <div class="tp-x">${r.id === "now" ? "รอบนี้" : "#" + r.id}</div></div>`;
  }).join("") : '<div class="empty">ยังไม่มีรอบการทำงาน</div>';

  const C = 2 * Math.PI * 48;
  const base = Math.max(total, 1);
  $("#dnAuto").setAttribute("stroke-dasharray", (C * auto / base) + " " + C);
  $("#dnEx").setAttribute("stroke-dasharray", (C * ex / base) + " " + C);
  $("#dnEx").setAttribute("stroke-dashoffset", String(-C * auto / base));
  $("#dnPct").textContent = total ? Math.round(auto / total * 100) + "%" : "—";
  $("#dnA").textContent = auto; $("#dnE").textContent = ex;
  $("#dnR").textContent = Math.max(0, S.sourceFiles);

  const feed = S.logs.slice(-8).reverse();
  $("#feed").innerHTML = feed.length ? feed.map(l => `<div class="fev ${l.cls}">
      <span class="f-i"></span><span class="f-t">${l.ts}</span>
      <span class="f-b"><b>[${l.group}]</b> ${esc(l.message)}</span></div>`).join("")
    : '<div class="empty">ยังไม่มีเหตุการณ์ — เริ่มรอบประมวลผลเพื่อดู log</div>';

  syncTelemetry();
}

function syncTelemetry() {
  $("#tmEngine").textContent = S.running ? "ทำงาน" : (S.docs.length ? "เสร็จแล้ว" : "พร้อม");
  $("#tmRate").textContent = S.elapsed && S.docs.length
    ? (S.docs.length / (S.elapsed / 60)).toFixed(1) + " ชุด/นาที" : "—";
  $("#tmQueue").textContent = S.queue.length;
  const b = $("#railBadge");
  b.textContent = S.queue.length;
  b.style.display = S.queue.length ? "" : "none";
  const qc = $("#qCount"); if (qc) qc.textContent = S.queue.length;
}

/* -------------------------------- log ----------------------------------- */

const GRP = { INFO: ["g-info", "info"], AI: ["g-ai", "info"], OK: ["g-ok", "ok"],
              WARN: ["g-warn", "warn"], ERROR: ["g-err", "warn"], SCMS: ["g-scms", "ok"] };

function paintLog() {
  const f = S.logFilter;
  const rows = S.logs.filter(l => f === "all"
    || (f === "ai" && l.group === "AI")
    || (f === "warn" && (l.group === "WARN" || l.group === "ERROR"))
    || (f === "scms" && l.group === "SCMS"));
  const box = $("#term");
  if (!rows.length) { box.innerHTML = '<div class="empty">ยังไม่มีบันทึกการทำงาน</div>'; return; }
  box.innerHTML = rows.map(l => `<div class="tline">
      <span class="tl-t">${l.ts}</span><span class="tl-g ${l.gc}">[${l.group}]</span>
      <span class="tl-m">${esc(l.message)}</span></div>`).join("")
    + (S.running ? '<div class="tline"><span class="tl-t"></span><span class="tl-g"></span><span class="tl-m"><span class="term-cursor"></span></span></div>' : "");
  box.scrollTop = box.scrollHeight;
}

/* ------------------------------ results --------------------------------- */

function renderResults() {
  $("#cAll").textContent = S.docs.length;
  $("#cAuto").textContent = S.docs.filter(d => d.verdict === "auto").length;
  $("#cEx").textContent = S.docs.filter(d => d.verdict === "exception").length;

  const rows = S.docs.filter(d => S.filter === "all" || d.verdict === S.filter);
  if (!rows.length) {
    $("#resBody").innerHTML = '<tr><td colspan="11"><div class="empty">ยังไม่มีผลลัพธ์ — กด “เริ่มรอบประมวลผล”</div></td></tr>';
    return;
  }
  $("#resBody").innerHTML = rows.map((d, i) => {
    const n = d.row_count || (d.rows || []).length;
    const adverse = (d.rows || []).filter(r => r.adverse).length;
    return `<tr>
      <td class="num">${d.id != null ? d.id : i + 1}</td>
      <td>${esc(d.file_name)}</td>
      <td><span class="chip ${d.form_type === "spu" ? "c-cyan" : "c-red"}">${d.form_type === "spu" ? "SPU" : "ไม่ใช่ฟอร์ม SPU"}</span></td>
      <td>${esc(d.school_name || "-")}</td>
      <td class="num">${n}</td>
      <td class="num">${d.readable_rows}</td>
      <td><span class="num" style="color:${cc(d.min_confidence)}">${pct(d.min_confidence)}</span></td>
      <td class="num" style="color:${adverse ? "var(--red)" : "var(--ink-2)"}">${adverse || "-"}</td>
      <td>${d.verifier_signed ? '<span class="chip c-lime">มี</span>' : '<span class="chip c-red">ไม่มี</span>'}</td>
      <td>${d.verdict === "auto"
        ? '<span class="chip c-lime"><span class="led"></span> ผ่าน · บันทึกแล้ว</span>'
        : '<span class="chip c-amber"><span class="led"></span> เข้าคิวตรวจ</span>'}</td>
      <td>${d.verdict === "exception"
        ? `<button class="btn btn-sm btn-pink" onclick="app.openCase(${d.id})">ตรวจสอบ</button>`
        : `<button class="btn btn-sm btn-ghost" onclick="app.openDoc(${d.id})">ดูผล</button>`}</td>
    </tr>`;
  }).join("");
}

function syncMeter() {
  const done = S.docs.length;
  const total = S.total || (done + S.sourceFiles) || 1;
  const p = Math.min(100, Math.round(done / total * 100));
  $("#meterV").textContent = p + "%";
  $("#meterBar").style.width = p + "%";
  $("#srcChip").textContent = S.sourceFiles + " ชุดในโฟลเดอร์";
}

/* ------------------------------ polling --------------------------------- */

async function poll() {
  let res;
  try { res = await B().poll(); } catch (e) { return; }
  (res.events || []).forEach(handleEvent);
  const st = res.state || {};
  S.running = !!st.running;
  S.step = st.step || 0;
  S.elapsed = st.elapsed || 0;
  S.sourceFiles = st.source_files || 0;

  $("#btnStart").disabled = S.running;
  $("#btnStop").disabled = !S.running;
  if (S.running && st.current_file) {
    $("#meterK").textContent = "ขั้นที่ " + S.step + " — " + (st.step_name || "");
    $("#meterFile").textContent = st.current_file;
  }
  renderTrack(); syncMeter(); syncTelemetry();
  if (S.page === "dashboard") renderDash();
}

function handleEvent(ev) {
  if (ev.kind === "log") {
    const g = GRP[ev.group] || GRP.INFO;
    S.logs.push({ ts: ev.ts, group: ev.group, message: ev.message, gc: g[0], cls: g[1] });
    if (S.logs.length > 500) S.logs.shift();
    paintLog();
  } else if (ev.kind === "document") {
    const d = ev.document;
    const idx = S.docs.findIndex(x => x.id != null && x.id === d.id);
    if (idx >= 0) S.docs[idx] = d; else S.docs.push(d);
    renderResults();
  } else if (ev.kind === "finished") {
    $("#meterK").textContent = "ประมวลผลเสร็จสิ้น";
    const auto = S.docs.filter(x => x.verdict === "auto").length;
    $("#meterFile").textContent = "ผ่านอัตโนมัติ " + auto + " ชุด · ใช้เวลา " + mmss(ev.elapsed || 0);
    refreshAll();
    toast("ok", "ประมวลผลเสร็จ — ดูคิวตรวจสอบได้ที่เมนูซ้าย");
  }
}

async function refreshAll() {
  await loadQueue(true);
  await loadRuns(true);
  await loadDocs();
  renderResults(); renderDash();
}

async function loadDocs() {
  try {
    const dash = await B().dashboard();
    if (dash && dash.documents && dash.documents.length) {
      const byId = {};
      S.docs.forEach(d => { byId[d.id] = d; });
      dash.documents.forEach(d => { byId[d.id] = Object.assign(byId[d.id] || {}, d); });
      S.docs = Object.keys(byId).map(k => byId[k]).sort((a, b) => a.id - b.id);
    }
  } catch (e) { /* โหมดสาธิตไม่ต้องทำอะไร */ }
}

/* ------------------------------- queue ---------------------------------- */

async function loadQueue(silent) {
  try { S.queue = await B().queue() || []; } catch (e) { S.queue = []; }
  syncTelemetry();
  if (!silent) renderQueue();
  else if (S.page === "queue") renderQueue();
}

function renderQueue() {
  if (!S.queue.length) {
    $("#qList").innerHTML = '<div class="empty">ไม่มีเคสค้างในคิว<br><span style="font-size:11px">เอกสารทั้งหมดผ่านเกณฑ์อัตโนมัติแล้ว</span></div>';
    $("#scanStage").innerHTML = '<div class="empty">ไม่มีเอกสารให้แสดง</div>';
    $("#qForm").innerHTML = '<div class="empty">ไม่มีเคสให้ตรวจสอบ</div>';
    return;
  }
  if (S.sel == null || !S.queue.some(d => d.id === S.sel)) S.sel = S.queue[0].id;

  $("#qList").innerHTML = S.queue.map(d => `
    <button class="qi ${S.sel === d.id ? "on" : ""}" onclick="app.openCase(${d.id})">
      <div class="qi-f">${esc(d.file_name)}</div>
      <div class="qi-m">
        <span class="chip ${d.form_type === "spu" ? "c-cyan" : "c-red"}">${d.form_type === "spu" ? "SPU" : "ไม่ใช่ฟอร์ม SPU"}</span>
        <span>${d.row_count} แถว</span>
        <span style="color:${cc(d.min_confidence)}">${pct(d.min_confidence)}</span>
      </div>
      <div class="qi-r">${esc((d.reasons || [])[0] || "")}</div>
    </button>`).join("");

  const d = S.queue.find(x => x.id === S.sel);
  renderScan(d); renderForm(d);
}

const markGlyph = m => m === "checked" ? '<span class="mk">✓</span>'
  : m === "unclear" ? '<span class="mk" style="color:#c0392b">~</span>' : "";

const G_LABEL = { graduation: "การสำเร็จการศึกษา", doc_date: "วันที่สำเร็จในเอกสาร", degree: "วุฒิฯ ที่สำเร็จในเอกสาร" };
const POS = { graduation: "pass", doc_date: "correct", degree: "correct" };
const NEG = { graduation: "fail", doc_date: "incorrect", degree: "incorrect" };
const OPTS = {
  graduation: [["pass", "สำเร็จ"], ["fail", "ไม่สำเร็จ"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
  doc_date:   [["correct", "ถูกต้อง"], ["incorrect", "ไม่ถูกต้อง"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
  degree:     [["correct", "ถูกต้อง"], ["incorrect", "ไม่ถูกต้อง"], ["unclear", "อ่านไม่ชัด"], ["", "ไม่ได้กา"]],
};

function cellPair(value, group) {
  const yes = value === POS[group], no = value === NEG[group], unclear = value === "unclear";
  const tick = '<span class="mk">/</span>';
  return `<td style="text-align:center" class="${unclear ? "flag-amber" : ""}">${yes || unclear ? tick : ""}</td>
          <td style="text-align:center" class="${no ? "flag-red" : ""}">${no ? tick : ""}</td>`;
}

function renderScan(d) {
  const rows = (d.rows || []).map(r => `<tr>
    <td class="num" style="text-align:center">${r.row_no}</td>
    <td>${esc(r.student_id)}</td>
    <td>${esc(r.full_name)}</td>
    <td style="font-size:9px">${esc(r.faculty)}</td>
    ${cellPair(r.graduation, "graduation")}
    ${cellPair(r.doc_date, "doc_date")}
    ${cellPair(r.degree, "degree")}
    <td style="text-align:center;${r.note ? "color:#14328f" : ""}">${esc(r.note || "-")}</td>
  </tr>`).join("");

  $("#scanStage").innerHTML = `<div class="sheet">
    <h4>มหาวิทยาลัยศรีปทุม — บัญชีรายชื่อนักศึกษา</h4>
    <div class="s-sub">ขอตรวจสอบวุฒิ · ${esc(d.school_name || "-")}${d.school_code ? " (" + esc(d.school_code) + ")" : ""}</div>
    <div style="display:flex;gap:18px;font-size:10px;color:#5b5f6b;margin-bottom:8px">
      <span>ที่ ${esc(d.doc_no || "-")}</span><span>ชุดที่ ${esc(d.set_no || "-")}</span>
      <span style="margin-left:auto">${esc(d.file_name)}</span>
    </div>
    <table class="sheet-t">
      <thead>
        <tr>
          <th rowspan="2">ลำดับ</th><th rowspan="2">รหัส<br>นักศึกษา</th>
          <th rowspan="2">ชื่อ-สกุล</th><th rowspan="2">คณะ/วิทยาลัย</th>
          <th colspan="2">การสำเร็จการศึกษา</th>
          <th colspan="2">วันที่สำเร็จในเอกสาร</th>
          <th colspan="2">วุฒิฯ ที่สำเร็จในเอกสาร</th>
          <th rowspan="2">หมายเหตุ</th>
        </tr>
        <tr>
          <th>สำเร็จ</th><th>ไม่สำเร็จ</th>
          <th>ถูกต้อง</th><th>ไม่ถูกต้อง</th>
          <th>ถูกต้อง</th><th>ไม่ถูกต้อง</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="text-align:center;margin-top:14px;font-size:10px">
      ตรวจสอบและตรวจทานความถูกต้องแล้ว<br>
      <span style="display:inline-block;margin-top:6px">ลงชื่อ
        ${d.verifier_signed ? '<span class="ink-sig">' + esc((d.verifier_name || "").split(" ")[0]) + "</span>" : "<span style=\"color:#c0392b\">— ไม่พบลายมือชื่อ —</span>"}
        ผู้ตรวจสอบ</span><br>
      <span style="font-size:9.5px;color:#5b5f6b">( ${esc(d.verifier_name || "-")} ) · ตำแหน่ง ${esc(d.verifier_position || "-")}</span>
    </div>
  </div>`;
}

function renderForm(d) {
  const rows = (d.rows || []).map(r => {
    const issues = r.issues || [];
    const sel = g => `<select class="fi" data-f="${g}" onchange="app.edit(this)">${
      OPTS[g].map(o => `<option value="${o[0]}" ${(r[g] || "") === o[0] ? "selected" : ""}>${o[1]}</option>`).join("")
    }</select>`;
    return `<div class="frow" data-row="${r.row_no}">
      <div class="frow-hd">
        <span class="fr-no">แถวที่ ${r.row_no}</span>
        ${issues.length ? '<span class="chip c-amber">ต้องตรวจ</span>' : '<span class="chip c-lime">ปกติ</span>'}
        ${issues.map(i => `<span class="chip c-red">${esc(i)}</span>`).join("")}
        <span style="margin-left:auto;min-width:104px">
          <div class="confline"><div class="confbar"><i style="width:${pct(r.confidence)};background:${cc(r.confidence)}"></i></div>
            <span class="num" style="font-size:11px;color:${cc(r.confidence)}">${pct(r.confidence)}</span></div></span>
      </div>
      <div class="frow-grid">
        <div><div class="fi-lab">รหัสนักศึกษา</div>
          <input class="fi" data-f="student_id" value="${esc(r.student_id)}" oninput="app.edit(this)"></div>
        <div><div class="fi-lab">คณะ/วิทยาลัย</div>
          <input class="fi" data-f="faculty" value="${esc(r.faculty)}" oninput="app.edit(this)"></div>
        <div class="fg"><div class="fi-lab">ชื่อ-สกุล${r.scms_name ? " · SCMS: " + esc(r.scms_name) : ""}</div>
          <input class="fi" data-f="full_name" value="${esc(r.full_name)}" oninput="app.edit(this)"></div>
        <div><div class="fi-lab">การสำเร็จการศึกษา</div>${sel("graduation")}</div>
        <div><div class="fi-lab">วันที่สำเร็จในเอกสาร</div>${sel("doc_date")}</div>
        <div><div class="fi-lab">วุฒิฯ ที่สำเร็จในเอกสาร</div>${sel("degree")}</div>
        <div><div class="fi-lab">หมายเหตุ (ลายมือ)</div>
          <input class="fi" data-f="note" value="${esc(r.note)}" oninput="app.edit(this)"></div>
      </div>
    </div>`;
  }).join("");

  $("#qForm").innerHTML = `
    <div class="qcol-hd">
      <div><h3>${esc(d.file_name)}</h3>
        <div class="tag-label">${esc(d.school_name || "-")} · ${d.row_count} แถว · อ่านได้ ${d.readable_rows}/${d.row_count}</div></div>
      <span class="grow"></span>
      <span class="chip c-amber">รอการยืนยัน</span>
    </div>

    <div class="panel-bd" style="padding:14px 18px 0">
      <div class="ribbon ${d.form_type === "other" ? "red" : ""}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:2px"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
        <div><b>เหตุผลที่ไม่ผ่านเกณฑ์อัตโนมัติ</b>
          <ul>${(d.reasons || []).map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
      </div>
    </div>

    <div class="qcol-hd" style="position:static"><h3 style="font-size:13px">ข้อมูลหัวเอกสารและผู้ตรวจสอบ</h3></div>
    <div class="panel-bd" style="padding:0 18px 14px">
      <dl class="kv">
        <dt>ชนิดฟอร์ม</dt><dd>${d.form_type === "spu"
          ? '<span class="chip c-cyan">บัญชีรายชื่อนักศึกษา (SPU)</span>'
          : '<span class="chip c-red">ไม่ใช่แบบของมหาวิทยาลัย</span>'}</dd>
        <dt>เลขที่หนังสือ</dt><dd>${esc(d.doc_no || "— อ่านไม่ได้ —")}</dd>
        <dt>ชุดที่</dt><dd>${esc(d.set_no || "— อ่านไม่ได้ —")}</dd>
        <dt>โรงเรียน/สถาบัน</dt><dd>${esc(d.school_name || "-")} ${d.school_code ? "(" + esc(d.school_code) + ")" : ""}</dd>
        <dt>ลายมือชื่อผู้ตรวจสอบ</dt><dd>${d.verifier_signed
          ? '<span class="chip c-lime">พบลายมือชื่อ</span>'
          : '<span class="chip c-red">ไม่พบลายมือชื่อ</span>'}</dd>
        <dt>ชื่อผู้ตรวจสอบ</dt><dd>${esc(d.verifier_name || "-")}</dd>
        <dt>ตำแหน่ง</dt><dd>${esc(d.verifier_position || "-")}</dd>
      </dl>
    </div>

    <div class="qcol-hd" style="position:static"><h3 style="font-size:13px">ค่าที่ AI อ่านได้ — แก้ไขได้ก่อนยืนยัน</h3></div>
    ${rows}

    <div class="qbar">
      <button class="btn btn-red" onclick="app.reject(${d.id})">ส่งกลับ / นิติการ</button>
      <span class="grow"></span>
      <button class="btn btn-lime" onclick="app.confirm(${d.id})">ยืนยัน → บันทึกเข้า SCMS</button>
    </div>`;
}

function edit(el) { el.classList.add("edited"); }

function collectRows(docId) {
  return [...document.querySelectorAll("#qForm .frow")].map(box => {
    const get = f => { const el = box.querySelector('[data-f="' + f + '"]'); return el ? (el.value || null) : null; };
    return {
      row_no: parseInt(box.dataset.row, 10),
      student_id: get("student_id"),
      full_name: get("full_name"),
      faculty: get("faculty"),
      graduation: get("graduation"),
      doc_date: get("doc_date"),
      degree: get("degree"),
      note: get("note"),
    };
  });
}

async function openCase(id) {
  S.sel = id;
  if (S.page !== "queue") await go("queue"); else renderQueue();
}

async function confirmCase(id) {
  const rows = collectRows(id);
  const res = await B().confirm(id, rows);
  if (!res || !res.ok) { toast("err", "บันทึกไม่สำเร็จ: " + ((res && res.error) || "ไม่ทราบสาเหตุ")); return; }
  toast("ok", "บันทึกเข้า SCMS แล้ว" + (res.edited_rows ? " · แก้ไข " + res.edited_rows + " แถว (edited flag)" : ""));
  S.sel = null;
  await refreshAll();
  renderQueue();
}

async function reject(id) {
  const res = await B().reject(id, "ส่งกลับให้โรงเรียนต้นสังกัดแก้ไข");
  if (!res || !res.ok) { toast("err", "ส่งกลับไม่สำเร็จ"); return; }
  toast("warn", "ส่งเคสกลับโรงเรียนต้นสังกัดแล้ว");
  S.sel = null;
  await refreshAll();
  renderQueue();
}

/* ------------------------------ history --------------------------------- */

async function loadRuns(silent) {
  try { S.runs = await B().runs() || []; } catch (e) { S.runs = []; }
  if (!silent || S.page === "history") renderHist();
}

function renderHist() {
  if (!S.runs.length) {
    $("#histList").innerHTML = '<div class="panel"><div class="empty">ยังไม่มีรอบการทำงาน</div></div>';
    return;
  }
  $("#histList").innerHTML = S.runs.map(r => {
    const ok = r.status === "done";
    const total = r.total || 0;
    return `<div class="panel hrun ${ok ? "ok" : "warn"}" data-run="${r.id}">
      <div class="hrun-hd" onclick="app.toggleRun(${r.id})">
        <span class="hcaret">›</span>
        <span class="hrun-id">รอบที่ ${r.id}</span>
        <span class="hrun-time">${esc(r.started_at)} → ${esc(r.finished_at || "-")}</span>
        <div class="hrun-stats">
          <div class="hstat"><div class="hs-v">${total}</div><div class="hs-k">ชุดเอกสาร</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--lime)">${r.auto || 0}</div><div class="hs-k">ผ่านอัตโนมัติ</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--amber)">${r.exception || 0}</div><div class="hs-k">เข้าคิว</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--brand)">${r.posted || 0}</div><div class="hs-k">เข้า SCMS</div></div>
          <span class="chip ${ok ? "c-lime" : "c-amber"}">${ok ? "เสร็จสิ้น" : (r.status === "stopped" ? "หยุดกลางคัน" : esc(r.status))}</span>
        </div>
      </div>
      <div class="hbody">
        <dl class="kv" style="margin-top:14px">
          <dt>อัตราผ่านอัตโนมัติ</dt><dd>${total ? Math.round((r.auto || 0) / total * 100) : 0}% (${r.auto || 0}/${total})</dd>
          <dt>บันทึกเข้า SCMS</dt><dd>${r.posted || 0} ชุด</dd>
          <dt>ผู้สั่งรอบทำงาน</dt><dd>${esc(r.operator || "officer")}</dd>
        </dl>
        <div class="audit" id="audit-${r.id}">กำลังโหลด Audit Trail…</div>
      </div>
    </div>`;
  }).join("");
}

async function toggleRun(id) {
  const el = document.querySelector('.hrun[data-run="' + id + '"]');
  el.classList.toggle("open");
  if (!el.classList.contains("open")) return;
  let trail = [];
  try { trail = await B().audit(id) || []; } catch (e) { /* ignore */ }
  const box = $("#audit-" + id);
  box.innerHTML = trail.length ? trail.map(a => {
    const d = a.detail || {};
    const extra = d.verdict ? " · " + d.verdict : (d.file ? " · " + d.file : "");
    return `<div><span>[${esc(a.action)}]</span>${esc(a.ts)} · ${esc(a.actor)}${esc(extra)}</div>`;
  }).join("") : "ไม่มีบันทึกสำหรับรอบนี้";
}

/* ------------------------------- panels --------------------------------- */

async function openDoc(id) {
  let d = S.docs.find(x => x.id === id);
  try { d = await B().document(id) || d; } catch (e) { /* ignore */ }
  if (!d) return;
  panel(d.file_name, "โรงเรียน" + (d.school_name || "-") + " · " + d.row_count + " แถว", `
    <dl class="kv" style="margin-bottom:16px">
      <dt>ชนิดฟอร์ม</dt><dd>${d.form_type === "spu" ? "ฟอร์ม SPU" : "ฟอร์มโรงเรียน"}</dd>
      <dt>อ่านได้ตามเกณฑ์</dt><dd>${d.readable_rows}/${d.row_count} แถว</dd>
      <dt>Confidence ต่ำสุด</dt><dd style="color:${cc(d.min_confidence)}">${pct(d.min_confidence)}</dd>
      <dt>ผลการตัดสิน</dt><dd>${d.verdict === "auto"
        ? '<span class="chip c-lime">ผ่านอัตโนมัติ · บันทึกเข้า SCMS</span>'
        : '<span class="chip c-amber">เข้าคิวตรวจสอบ</span>'}</dd>
      <dt>สถานะ</dt><dd>${esc(d.status)}</dd>
    </dl>
    <table class="t"><thead><tr><th>แถว</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>ผลตรวจ</th><th>Conf</th><th>แก้ไข</th></tr></thead>
      <tbody>${(d.rows || []).map(r => `<tr><td class="num">${r.row_no}</td><td>${esc(r.student_id)}</td>
        <td>${esc(r.full_name)}</td>
        <td>${r.adverse ? '<span class="chip c-red">มีผลลบ</span>' : '<span class="chip c-lime">ผ่าน</span>'}</td>
        <td class="num" style="color:${cc(r.confidence)}">${pct(r.confidence)}</td>
        <td>${r.edited ? '<span class="chip c-amber">edited</span>' : "-"}</td></tr>`).join("")}</tbody></table>`);
}

function help() {
  panel("ขอบเขตของโปรแกรม", "เทียบกับ To-Be End-to-End Flow", `
    <p style="font-size:12.5px;color:var(--ink-2);margin-top:0">โปรแกรมนี้ทำเฉพาะ lane <b>ระบบอัตโนมัติ (AI / RPA)</b> — กล่องสีเขียวในผังงาน คือขั้นที่ 3 ถึง 10</p>
    <table class="t"><thead><tr><th>ขั้น</th><th>งาน</th><th>ผู้ทำ</th></tr></thead><tbody>
      ${STEPS.map(s => `<tr><td class="num">${s.no}</td><td>${esc(s.nm)}
        <div style="font-size:11px;color:var(--ink-3)">${esc(s.ds)}</div></td>
        <td>${s.human ? '<span class="chip c-violet">เจ้าหน้าที่</span>' : '<span class="chip c-cyan">ระบบ</span>'}</td></tr>`).join("")}
    </tbody></table>
    <p style="font-size:12px;color:var(--ink-3);margin-top:14px">ขั้นที่ 1–2 (นักศึกษายื่น / เจ้าหน้าที่รับเอกสาร) อยู่นอกขอบเขต</p>`);
}

function panel(t, s, html) {
  $("#spTitle").textContent = t; $("#spSub").textContent = s; $("#spBody").innerHTML = html;
  $("#sp").classList.add("on"); $("#mask").classList.add("on");
}
function closePanel() { $("#sp").classList.remove("on"); $("#mask").classList.remove("on"); }

/* ------------------------------ settings -------------------------------- */

async function loadSettings() {
  try { S.settings = await B().settings() || {}; } catch (e) { return; }
  const s = S.settings;
  const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
  const check = (sel, v) => { const el = $(sel); if (el) el.checked = !!v; };

  set("#setModel", s.model);
  set("#setWorkers", s.workers);
  set("#setMinConf", Math.round((s.min_confidence || 0) * 100));
  set("#setPrompt", s.prompt);
  set("#setEndpoint", s.scms_endpoint);
  set("#setAccount", s.scms_account);
  check("#setRequireAll", s.require_all_rows);
  check("#setCrossCheck", s.cross_check_scms);
  check("#setDryRun", s.dry_run);
  check("#setStoreScan", s.store_original_scan);
  check("#setNotify", s.notify_student);
  const key = $("#setApiKey");
  if (key) key.placeholder = s.has_api_key ? "•••••••• (ตั้งค่าไว้ใน .env แล้ว)" : "ยังไม่ได้ตั้งค่าใน .env";
}

async function saveSettings() {
  const num = sel => { const el = $(sel); return el ? Number(el.value) : undefined; };
  const val = sel => { const el = $(sel); return el ? el.value : undefined; };
  const chk = sel => { const el = $(sel); return el ? el.checked : undefined; };
  const patch = {
    model: val("#setModel"),
    workers: num("#setWorkers"),
    min_confidence: num("#setMinConf") / 100,
    prompt: val("#setPrompt"),
    scms_endpoint: val("#setEndpoint"),
    scms_account: val("#setAccount"),
    require_all_rows: chk("#setRequireAll"),
    cross_check_scms: chk("#setCrossCheck"),
    dry_run: chk("#setDryRun"),
    store_original_scan: chk("#setStoreScan"),
    notify_student: chk("#setNotify"),
  };
  const res = await B().saveSettings(patch);
  toast(res && res.ok ? "ok" : "err", res && res.ok ? "บันทึกการตั้งค่าแล้ว" : "บันทึกไม่สำเร็จ");
  await scanSource();
}

async function testAi(btn) {
  const old = btn.textContent;
  btn.textContent = "กำลังทดสอบ…"; btn.disabled = true;
  const res = await B().testAi();
  btn.textContent = old; btn.disabled = false;
  toast(res && res.ok ? "ok" : "err",
    res && res.ok ? "เชื่อมต่อสำเร็จ — ตัวอ่าน: " + res.provider : "เชื่อมต่อไม่สำเร็จ: " + (res && res.error));
}

async function chooseFolder(kind) {
  const res = await B().chooseFolder(kind);
  if (res && res.ok) { toast("ok", "ตั้งโฟลเดอร์เป็น " + res.path); await scanSource(); await loadSettings(); }
  else if (res && !res.cancelled) toast("warn", res.error || "เลือกโฟลเดอร์ไม่สำเร็จ");
}

/* -------------------------------- run ----------------------------------- */

async function scanSource() {
  try {
    const res = await B().scanSource();
    S.sourceFiles = res.count || 0;
    $("#srcPathIn").textContent = res.source_dir || "-";
    $("#srcPathOut").textContent = res.archive_dir || "-";
    syncMeter();
  } catch (e) { /* ignore */ }
}

async function start() {
  const res = await B().start();
  if (!res || !res.ok) { toast("warn", (res && res.error) || "เริ่มไม่สำเร็จ"); return; }
  S.total = (res.files || 0) + S.docs.length;
  S.running = true;
  toast("info", "เริ่มรอบประมวลผล " + res.files + " ชุดเอกสาร");
  poll();
}

async function stop() {
  const res = await B().stop();
  if (res && res.ok) toast("warn", "สั่งหยุดแล้ว — จะหยุดหลังจบไฟล์ปัจจุบัน");
}

function resetView() {
  S.docs = []; S.logs = []; S.total = 0;
  paintLog(); renderResults(); renderDash();
  $("#meterK").textContent = "พร้อมเริ่มประมวลผล";
  $("#meterFile").textContent = "ยังไม่ได้เริ่มรอบใหม่";
  if (B().mode === "demo") { B().reset(); scanSource(); }
  toast("info", "ล้างผลบนหน้าจอแล้ว (ข้อมูลในฐานข้อมูลยังอยู่)");
}

/* -------------------------------- init ---------------------------------- */

function wire() {
  $$(".rail-btn[data-page]").forEach(b => b.onclick = () => go(b.dataset.page));
  $$("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
  $("#btnTheme").onclick = () => {
    const el = document.documentElement;
    el.dataset.theme = el.dataset.theme === "dark" ? "light" : "dark";
  };
  $("#btnHelp").onclick = help;
  $("#btnStart").onclick = start;
  $("#btnStop").onclick = stop;
  $("#btnReset").onclick = resetView;
  $("#btnClearLog").onclick = () => { S.logs = []; paintLog(); };
  $("#spClose").onclick = closePanel;
  $("#mask").onclick = closePanel;
  $$("#resTabs .tab").forEach(b => b.onclick = () => {
    $$("#resTabs .tab").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); S.filter = b.dataset.f; renderResults();
  });
  $$("#termFilters .tf").forEach(b => b.onclick = () => {
    $$("#termFilters .tf").forEach(x => x.classList.remove("on"));
    b.classList.add("on"); S.logFilter = b.dataset.g; paintLog();
  });
  $$("#snav .snav-b").forEach(b => b.onclick = () => {
    $$("#snav .snav-b").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    $$(".sgroup").forEach(g => g.classList.toggle("on", g.dataset.s === b.dataset.s));
  });
}

async function boot(backend) {
  const info = await backend.info();
  const badge = $("#tmScms");
  if (backend.mode === "demo") {
    badge.textContent = "โหมดสาธิต";
    $("#tmScms").parentElement.classList.remove("ok");
    toast("info", "กำลังเปิดในเบราว์เซอร์ — ใช้ข้อมูลจำลอง (รันจริงด้วย python3 main.py)");
  } else {
    badge.textContent = info.backend === "mysql" ? "MySQL" : "SQLite";
  }
  await scanSource();
  await loadSettings();
  await refreshAll();
  renderTrack(); paintLog();
  setInterval(poll, 450);
}

document.addEventListener("DOMContentLoaded", () => {
  wire();
  renderFlow(); renderTrack(); renderResults();
  window.Backend.ready(boot);
});

return { go, openCase, confirm: confirmCase, reject, openDoc, toggleRun, toast,
         edit, testAi, chooseFolder, saveSettings, help };
})();
