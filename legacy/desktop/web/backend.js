/* =========================================================================
   ชั้นเชื่อมข้อมูลของ UI
   - LiveBackend : เรียก Python ผ่าน window.pywebview.api (โหมดเดสก์ท็อป)
   - DemoBackend : จำลองข้อมูลในเบราว์เซอร์ เมื่อเปิดไฟล์ index.html ตรง ๆ
   ทั้งสองตัวคืนค่ารูปแบบเดียวกัน UI จึงไม่ต้องรู้ว่าอยู่โหมดไหน
   ========================================================================= */

(function () {
  "use strict";

  /* ------------------------------ LIVE -------------------------------- */

  const LiveBackend = {
    mode: "live",
    api: null,
    info()                  { return this.api.ping(); },
    scanSource()            { return this.api.scan_source(); },
    start()                 { return this.api.start_run("officer"); },
    stop()                  { return this.api.stop_run(); },
    poll()                  { return this.api.poll(); },
    queue()                 { return this.api.get_queue(); },
    confirm(id, rows)       { return this.api.confirm_case(id, rows, "officer"); },
    reject(id, reason)      { return this.api.reject_case(id, reason || "", "officer"); },
    runs()                  { return this.api.get_runs(20); },
    runDocuments(runId)     { return this.api.get_run_documents(runId); },
    audit(runId)            { return this.api.get_audit(runId); },
    dashboard()             { return this.api.get_dashboard(); },
    settings()              { return this.api.get_settings(); },
    saveSettings(patch)     { return this.api.save_settings(patch); },
    testAi()                { return this.api.test_ai(); },
    chooseFolder(kind)      { return this.api.choose_folder(kind); },
    document(id)            { return this.api.get_document(id); },
  };

  /* ------------------------------ DEMO -------------------------------- */

  const SCHOOLS = [
    ["โรงเรียนเฉลิมพระเกียรติสมเด็จพระศรีนครินทร์ กาญจนบุรี", "00040384"],
    ["โรงเรียนสตรีวิทยา", "00010112"],
    ["โรงเรียนสวนกุหลาบวิทยาลัย", "00010101"],
    ["โรงเรียนหอวัง", "00010455"],
  ];
  const FACULTIES = ["คณะนิเทศศาสตร์", "คณะบริหารธุรกิจ", "คณะวิศวกรรมศาสตร์", "คณะบัญชี",
    "คณะนิติศาสตร์", "คณะศิลปศาสตร์", "คณะเทคโนโลยีสารสนเทศ", "คณะสถาปัตยกรรมศาสตร์"];
  const NAMES = ["นายวิชญ์ พลดี อินทร์", "นางสาวกมลวรรณ รัตนโกมล", "นายณัฐวุฒิ ศรีสุวรรณ",
    "นางสาวปิยธิดา มณีนิล", "นายธนภัทร วงศ์สวัสดิ์", "นางสาวอริสรา ทองมาก",
    "นายกฤษฎา เลิศพิบูลย์", "นางสาวชลธิชา แก้วกาญจน์", "นายภาคิน จันทร์ประเสริฐ"];
  const VERIFIERS = [["จิรพร รัตนวิไล", "จนท."], ["สมชาย ใจกว้าง", "หัวหน้างานทะเบียน"]];
  const G_LABEL = { graduation: "การสำเร็จการศึกษา", doc_date: "วันที่สำเร็จในเอกสาร", degree: "วุฒิฯ ที่สำเร็จในเอกสาร" };
  const NEG_LABEL = { fail: "ไม่สำเร็จ", incorrect: "ไม่ถูกต้อง" };
  const STEP_NAMES = {
    3: "รับไฟล์เข้าระบบ", 4: "ตรวจชนิดฟอร์ม", 5: "อ่านรหัส นศ. / ชื่อ / คณะ",
    6: "AI อ่านผลตรวจ", 7: "ตรวจตามกฎอัตโนมัติ", 8: "รับเคสเข้าคิว Exception",
    9: "เจ้าหน้าที่ยืนยัน / แก้ไข", 10: "บันทึกผลเข้า SCMS",
  };
  const TOTAL = 12;

  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = a => a[rnd(0, a.length - 1)];
  const hhmmss = () => new Date().toTimeString().slice(0, 8);

  function demoDoc(id) {
    const roll = Math.random();
    const kind = roll < .10 ? "other" : roll < .30 ? "forged" : roll < .44 ? "low-conf"
      : roll < .52 ? "mismatch" : "ok";
    const n = rnd(5, 9);
    const forgedFrom = kind === "forged" ? rnd(2, n) : n + 1;
    const school = pick(SCHOOLS);
    const verifier = pick(VERIFIERS);
    const signed = !(kind !== "ok" && Math.random() < .18);

    const rows = [];
    for (let i = 1; i <= n; i++) {
      const forged = i >= forgedFrom;
      const bad = kind !== "ok" && (forged || Math.random() < .18);
      const conf = (bad && kind === "low-conf") ? rnd(55, 89) / 100 : rnd(96, 100) / 100;
      let graduation = "pass", doc_date = "correct", degree = "correct", note = null;
      if (forged) { graduation = "fail"; doc_date = "incorrect"; degree = "incorrect"; note = "ปลอมแปลง"; }
      else if (bad && kind === "low-conf" && Math.random() < .5) degree = "unclear";
      else if (bad && Math.random() < .3) doc_date = null;

      const issues = [];
      if (conf < .95) issues.push("confidence ต่ำกว่าเกณฑ์");
      ["graduation", "doc_date", "degree"].forEach(g => {
        const v = { graduation: graduation, doc_date: doc_date, degree: degree }[g];
        if (v === null) issues.push("ไม่ได้กาช่อง" + G_LABEL[g]);
        else if (v === "unclear") issues.push("กาช่อง" + G_LABEL[g] + " ไม่ชัด");
        else if (NEG_LABEL[v]) issues.push(G_LABEL[g] + " = " + NEG_LABEL[v]);
      });
      const match = !(kind === "mismatch" && bad);
      if (!match) issues.push("ชื่อ-สกุลไม่ตรงกับข้อมูลใน SCMS");
      if (note) issues.push("หมายเหตุระบุการปลอมแปลง — ต้องส่งนิติการ");

      rows.push({
        row_no: i, student_id: "68" + rnd(50000, 59999) + rnd(0, 9),
        full_name: pick(NAMES), faculty: pick(FACULTIES),
        graduation: graduation, doc_date: doc_date, degree: degree, note: note,
        marks: [graduation, doc_date, degree],
        adverse: graduation === "fail" || doc_date === "incorrect" || degree === "incorrect",
        confidence: conf, source_page: 1, scms_match: match, scms_name: null,
        issues: issues, edited: false,
      });
    }

    const reasons = [];
    if (kind === "other") reasons.push("ฟอร์มไม่ใช่แบบของมหาวิทยาลัย — ไม่ผ่านเกณฑ์ทันที ส่งเจ้าหน้าที่ตรวจ 100%");
    if (!signed) reasons.push("ไม่พบลายมือชื่อผู้ตรวจสอบท้ายเอกสาร");
    const forged = rows.filter(r => r.note).length;
    const adverse = rows.filter(r => r.adverse).length;
    const unmarked = rows.filter(r => r.doc_date === null).length;
    const unclear = rows.filter(r => r.degree === "unclear").length;
    const low = rows.filter(r => r.confidence < .95).length;
    const mism = rows.filter(r => r.scms_match === false).length;
    if (forged) reasons.push("พบหมายเหตุระบุการปลอมแปลง " + forged + " แถว — ห้าม Auto-Post ต้องส่งนิติการ");
    if (adverse) reasons.push("มีผลตรวจเป็นลบ (ไม่สำเร็จ / ไม่ถูกต้อง) " + adverse + " แถว — ต้องให้เจ้าหน้าที่ดำเนินการ");
    if (unmarked) reasons.push("มีช่องผลตรวจที่ยังไม่ได้กา " + unmarked + " ช่อง");
    if (unclear) reasons.push("กาเครื่องหมายไม่ชัด " + unclear + " ช่อง");
    if (low) reasons.push("มี " + low + " แถวที่ confidence ต่ำกว่าเกณฑ์ 95%");
    if (mism) reasons.push("ข้อมูลไม่ตรงกับ SCMS " + mism + " แถว");
    const readable = rows.filter(r => r.confidence >= .95).length;
    if (readable < n) reasons.push("อ่านได้ไม่ครบทุกแถว (" + readable + "/" + n + ")");

    return {
      id: id, file_name: "VERIFY-2569-" + String(id).padStart(3, "0") + ".pdf",
      form_type: kind === "other" ? "other" : "spu",
      doc_no: "มหป.(ตทน) " + rnd(1000, 99999) + "/2569",
      set_no: String(rnd(60000, 69999)),
      school_name: school[0], school_code: school[1],
      verifier_signed: signed,
      verifier_name: signed ? verifier[0] : null,
      verifier_position: signed ? verifier[1] : null,
      rows: rows, row_count: n, readable_rows: readable,
      min_confidence: Math.min.apply(null, rows.map(r => r.confidence)),
      verdict: reasons.length ? "exception" : "auto",
      reasons: reasons, status: reasons.length ? "pending" : "posted",
    };
  }

  const DemoBackend = {
    mode: "demo",
    _events: [], _docs: [], _queue: [], _runs: [], _runNo: 0,
    _running: false, _timer: null, _sub: 0, _t0: 0, _step: 0, _file: "",
    _settings: {
      ai_provider: "auto", model: "gemini-3.1-flash-lite", min_confidence: 0.95,
      require_all_rows: true, cross_check_scms: true, dry_run: true,
      source_dir: "data/Inbox", archive_dir: "data/Archive",
      scms_endpoint: "https://scms.spu.ac.th/api/v1/verification",
      scms_account: "svc-ai-verification", has_api_key: false, prompt: "(โหมดสาธิต)",
    },

    _log(group, message) { this._events.push({ kind: "log", ts: hhmmss(), group: group, message: message }); },

    info() { return { ok: true, backend: "demo", ai: "mock", has_api_key: false }; },
    scanSource() { return { ok: true, count: TOTAL - this._docs.length, source_dir: this._settings.source_dir, archive_dir: this._settings.archive_dir }; },

    start() {
      if (this._running) return { ok: false, error: "กำลังประมวลผลอยู่แล้ว" };
      if (this._docs.length >= TOTAL) return { ok: false, error: "ประมวลผลครบแล้ว กด “ล้างผล” ก่อน" };
      this._running = true; this._t0 = Date.now(); this._runNo++;
      this._log("INFO", "เริ่มรอบที่ " + this._runNo + " — พบ " + (TOTAL - this._docs.length) + " ชุดเอกสาร (โหมดสาธิต)");
      const self = this;
      this._timer = setInterval(function () { self._tick(); }, 480);
      return { ok: true, run_id: this._runNo, files: TOTAL - this._docs.length };
    },

    stop() {
      if (!this._running) return { ok: false, error: "ไม่ได้กำลังประมวลผล" };
      this._finish("stopped");
      this._log("ERROR", "ผู้ใช้สั่งหยุดการประมวลผล");
      return { ok: true };
    },

    _tick() {
      if (!this._running) return;
      if (this._docs.length >= TOTAL) return this._finish("done");
      const n = this._docs.length + 1;

      if (this._sub === 0) {
        this._pending = demoDoc(n);
        this._file = this._pending.file_name;
        this._log("INFO", "รับไฟล์ " + this._file + " — 1 หน้า, " + this._pending.row_count + " แถว");
      } else if (this._sub === 1) {
        this._pending.form_type === "other"
          ? this._log("WARN", "ชนิดฟอร์ม = ไม่ใช่แบบของมหาวิทยาลัย → ไม่ผ่านเกณฑ์ทันที")
          : this._log("OK", "ชนิดฟอร์ม = บัญชีรายชื่อนักศึกษา (SPU) · ที่ " + this._pending.doc_no +
              " ชุดที่ " + this._pending.set_no);
      } else if (this._sub === 2) {
        this._log("AI", "อ่านรหัสนักศึกษา / ชื่อ-สกุล / คณะ " + this._pending.row_count + " แถว · cross-check กับ SCMS");
      } else if (this._sub === 3) {
        this._log("AI", "อ่านผลตรวจ 3 กลุ่ม + หมายเหตุลายมือ + ลายมือชื่อผู้ตรวจสอบ (" +
          (this._pending.verifier_signed ? "พบลายเซ็น" : "ไม่พบลายเซ็น") + ")");
      } else {
        const d = this._pending;
        if (d.verdict === "auto") {
          this._log("OK", "ผ่านกฎครบทุกแถว → Auto-Post");
          this._log("SCMS", "บันทึกผลเข้า SCMS + ปิด Audit Trail (" + d.file_name + ")");
        } else {
          this._log("WARN", "ไม่ผ่านเกณฑ์: " + d.reasons[0]);
          this._log("INFO", "ส่งเข้าคิว Exception รอเจ้าหน้าที่ตรวจ (" + d.file_name + ")");
          this._queue.push(d);
        }
        this._docs.push(d);
        this._events.push({ kind: "document", ts: hhmmss(), document: d });
      }

      this._step = 3 + this._sub;
      this._events.push({
        kind: "step", ts: hhmmss(), step: this._step, name: STEP_NAMES[this._step],
        file: this._file, index: n, total: TOTAL,
      });
      this._sub = (this._sub + 1) % 5;
      if (this._docs.length >= TOTAL) this._finish("done");
    },

    _finish(status) {
      clearInterval(this._timer);
      this._running = false; this._step = 0;
      const auto = this._docs.filter(d => d.verdict === "auto").length;
      const ex = this._docs.length - auto;
      const elapsed = Math.round((Date.now() - this._t0) / 1000);
      this._log("OK", "จบรอบที่ " + this._runNo + " — " + this._docs.length + " ชุด · ผ่านอัตโนมัติ " +
        auto + " · เข้าคิว " + ex + " · ใช้เวลา " + Math.floor(elapsed / 60) + ":" + String(elapsed % 60).padStart(2, "0"));
      const stamp = new Date().toLocaleString("th-TH", { hour12: false });
      this._runs.unshift({
        id: this._runNo, started_at: stamp, finished_at: stamp, total: this._docs.length,
        auto: auto, exception: ex, posted: auto, status: status === "done" ? "done" : "stopped",
      });
      this._events.push({ kind: "finished", ts: hhmmss(), elapsed: elapsed });
    },

    poll() {
      const evs = this._events.splice(0, this._events.length);
      const elapsed = this._t0 ? Math.round((Date.now() - this._t0) / 1000) : 0;
      return {
        events: evs,
        state: {
          running: this._running, step: this._step, step_name: STEP_NAMES[this._step] || "",
          current_file: this._file, source_files: TOTAL - this._docs.length, elapsed: elapsed,
          run: this._runNo ? { run_id: this._runNo, total: this._docs.length } : null,
        },
      };
    },

    queue() { return this._queue.slice(); },

    confirm(id, rows) {
      const d = this._queue.find(x => x.id === id);
      if (!d) return { ok: false, error: "ไม่พบเอกสาร" };
      let edited = 0;
      (rows || []).forEach(function (r) {
        const orig = d.rows.find(x => x.row_no === r.row_no);
        if (!orig) return;
        const fields = ["student_id", "full_name", "faculty", "graduation", "doc_date", "degree", "note"];
        if (fields.some(f => (orig[f] || null) !== (r[f] || null))) edited++;
      });
      d.status = "confirmed"; d.verdict = "auto";
      this._queue = this._queue.filter(x => x.id !== id);
      this._log("SCMS", "เจ้าหน้าที่ยืนยัน " + d.file_name + (edited ? " (แก้ไข " + edited + " แถว)" : "") + " → บันทึกเข้า SCMS");
      return { ok: true, edited_rows: edited };
    },

    reject(id) {
      const d = this._queue.find(x => x.id === id);
      if (!d) return { ok: false, error: "ไม่พบเอกสาร" };
      d.status = "rejected";
      this._queue = this._queue.filter(x => x.id !== id);
      this._log("WARN", "ส่งกลับ " + d.file_name + " — แจ้งโรงเรียนต้นสังกัดให้แก้ไขและส่งใหม่");
      return { ok: true };
    },

    runs() { return this._runs.slice(); },
    runDocuments() { return this._docs.slice(); },
    audit(runId) {
      return [
        { ts: "-", action: "run.start", actor: "officer", detail: { run: runId } },
        { ts: "-", action: "document.extracted", actor: "ai", detail: {} },
        { ts: "-", action: "scms.post", actor: "system", detail: {} },
      ];
    },
    dashboard() {
      const auto = this._docs.filter(d => d.verdict === "auto").length;
      return {
        latest_run: this._runs[0] || null, documents: this._docs.slice(),
        queue_size: this._queue.length, storage: "demo",
        trend: this._runs.slice(0, 7).reverse().map(r => ({
          run_id: r.id, total: r.total, auto: r.auto, exception: r.exception,
        })),
        _auto: auto,
      };
    },
    settings() { return this._settings; },
    saveSettings(patch) { Object.assign(this._settings, patch || {}); return { ok: true, settings: this._settings }; },
    testAi() { return { ok: true, provider: "mock (โหมดสาธิต)" }; },
    chooseFolder() { return { ok: false, error: "โหมดสาธิตเลือกโฟลเดอร์ไม่ได้ — เปิดผ่าน python3 main.py" }; },
    document(id) { return this._docs.find(d => d.id === id) || null; },

    reset() {
      clearInterval(this._timer);
      this._running = false; this._docs = []; this._queue = []; this._events = [];
      this._sub = 0; this._step = 0; this._t0 = 0; this._file = "";
    },
  };

  /* --------------------------- เลือกโหมด ------------------------------ */

  window.Backend = {
    current: DemoBackend,
    demo: DemoBackend,
    ready(cb) {
      if (window.pywebview && window.pywebview.api) {
        LiveBackend.api = window.pywebview.api;
        this.current = LiveBackend;
        cb(LiveBackend);
        return;
      }
      const self = this;
      let settled = false;
      window.addEventListener("pywebviewready", function () {
        if (settled) return;
        settled = true;
        LiveBackend.api = window.pywebview.api;
        self.current = LiveBackend;
        cb(LiveBackend);
      });
      // เปิดไฟล์ตรง ๆ ในเบราว์เซอร์ → ใช้โหมดสาธิต
      setTimeout(function () {
        if (settled) return;
        settled = true;
        self.current = DemoBackend;
        cb(DemoBackend);
      }, 350);
    },
  };
})();
