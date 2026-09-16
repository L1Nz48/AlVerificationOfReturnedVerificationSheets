/* =========================================================================
   AI Verification Console — prototype logic (mock, no backend)
   Simulates To-Be flow steps 3–10 for returned verification sheets.
   ========================================================================= */

const app = (() => {

/* ------------------------------ pipeline -------------------------------- */

const STEPS = [
  { no: 3,  nm: 'รับไฟล์เข้าระบบ',        ds: 'สแกน 300 dpi · 1 ชุด = 1 PDF' },
  { no: 4,  nm: 'ตรวจชนิดฟอร์ม',          ds: 'ฟอร์ม SPU หรือฟอร์มโรงเรียน' },
  { no: 5,  nm: 'อ่านรหัส นศ. / เลขบัตร',  ds: 'OCR + cross-check SCMS' },
  { no: 6,  nm: 'AI อ่านเครื่องหมาย',      ds: 'ช่องกา 3 กลุ่ม · หมายเหตุ · ลายเซ็น' },
  { no: 7,  nm: 'ตรวจตามกฎอัตโนมัติ',      ds: 'ครบทุกแถว / conf ≥ 95%' },
  { no: 8,  nm: 'รับเคสเข้าคิว Exception', ds: 'เทียบภาพกับค่าที่อ่านได้', human: true },
  { no: 9,  nm: 'เจ้าหน้าที่ยืนยัน/แก้ไข',  ds: 'กดยืนยันทีละแถว', human: true },
  { no: 10, nm: 'บันทึกผลเข้า SCMS',       ds: 'อัตโนมัติ + แนบภาพหลักฐาน' },
];

/* ------------------------------ mock data ------------------------------- */

const SCHOOLS = ['สตรีวิทยา', 'สวนกุหลาบวิทยาลัย', 'เตรียมอุดมศึกษา', 'บดินทรเดชา', 'หอวัง', 'สามเสนวิทยาลัย', 'ราชวินิตบางแก้ว'];
const NAMES = ['ณัฐวุฒิ ศรีสมบูรณ์','พิมพ์ชนก วงศ์อนันต์','ธนกฤต ใจดีงาม','ศิริพร แก้วประเสริฐ','กิตติพัฒน์ รุ่งเรือง','อรอนงค์ สุขสมบัติ','ภาณุพงศ์ ทองมี','ชลธิชา พันธุ์ดี','วรเมธ อินทรสุข','ปาริชาต บุญเกิด','สรวิศ เมืองแก้ว','ญาณิศา ธาราทิพย์','ปุณยวีร์ นาคเกษม'];
const NOTES = ['ลาออกกลางภาค', 'พักการเรียน 1 ภาค', 'ย้ายสถานศึกษา', 'ยอดไม่ตรงใบแจ้งหนี้'];

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[rnd(0, a.length - 1)];
const cid = () => { let s = '1'; for (let i = 0; i < 12; i++) s += rnd(0, 9); return s; };
const sid = () => '67' + rnd(100000, 999999);

function makeRow(no, bad) {
  const conf = bad ? rnd(56, 89) / 100 : rnd(93, 100) / 100;
  const marks = ['checked', 'checked', 'checked'];
  if (bad && Math.random() < .55) marks[rnd(0, 2)] = 'unclear';
  return {
    no, studentId: sid(), citizenId: cid(), name: pick(NAMES), marks, conf,
    note: bad && Math.random() < .35 ? pick(NOTES) : null,
    signature: !(bad && Math.random() < .32),
    scmsMatch: !(bad && Math.random() < .38),
  };
}

function makeDoc(i) {
  const roll = Math.random();
  const kind = roll < .10 ? 'school-form' : roll < .22 ? 'low-conf' : roll < .30 ? 'mismatch' : 'ok';
  const n = rnd(4, 7);
  const rows = [];
  const badRow = rnd(1, n);
  for (let r = 1; r <= n; r++) rows.push(makeRow(r, kind !== 'ok' && (r === badRow || Math.random() < .16)));

  const minConf = Math.min(...rows.map(r => r.conf));
  const readable = kind === 'school-form' ? 0 : rows.filter(r => r.conf >= .95).length;
  const school = pick(SCHOOLS);

  const reasons = [];
  if (kind === 'school-form') reasons.push('ฟอร์มไม่ใช่แบบของมหาวิทยาลัย (ฟอร์มโรงเรียน) — ไม่ผ่านเกณฑ์ทันที ส่งเจ้าหน้าที่ตรวจ 100%');
  if (kind === 'low-conf') reasons.push('มีแถวที่ confidence ต่ำกว่าเกณฑ์ 95% — อ่านเครื่องหมายไม่ชัด');
  if (kind === 'mismatch') reasons.push('ชื่อ-สกุลในเอกสารไม่ตรงกับข้อมูลของรหัสนักศึกษาใน SCMS');
  if (rows.some(r => !r.signature)) reasons.push('ตรวจไม่พบลายมือชื่อในบางแถว');
  if (rows.some(r => r.note)) reasons.push('พบลายมือหมายเหตุที่ต้องให้เจ้าหน้าที่พิจารณา');

  return {
    id: i, kind, school, rows, rowCount: n, readable, minConf, reasons,
    file: `VS-2569-${String(i).padStart(3, '0')}.pdf`,
    formType: kind === 'school-form' ? 'ฟอร์มโรงเรียน' : 'ฟอร์ม SPU',
    result: kind === 'ok' && readable === n ? 'auto' : 'exception',
    status: 'pending',
  };
}

/* -------------------------------- state --------------------------------- */

const TOTAL = 12;

const S = {
  page: 'dashboard', docs: [], queue: [], sel: null, filter: 'all', logFilter: 'all',
  running: false, sub: 0, pending: null, timer: null, ticker: null,
  secs: 0, posted: 0, runNo: 4, logs: [],
  history: [
    { no: 3, start: '08 ส.ค. 2569 22:53', end: '08 ส.ค. 2569 22:58', total: 43, auto: 35, ex: 8, posted: 43, time: '4:52', status: 'เสร็จสิ้น' },
    { no: 2, start: '08 ส.ค. 2569 15:20', end: '08 ส.ค. 2569 15:23', total: 18, auto: 14, ex: 4, posted: 18, time: '2:40', status: 'เสร็จสิ้น' },
    { no: 1, start: '07 ส.ค. 2569 10:04', end: '07 ส.ค. 2569 10:05', total:  9, auto:  7, ex: 2, posted:  7, time: '1:12', status: 'หยุดกลางคัน' },
  ],
  trend: [[22,18,4],[31,26,5],[15,12,3],[40,33,7],[27,21,6],[9,7,2]],
};

/* ------------------------------ utilities ------------------------------- */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = n => String(n).padStart(2, '0');
const now = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const mmss = s => `${Math.floor(s / 60)}:${pad(s % 60)}`;
const cc = c => c >= .95 ? 'var(--lime)' : c >= .8 ? 'var(--amber)' : 'var(--red)';

function toast(kind, msg) {
  const el = document.createElement('div');
  el.className = 'toast ' + ({ ok: '', warn: 'warn', err: 'err', info: 'info' }[kind] ?? '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .2s'; el.style.opacity = 0; setTimeout(() => el.remove(), 220); }, 2800);
}

/* ----------------------------- navigation ------------------------------- */

const META = {
  dashboard: ['ขั้นที่ 3–10', 'หน้าหลัก',              'ภาพรวมการทำงานของระบบอัตโนมัติ (AI / RPA)'],
  process:   ['ขั้นที่ 3–7',  'ประมวลผลเอกสาร',        'รับไฟล์ → ตรวจชนิดฟอร์ม → OCR → AI อ่านเครื่องหมาย → ตรวจตามกฎ'],
  queue:     ['ขั้นที่ 8–9',  'คิวตรวจสอบ (Exception)', 'เจ้าหน้าที่เทียบภาพต้นฉบับกับค่าที่ AI อ่านได้ แล้วยืนยันหรือแก้ไข'],
  history:   ['ย้อนหลัง',     'ประวัติการทำงาน',        'รอบการประมวลผลย้อนหลัง พร้อม Audit Trail'],
  settings:  ['ตั้งค่า',       'ตั้งค่าระบบ',            'โมเดล AI · เกณฑ์การตัดสิน · พร็อมท์ · การเชื่อมต่อ SCMS'],
};

function go(page) {
  S.page = page;
  $$('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + page));
  $$('.rail-btn[data-page]').forEach(b => b.classList.toggle('on', b.dataset.page === page));
  const [st, t, s] = META[page];
  $('#hdrStep').textContent = st; $('#hdrTitle').textContent = t; $('#hdrSub').textContent = s;
  $('.view').scrollTop = 0;
  if (page === 'dashboard') renderDash();
  if (page === 'queue') renderQueue();
  if (page === 'history') renderHist();
}

/* ------------------------------ dashboard ------------------------------- */

function renderFlow() {
  const live = S.running ? 3 + S.sub : 0;
  const done = S.running ? live - 1 : (S.docs.length ? (S.queue.length ? 7 : 10) : 0);
  $('#flowNodes').innerHTML = STEPS.map(s => {
    const cls = s.no === live ? 'live' : s.no <= done ? 'done' : '';
    return `<div class="node ${cls} ${s.human ? 'human' : ''}">
      <div class="n-no">ขั้นที่ ${s.no}</div>
      <div class="n-nm">${esc(s.nm)}</div>
      <div class="n-ds">${esc(s.ds)}</div>
      ${s.human ? '<span class="n-hint">ต้องมีเจ้าหน้าที่</span>' : ''}
    </div>`;
  }).join('');
}

function renderDash() {
  const total = S.docs.length;
  const auto = S.docs.filter(d => d.result === 'auto').length;
  const ex = S.queue.length;

  $('#mTotal').textContent = total;
  $('#mAuto').textContent = auto;
  $('#mEx').textContent = ex;
  $('#mPosted').textContent = S.posted;
  $('#mAvg').textContent = total ? (S.secs / total).toFixed(1) : '—';
  $('#mstampt').textContent = total ? `รอบที่ ${S.runNo - (S.running ? 0 : 1)}` : 'ยังไม่มีข้อมูล';

  $('#flowState').innerHTML = S.running
    ? '<span class="led"></span> กำลังประมวลผล'
    : total ? '<span class="led"></span> รอบล่าสุดเสร็จแล้ว' : '<span class="led"></span> พร้อมทำงาน';
  $('#flowState').className = 'chip ' + (S.running ? 'c-cyan' : total ? 'c-lime' : 'c-gray');
  renderFlow();

  // sparkline
  $('#mSpark').innerHTML = [...S.trend.map(t => t[0]), total].map(v => {
    const h = Math.max(3, Math.round(v / 40 * 26));
    return `<i style="height:${h}px;background:${v === total && total ? 'var(--cyan)' : 'var(--line-2)'}"></i>`;
  }).join('');

  // stacked columns
  const days = ['02', '03', '04', '05', '06', '07', 'วันนี้'];
  const data = [...S.trend, [total, auto, ex]];
  const max = Math.max(12, ...data.map(d => d[0]));
  $('#tpChart').innerHTML = data.map((d, i) => {
    const [t, a, e] = d;
    const h = v => Math.round(v / max * 130);
    return `<div class="tp-col" title="ทั้งหมด ${t} · ผ่าน ${a} · เข้าคิว ${e}">
      <div class="tp-stack"><i class="ex" style="height:${h(e)}px"></i><i class="ok" style="height:${h(a)}px"></i></div>
      <div class="tp-x">${days[i]}</div></div>`;
  }).join('');

  // donut
  const C = 2 * Math.PI * 48;
  const pa = total ? auto / TOTAL : 0, pe = total ? ex / TOTAL : 0;
  $('#dnAuto').setAttribute('stroke-dasharray', `${C * pa} ${C}`);
  $('#dnEx').setAttribute('stroke-dasharray', `${C * pe} ${C}`);
  $('#dnEx').setAttribute('stroke-dashoffset', `${-C * pa}`);
  $('#dnPct').textContent = total ? Math.round(auto / total * 100) + '%' : '—';
  $('#dnA').textContent = auto; $('#dnE').textContent = ex; $('#dnR').textContent = TOTAL - total;

  // feed = last 8 logs
  const f = S.logs.slice(-8).reverse();
  $('#feed').innerHTML = f.length ? f.map(l => `<div class="fev ${l.cls}">
      <span class="f-i"></span><span class="f-t">${l.t}</span>
      <span class="f-b"><b>[${l.g}]</b> ${esc(l.m)}</span></div>`).join('')
    : '<div class="empty">ยังไม่มีเหตุการณ์ — เริ่มรอบประมวลผลเพื่อดู log</div>';

  syncTelemetry();
}

function syncTelemetry() {
  $('#tmEngine').textContent = S.running ? 'ทำงาน' : (S.docs.length >= TOTAL ? 'เสร็จแล้ว' : 'พร้อม');
  $('#tmRate').textContent = S.secs ? (S.docs.length / (S.secs / 60)).toFixed(1) + ' ชุด/นาที' : '—';
  $('#tmQueue').textContent = S.queue.length;
  const b = $('#railBadge');
  b.textContent = S.queue.length;
  b.style.display = S.queue.length ? '' : 'none';
  $('#qCount') && ($('#qCount').textContent = S.queue.length);
}

/* -------------------------------- process ------------------------------- */

const GRP = { INFO: ['g-info', 'info'], AI: ['g-ai', 'info'], OK: ['g-ok', 'ok'], WARN: ['g-warn', 'warn'], ERROR: ['g-err', 'warn'], SCMS: ['g-scms', 'ok'] };

function log(g, m) {
  const [gc, cls] = GRP[g] ?? GRP.INFO;
  S.logs.push({ t: now(), g, m, gc, cls });
  paintLog();
}

function paintLog() {
  const f = S.logFilter;
  const rows = S.logs.filter(l => f === 'all'
    || (f === 'ai' && l.g === 'AI')
    || (f === 'warn' && (l.g === 'WARN' || l.g === 'ERROR'))
    || (f === 'scms' && l.g === 'SCMS'));
  const box = $('#term');
  box.innerHTML = rows.map(l => `<div class="tline">
      <span class="tl-t">${l.t}</span><span class="tl-g ${l.gc}">[${l.g}]</span>
      <span class="tl-m">${esc(l.m)}</span></div>`).join('')
    + (S.running ? '<div class="tline"><span class="tl-t">' + now() + '</span><span class="tl-g"></span><span class="tl-m"><span class="term-cursor"></span></span></div>' : '');
  if (!rows.length) box.innerHTML = '<div class="empty">ยังไม่มีบันทึกการทำงาน</div>';
  box.scrollTop = box.scrollHeight;
}

function renderTrack() {
  const live = S.running ? 3 + S.sub : 0;
  $('#track').innerHTML = STEPS.map(s => {
    const cls = s.no === live ? 'live' : (S.running ? (s.no < live ? 'done' : '') : (S.docs.length >= TOTAL && s.no <= (S.queue.length ? 7 : 10) ? 'done' : ''));
    return `<div class="tstep ${cls}"><span class="t-no">${s.no}</span><span class="t-nm">${esc(s.nm)}</span></div>`;
  }).join('');
}

function renderResults() {
  const all = S.docs;
  $('#cAll').textContent = all.length;
  $('#cAuto').textContent = all.filter(d => d.result === 'auto').length;
  $('#cEx').textContent = all.filter(d => d.result === 'exception').length;

  const rows = all.filter(d => S.filter === 'all' || d.result === S.filter);
  if (!rows.length) {
    $('#resBody').innerHTML = `<tr><td colspan="10"><div class="empty">ยังไม่มีผลลัพธ์ — กด “เริ่มรอบประมวลผล”</div></td></tr>`;
    return;
  }
  $('#resBody').innerHTML = rows.map(d => {
    const sg = d.rows.filter(r => r.signature).length;
    return `<tr>
      <td class="num">${d.id}</td>
      <td class="mono">${esc(d.file)}</td>
      <td><span class="chip ${d.formType === 'ฟอร์ม SPU' ? 'c-cyan' : 'c-red'}">${esc(d.formType)}</span></td>
      <td>${esc(d.school)}</td>
      <td class="num">${d.rowCount}</td>
      <td class="num">${d.readable}</td>
      <td><span class="num" style="color:${cc(d.minConf)}">${Math.round(d.minConf * 100)}%</span></td>
      <td class="num" style="color:${sg === d.rowCount ? 'var(--ink-2)' : 'var(--red)'}">${sg}/${d.rowCount}</td>
      <td>${d.result === 'auto'
        ? '<span class="chip c-lime"><span class="led"></span> ผ่าน · บันทึกแล้ว</span>'
        : '<span class="chip c-amber"><span class="led"></span> เข้าคิวตรวจ</span>'}</td>
      <td>${d.result === 'exception'
        ? `<button class="btn btn-sm btn-pink" onclick="app.openCase(${d.id})">ตรวจสอบ</button>`
        : `<button class="btn btn-sm btn-ghost" onclick="app.openDoc(${d.id})">ดูผล</button>`}</td>
    </tr>`;
  }).join('');
}

function syncMeter() {
  const pct = Math.round(S.docs.length / TOTAL * 100);
  $('#meterV').textContent = pct + '%';
  $('#meterBar').style.width = pct + '%';
  $('#srcChip').textContent = (TOTAL - S.docs.length) + ' ชุดคงเหลือ';
}

function tick() {
  if (!S.running) return;
  if (S.docs.length >= TOTAL) return finish();

  const n = S.docs.length + 1;

  switch (S.sub) {
    case 0:
      S.pending = makeDoc(n);
      $('#meterFile').textContent = `${S.pending.file} · ${S.pending.rowCount} แถว · ไฟล์ที่ ${n}/${TOTAL}`;
      log('INFO', `รับไฟล์ ${S.pending.file} — สแกน 300 dpi, ตาราง ${S.pending.rowCount} แถว · เก็บภาพต้นฉบับลง Audit Log`);
      break;
    case 1:
      if (S.pending.kind === 'school-form')
        log('WARN', `ชนิดฟอร์ม = ${S.pending.formType} → ไม่ใช่แบบของมหาวิทยาลัย ตีเป็นไม่ผ่านเกณฑ์ทันที`);
      else
        log('OK', `ชนิดฟอร์ม = ${S.pending.formType} · จัดหน้า/ตัดขอบให้ตารางอยู่ตำแหน่งมาตรฐานแล้ว`);
      break;
    case 2: {
      log('AI', `OCR รหัส นศ. / เลขบัตร ปชช. ${S.pending.rowCount} แถว · cross-check ชื่อ-สกุลกับ SCMS`);
      const bad = S.pending.rows.filter(r => !r.scmsMatch).length;
      if (bad) log('WARN', `${bad} แถว ชื่อ-สกุลไม่ตรงกับข้อมูลใน SCMS`);
      break;
    }
    case 3:
      log('AI', `อ่านช่องเครื่องหมาย 3 กลุ่ม + ลายมือหมายเหตุ + ลายเซ็น — confidence ต่ำสุด ${Math.round(S.pending.minConf * 100)}%`);
      break;
    case 4: {
      const d = S.pending;
      if (d.result === 'auto') {
        log('OK', `ผ่านกฎ Validation ครบทุกแถว → Auto-Post`);
        log('SCMS', `บันทึกผลยืนยันวุฒิเข้า SCMS + ปิด Audit Trail (${d.file})`);
        S.posted++;
      } else {
        log('WARN', `ไม่ผ่านเกณฑ์: ${d.reasons[0]}`);
        log('INFO', `ส่งเข้าคิว Exception รอเจ้าหน้าที่ตรวจ (${d.file})`);
        S.queue.push(d);
      }
      S.docs.push(d); S.pending = null;
      renderResults();
      break;
    }
  }

  $('#meterK').textContent = `ขั้นที่ ${3 + S.sub} — ${STEPS[S.sub].nm}`;
  S.sub = (S.sub + 1) % 5;
  renderTrack(); renderFlow(); syncMeter(); syncTelemetry();
  if (S.docs.length >= TOTAL) finish();
}

function start() {
  if (S.running) return;
  if (S.docs.length >= TOTAL) return toast('warn', 'ประมวลผลครบแล้ว — กด “ล้างผล” ก่อนเริ่มรอบใหม่');
  S.running = true;
  $('#btnStart').disabled = true; $('#btnStop').disabled = false;
  log('INFO', `เริ่มรอบ #${S.runNo} — พบ ${TOTAL} ชุดเอกสารในโฟลเดอร์ต้นทาง`);
  S.timer = setInterval(tick, 500);
  S.ticker = setInterval(() => { S.secs++; syncTelemetry(); }, 1000);
  syncTelemetry(); renderTrack();
  toast('info', 'เริ่มรอบประมวลผลแล้ว');
}

function halt(silent) {
  clearInterval(S.timer); clearInterval(S.ticker);
  S.running = false;
  $('#btnStart').disabled = S.docs.length >= TOTAL;
  $('#btnStop').disabled = true;
  if (!silent) { log('ERROR', 'ผู้ใช้สั่งหยุดการประมวลผล'); toast('warn', 'หยุดการประมวลผลแล้ว'); }
  syncTelemetry(); renderTrack(); renderFlow();
}

function finish() {
  halt(true);
  const auto = S.docs.filter(d => d.result === 'auto').length;
  const ex = S.docs.filter(d => d.result === 'exception').length;
  log('OK', `จบรอบ #${S.runNo} — ${S.docs.length} ชุด · Auto-Post ${auto} · Exception ${ex} · ใช้เวลา ${mmss(S.secs)}`);
  $('#meterK').textContent = 'ประมวลผลเสร็จสิ้น';
  $('#meterFile').textContent = `ผ่านอัตโนมัติ ${auto} ชุด · เข้าคิว ${ex} ชุด · ใช้เวลา ${mmss(S.secs)}`;
  const d = new Date();
  S.history.unshift({
    no: S.runNo, total: S.docs.length, auto, ex, posted: S.posted, time: mmss(S.secs), status: 'เสร็จสิ้น',
    start: `10 ส.ค. 2569 ${pad(d.getHours())}:${pad(d.getMinutes())}`,
    end:   `10 ส.ค. 2569 ${pad(d.getHours())}:${pad(d.getMinutes() + 1)}`,
  });
  S.runNo++;
  renderDash(); renderHist();
  toast('ok', `เสร็จสิ้น — ${ex} เคสรอตรวจในคิว Exception`);
}

function reset() {
  halt(true);
  Object.assign(S, { docs: [], queue: [], sel: null, secs: 0, sub: 0, posted: 0, pending: null, logs: [] });
  $('#meterK').textContent = 'พร้อมเริ่มประมวลผล';
  $('#meterFile').textContent = 'idle · no document loaded';
  $('#btnStart').disabled = false;
  paintLog(); renderTrack(); renderResults(); syncMeter(); renderDash();
  toast('info', 'ล้างผลการประมวลผลแล้ว');
}

/* ------------------------------- queue ---------------------------------- */

const mk = m => m === 'checked' ? '<span class="mk">✓</span>' : m === 'unclear' ? '<span class="mk" style="color:#c0392b">~</span>' : '';

function renderQueue() {
  syncTelemetry();
  if (!S.queue.length) {
    $('#qList').innerHTML = '<div class="empty">ไม่มีเคสค้างในคิว<br><span style="font-size:11px">เอกสารทั้งหมดผ่านเกณฑ์อัตโนมัติแล้ว</span></div>';
    $('#scanStage').innerHTML = '<div class="empty">ไม่มีเอกสารให้แสดง</div>';
    $('#qForm').innerHTML = '<div class="empty">ไม่มีเคสให้ตรวจสอบ</div>';
    return;
  }
  if (S.sel == null || !S.queue.some(d => d.id === S.sel)) S.sel = S.queue[0].id;

  $('#qList').innerHTML = S.queue.map(d => `
    <button class="qi ${S.sel === d.id ? 'on' : ''}" onclick="app.openCase(${d.id})">
      <div class="qi-f">${esc(d.file)}</div>
      <div class="qi-m">
        <span class="chip ${d.formType === 'ฟอร์ม SPU' ? 'c-cyan' : 'c-red'}">${esc(d.formType)}</span>
        <span class="num">${d.rowCount} แถว</span>
        <span class="num" style="color:${cc(d.minConf)}">${Math.round(d.minConf * 100)}%</span>
      </div>
      <div class="qi-r">${esc(d.reasons[0] ?? '')}</div>
    </button>`).join('');

  const d = S.queue.find(x => x.id === S.sel);
  renderScan(d); renderForm(d);
}

function renderScan(d) {
  const rows = d.rows.map(r => `<tr>
    <td class="num" style="text-align:center">${r.no}</td>
    <td>${esc(r.studentId)}</td>
    <td>${esc(r.citizenId)}</td>
    <td>${esc(r.name)}</td>
    ${r.marks.map(m => `<td style="text-align:center" class="${m === 'unclear' ? 'flag-amber' : ''}">${mk(m)}</td>`).join('')}
    <td style="text-align:center" class="${r.signature ? '' : 'flag-red'}">${r.signature ? '<span class="ink-sig">ลงชื่อ</span>' : ''}</td>
    <td style="font-size:9px">${r.note ? esc(r.note) : ''}</td>
  </tr>`).join('');

  $('#scanStage').innerHTML = `<div class="sheet">
    <h4>แบบยืนยันการเบิกเงินกู้ยืม — บัญชีรายชื่อผู้กู้ยืมที่ลงนามแล้ว</h4>
    <div class="s-sub">โรงเรียน${esc(d.school)} · ปีการศึกษา 2569 ภาคเรียนที่ 1 · ${esc(d.formType)}</div>
    <table class="sheet-t">
      <thead><tr><th>ที่</th><th>รหัส นศ.</th><th>เลขบัตรประชาชน</th><th>ชื่อ-สกุล</th>
        <th>ค่าเล่าเรียน</th><th>ค่าครองชีพ</th><th>ยืนยัน</th><th>ลายมือชื่อ</th><th>หมายเหตุ</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="sheet-foot"><span>ลงชื่อ <span class="ink-sig">ผู้อำนวยการ</span> ผู้รับรอง</span><span>หน้า 1 / 1 · scan 300 dpi</span></div>
  </div>`;
}

function renderForm(d) {
  const rows = d.rows.map(r => {
    const bad = r.conf < .95 || !r.signature || !r.scmsMatch || r.marks.includes('unclear');
    return `<div class="frow">
      <div class="frow-hd">
        <span class="fr-no">แถวที่ ${r.no}</span>
        ${bad ? '<span class="chip c-amber">ต้องตรวจ</span>' : '<span class="chip c-lime">ปกติ</span>'}
        ${r.scmsMatch ? '' : '<span class="chip c-red">ไม่ตรง SCMS</span>'}
        ${r.signature ? '' : '<span class="chip c-red">ไม่พบลายเซ็น</span>'}
        ${r.note ? '<span class="chip c-violet">มีหมายเหตุ</span>' : ''}
        <span style="margin-left:auto;min-width:104px">
          <div class="confline"><div class="confbar"><i style="width:${Math.round(r.conf * 100)}%;background:${cc(r.conf)}"></i></div>
            <span class="num" style="font-size:10.5px;color:${cc(r.conf)}">${Math.round(r.conf * 100)}%</span></div></span>
      </div>
      <div class="frow-grid">
        <div><div class="fi-lab">รหัสนักศึกษา</div><input class="fi" value="${esc(r.studentId)}" oninput="app.edit(this)"></div>
        <div><div class="fi-lab">เลขบัตรประชาชน</div><input class="fi" value="${esc(r.citizenId)}" oninput="app.edit(this)"></div>
        <div class="fg"><div class="fi-lab">ชื่อ-สกุล</div><input class="fi" value="${esc(r.name)}" oninput="app.edit(this)"></div>
        <div class="fg"><div class="fi-lab">ช่องกา 3 กลุ่ม</div>
          <div style="display:flex;gap:6px">${r.marks.map(m => `<select class="fi" onchange="app.edit(this)">
            <option ${m === 'checked' ? 'selected' : ''}>✓ กา</option>
            <option ${m === 'unchecked' ? 'selected' : ''}>ไม่กา</option>
            <option ${m === 'unclear' ? 'selected' : ''}>อ่านไม่ชัด</option></select>`).join('')}</div></div>
        ${r.note ? `<div class="fg"><div class="fi-lab">ลายมือหมายเหตุ (AI อ่านได้)</div><input class="fi" value="${esc(r.note)}" oninput="app.edit(this)"></div>` : ''}
      </div>
    </div>`;
  }).join('');

  $('#qForm').innerHTML = `
    <div class="qcol-hd">
      <div><h3>${esc(d.file)}</h3>
        <div class="tag-label">โรงเรียน${esc(d.school)} · ${d.rowCount} แถว · อ่านได้ ${d.readable}/${d.rowCount}</div></div>
      <span class="grow"></span>
      <span class="chip c-amber">รอการยืนยัน</span>
    </div>

    <div class="panel-bd" style="padding:12px 14px 0">
      <div class="ribbon ${d.kind === 'school-form' ? 'red' : ''}">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:none;margin-top:2px"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
        <div><b>เหตุผลที่ไม่ผ่านเกณฑ์อัตโนมัติ</b><ul>${d.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
      </div>
    </div>

    <div class="qcol-hd" style="position:static"><h3 style="font-size:13px">การตรวจลายมือชื่อ 5 จุด</h3></div>
    <div class="sigs">
      <div class="sigbox req"><div class="sb-n">ผู้กู้ยืมเงิน</div><div class="sb-s">✅</div></div>
      <div class="sigbox req"><div class="sb-n">พยานคนที่ 1</div><div class="sb-s">✅</div></div>
      <div class="sigbox req"><div class="sb-n">พยานคนที่ 2</div><div class="sb-s">${d.rows.some(r => !r.signature) ? '❌' : '✅'}</div></div>
      <div class="sigbox opt"><div class="sb-n">ผู้แทนโดยชอบธรรม 1</div><div class="sb-s">➖</div></div>
      <div class="sigbox opt"><div class="sb-n">ผู้แทนโดยชอบธรรม 2</div><div class="sb-s">➖</div></div>
    </div>

    <div class="qcol-hd" style="position:static"><h3 style="font-size:13px">ค่าที่ AI อ่านได้ — แก้ไขได้ก่อนยืนยัน</h3></div>
    ${rows}

    <div class="qbar">
      <button class="btn btn-red" onclick="app.reject(${d.id})">ส่งกลับ / นิติการ</button>
      <span class="grow"></span>
      <button class="btn" onclick="app.confirm(${d.id}, true)">แก้ไขแล้วยืนยัน</button>
      <button class="btn btn-lime" onclick="app.confirm(${d.id}, false)">ยืนยัน → SCMS</button>
    </div>`;
}

function edit(el) { el.classList.add('edited'); }

function openCase(id) { S.sel = id; if (S.page !== 'queue') go('queue'); else renderQueue(); }

function close(id, mode) {
  const d = S.queue.find(x => x.id === id);
  if (!d) return;
  S.queue = S.queue.filter(x => x.id !== id);
  d.status = mode;
  if (mode === 'confirmed') { const doc = S.docs.find(x => x.id === id); if (doc) doc.result = 'auto'; }
  S.sel = S.queue.length ? S.queue[0].id : null;
  renderQueue(); renderResults(); renderDash();
}

function confirmCase(id, edited) {
  const d = S.queue.find(x => x.id === id);
  if (!d) return;
  S.posted++;
  log('SCMS', `เจ้าหน้าที่ยืนยัน ${d.file}${edited ? ' (แก้ไขค่า — edited flag = true)' : ''} → บันทึกเข้า SCMS + ปิด Audit Trail`);
  close(id, 'confirmed');
  toast('ok', `บันทึกเข้า SCMS แล้ว${edited ? ' · เก็บ edited flag + ผู้ยืนยัน + เวลา' : ''}`);
}

function reject(id) {
  const d = S.queue.find(x => x.id === id);
  if (!d) return;
  log('WARN', `ส่งกลับ ${d.file} — แจ้งโรงเรียนต้นสังกัดให้แก้ไขและส่งใหม่ (ไม่บันทึกเข้า SCMS)`);
  close(id, 'rejected');
  toast('warn', 'ส่งเคสกลับโรงเรียนต้นสังกัดแล้ว');
}

/* ------------------------------- history -------------------------------- */

function avgPerDoc(r) {
  const [m, s] = r.time.split(':').map(Number);
  return r.total ? ((m * 60 + s) / r.total).toFixed(1) : '—';
}

function renderHist() {
  $('#histList').innerHTML = S.history.map(r => `
    <div class="panel hrun ${r.status === 'เสร็จสิ้น' ? 'ok' : 'warn'}" data-run="${r.no}">
      <div class="hrun-hd" onclick="app.toggleRun(${r.no})">
        <span class="hcaret">›</span>
        <span class="hrun-id">รอบที่ ${r.no}</span>
        <span class="hrun-time">${r.start} → ${r.end}</span>
        <div class="hrun-stats">
          <div class="hstat"><div class="hs-v">${r.total}</div><div class="hs-k">ชุดเอกสาร</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--lime)">${r.auto}</div><div class="hs-k">ผ่านอัตโนมัติ</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--amber)">${r.ex}</div><div class="hs-k">เข้าคิว</div></div>
          <div class="hstat"><div class="hs-v" style="color:var(--brand)">${r.posted}</div><div class="hs-k">เข้า SCMS</div></div>
          <div class="hstat"><div class="hs-v">${r.time}</div><div class="hs-k">เวลาที่ใช้</div></div>
          <span class="chip ${r.status === 'เสร็จสิ้น' ? 'c-lime' : 'c-amber'}">${r.status}</span>
        </div>
      </div>
      <div class="hbody">
        <dl class="kv" style="margin-top:12px">
          <dt>อัตราผ่านอัตโนมัติ</dt><dd>${Math.round(r.auto / r.total * 100)}% (${r.auto}/${r.total})</dd>
          <dt>เวลาเฉลี่ยต่อชุด</dt><dd>${avgPerDoc(r)} วินาที</dd>
          <dt>บันทึกเข้า SCMS</dt><dd>${r.posted} ชุด</dd>
          <dt>ผู้สั่งรอบทำงาน</dt><dd>อรุณี บุญมี (เจ้าหน้าที่งานทะเบียน)</dd>
        </dl>
        <div class="audit">
          <div><span class="g-info">[INFO]</span> เริ่มรอบ #${r.no} — อ่านโฟลเดอร์ต้นทาง พบ ${r.total} ชุด</div>
          <div><span class="g-ai">[AI]</span> เก็บ AI raw value + confidence + source page ทุกฟิลด์</div>
          <div><span class="g-ok">[OK]</span> Auto-Post ${r.auto} ชุดเข้า SCMS</div>
          <div><span class="g-warn">[WARN]</span> ส่งเข้าคิว Exception ${r.ex} ชุด</div>
          <div><span class="g-scms">[SCMS]</span> ปิด Audit Trail + แจ้งผลยืนยันวุฒิถึงนักศึกษา</div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-sm" onclick="app.toast('info','จำลอง: ดาวน์โหลด audit log รอบ #${r.no}')">ดาวน์โหลด log</button>
          <button class="btn btn-sm btn-ghost" onclick="app.toast('info','จำลอง: เปิดโฟลเดอร์ภาพต้นฉบับ')">เปิดโฟลเดอร์ภาพ</button>
        </div>
      </div>
    </div>`).join('');
}

function toggleRun(no) { document.querySelector(`.hrun[data-run="${no}"]`).classList.toggle('open'); }

/* ------------------------------ side panel ------------------------------ */

function openDoc(id) {
  const d = S.docs.find(x => x.id === id);
  if (!d) return;
  panel(d.file, `โรงเรียน${d.school} · ${d.rowCount} แถว`, `
    <dl class="kv" style="margin-bottom:16px">
      <dt>ชนิดฟอร์ม</dt><dd>${esc(d.formType)}</dd>
      <dt>อ่านได้ตามเกณฑ์</dt><dd>${d.readable}/${d.rowCount} แถว</dd>
      <dt>Confidence ต่ำสุด</dt><dd style="color:${cc(d.minConf)}">${Math.round(d.minConf * 100)}%</dd>
      <dt>ผลการตัดสิน</dt><dd><span class="chip c-lime">ผ่านอัตโนมัติ · บันทึกเข้า SCMS</span></dd>
      <dt>edited flag</dt><dd class="mono">${d.status === 'confirmed' ? 'true' : 'false'}</dd>
      <dt>source page</dt><dd class="mono">page 1</dd>
    </dl>
    <table class="t"><thead><tr><th>แถว</th><th>รหัสนักศึกษา</th><th>ชื่อ-สกุล</th><th>Confidence</th></tr></thead>
      <tbody>${d.rows.map(r => `<tr><td class="num">${r.no}</td><td>${esc(r.studentId)}</td>
        <td>${esc(r.name)}</td><td class="num" style="color:${cc(r.conf)}">${Math.round(r.conf * 100)}%</td></tr>`).join('')}</tbody></table>`);
}

function help() {
  panel('ขอบเขตของโปรแกรม', 'เทียบกับ To-Be End-to-End Flow', `
    <p style="font-size:12.5px;color:var(--ink-2);margin-top:0">โปรแกรมนี้ทำเฉพาะ lane <b>ระบบอัตโนมัติ (AI / RPA)</b> — กล่องสีเขียวในผังงาน คือขั้นที่ 3 ถึง 10</p>
    <table class="t"><thead><tr><th>step</th><th>งาน</th><th>ผู้ทำ</th></tr></thead><tbody>
      ${STEPS.map(s => `<tr><td class="num">${s.no}</td><td>${esc(s.nm)}<div style="font-size:11px;color:var(--ink-3)">${esc(s.ds)}</div></td>
        <td>${s.human ? '<span class="chip c-violet">เจ้าหน้าที่</span>' : '<span class="chip c-cyan">ระบบ</span>'}</td></tr>`).join('')}
    </tbody></table>
    <p style="font-size:12px;color:var(--ink-3);margin-top:14px">ขั้นที่ 1–2 (นักศึกษายื่น / เจ้าหน้าที่รับเอกสาร) และงานส่งเอกสารไปโรงเรียน อยู่นอกขอบเขตของโปรแกรมนี้</p>`);
}

function panel(t, s, html) {
  $('#spTitle').textContent = t; $('#spSub').textContent = s; $('#spBody').innerHTML = html;
  $('#sp').classList.add('on'); $('#mask').classList.add('on');
}
function closePanel() { $('#sp').classList.remove('on'); $('#mask').classList.remove('on'); }

function testConn(btn) {
  const old = btn.textContent;
  btn.textContent = 'กำลังทดสอบ…'; btn.disabled = true;
  setTimeout(() => { btn.textContent = old; btn.disabled = false; toast('ok', 'เชื่อมต่อโมเดล AI สำเร็จ (จำลอง)'); }, 850);
}

/* -------------------------------- init ---------------------------------- */

function init() {
  $$('.rail-btn[data-page]').forEach(b => b.onclick = () => go(b.dataset.page));
  $$('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
  $('#btnTheme').onclick = () => {
    const el = document.documentElement;
    el.dataset.theme = el.dataset.theme === 'dark' ? 'light' : 'dark';
  };
  $('#btnHelp').onclick = help;
  $('#btnStart').onclick = start;
  $('#btnStop').onclick = () => halt(false);
  $('#btnReset').onclick = reset;
  $('#btnClearLog').onclick = () => { S.logs = []; paintLog(); };
  $('#spClose').onclick = closePanel;
  $('#mask').onclick = closePanel;

  $$('#resTabs .tab').forEach(b => b.onclick = () => {
    $$('#resTabs .tab').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); S.filter = b.dataset.f; renderResults();
  });
  $$('#termFilters .tf').forEach(b => b.onclick = () => {
    $$('#termFilters .tf').forEach(x => x.classList.remove('on'));
    b.classList.add('on'); S.logFilter = b.dataset.g; paintLog();
  });
  $$('#snav .snav-b').forEach(b => b.onclick = () => {
    $$('#snav .snav-b').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    $$('.sgroup').forEach(g => g.classList.toggle('on', g.dataset.s === b.dataset.s));
  });

  renderTrack(); renderResults(); syncMeter(); renderDash(); renderHist();
}

document.addEventListener('DOMContentLoaded', init);

return { go, openCase, confirm: confirmCase, reject, openDoc, toggleRun, toast, edit, testConn };
})();
