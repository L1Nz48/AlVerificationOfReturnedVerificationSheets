import React, { createContext, useCallback, useContext, useEffect, useReducer, useRef } from "react";
import { api } from "../api/client";
import { GRP } from "../lib/format";
import type { DocResult, LogLine, Page, PollEvent, RunSummary, Settings } from "../types";

interface Toast { id: number; kind: "ok" | "warn" | "err" | "info"; msg: string }

interface State {
  page: Page;
  docs: DocResult[];
  queue: DocResult[];
  runs: RunSummary[];
  logs: LogLine[];
  settings: Settings | null;
  sel: number | null;
  filter: "all" | "auto" | "exception";
  logFilter: "all" | "ai" | "warn" | "scms";
  running: boolean;
  step: number;
  stepName: string;
  currentFile: string;
  elapsed: number;
  sourceFiles: number;
  total: number;
  toasts: Toast[];
  backendInfo: { backend: string; ai: string; has_api_key: boolean } | null;
}

const initialState: State = {
  page: "dashboard", docs: [], queue: [], runs: [], logs: [], settings: null,
  sel: null, filter: "all", logFilter: "all",
  running: false, step: 0, stepName: "", currentFile: "", elapsed: 0, sourceFiles: 0, total: 0,
  toasts: [], backendInfo: null,
};

type Action =
  | { type: "SET_PAGE"; page: Page }
  | { type: "SET_DOCS"; docs: DocResult[] }
  | { type: "UPSERT_DOC"; doc: DocResult }
  | { type: "SET_QUEUE"; queue: DocResult[] }
  | { type: "SET_RUNS"; runs: RunSummary[] }
  | { type: "SET_SETTINGS"; settings: Settings }
  | { type: "PUSH_LOG"; line: LogLine }
  | { type: "CLEAR_LOGS" }
  | { type: "SET_POLL_STATE"; running: boolean; step: number; stepName: string; currentFile: string; elapsed: number; sourceFiles: number }
  | { type: "SET_SEL"; id: number | null }
  | { type: "SET_FILTER"; filter: State["filter"] }
  | { type: "SET_LOG_FILTER"; filter: State["logFilter"] }
  | { type: "ADD_TOAST"; toast: Toast }
  | { type: "REMOVE_TOAST"; id: number }
  | { type: "SET_TOTAL"; total: number }
  | { type: "RESET_VIEW" }
  | { type: "SET_BACKEND_INFO"; info: State["backendInfo"] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_PAGE": return { ...state, page: action.page };
    case "SET_DOCS": return { ...state, docs: action.docs };
    case "UPSERT_DOC": {
      const idx = state.docs.findIndex(d => d.id === action.doc.id);
      const docs = idx >= 0 ? state.docs.map((d, i) => (i === idx ? action.doc : d)) : [...state.docs, action.doc];
      return { ...state, docs };
    }
    case "SET_QUEUE": return { ...state, queue: action.queue };
    case "SET_RUNS": return { ...state, runs: action.runs };
    case "SET_SETTINGS": return { ...state, settings: action.settings };
    case "PUSH_LOG": {
      const logs = [...state.logs, action.line];
      if (logs.length > 500) logs.shift();
      return { ...state, logs };
    }
    case "CLEAR_LOGS": return { ...state, logs: [] };
    case "SET_POLL_STATE": return {
      ...state, running: action.running, step: action.step, stepName: action.stepName,
      currentFile: action.currentFile, elapsed: action.elapsed, sourceFiles: action.sourceFiles,
    };
    case "SET_SEL": return { ...state, sel: action.id };
    case "SET_FILTER": return { ...state, filter: action.filter };
    case "SET_LOG_FILTER": return { ...state, logFilter: action.filter };
    case "ADD_TOAST": return { ...state, toasts: [...state.toasts, action.toast] };
    case "REMOVE_TOAST": return { ...state, toasts: state.toasts.filter(t => t.id !== action.id) };
    case "SET_TOTAL": return { ...state, total: action.total };
    case "RESET_VIEW": return { ...state, docs: [], logs: [], total: 0 };
    case "SET_BACKEND_INFO": return { ...state, backendInfo: action.info };
    default: return state;
  }
}

interface Ctx {
  state: State;
  go: (page: Page) => void;
  setFilter: (f: State["filter"]) => void;
  setLogFilter: (f: State["logFilter"]) => void;
  setSel: (id: number | null) => void;
  toast: (kind: Toast["kind"], msg: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  resetView: () => Promise<void>;
  clearLogs: () => void;
  loadQueue: () => Promise<void>;
  loadRuns: () => Promise<void>;
  refreshAll: () => Promise<void>;
  openCase: (id: number) => Promise<void>;
  confirmCase: (id: number, rows: unknown[]) => Promise<void>;
  rejectCase: (id: number) => Promise<void>;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
  reloadSettings: () => Promise<void>;
  uploadFiles: (files: FileList) => Promise<void>;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

let toastId = 0;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((kind: Toast["kind"], msg: string) => {
    const id = ++toastId;
    dispatch({ type: "ADD_TOAST", toast: { id, kind, msg } });
    setTimeout(() => dispatch({ type: "REMOVE_TOAST", id }), 3200);
  }, []);

  const loadQueue = useCallback(async () => {
    try { dispatch({ type: "SET_QUEUE", queue: (await api.getQueue()) || [] }); }
    catch { dispatch({ type: "SET_QUEUE", queue: [] }); }
  }, []);

  const loadRuns = useCallback(async () => {
    try { dispatch({ type: "SET_RUNS", runs: (await api.getRuns(20)) || [] }); }
    catch { dispatch({ type: "SET_RUNS", runs: [] }); }
  }, []);

  const loadDocsFromDashboard = useCallback(async () => {
    try {
      const dash = await api.getDashboard();
      if (dash?.documents?.length) {
        const byId = new Map<number, DocResult>();
        stateRef.current.docs.forEach(d => byId.set(d.id, d));
        dash.documents.forEach(d => byId.set(d.id, { ...(byId.get(d.id) || {} as DocResult), ...d }));
        const docs = Array.from(byId.values()).sort((a, b) => a.id - b.id);
        dispatch({ type: "SET_DOCS", docs });
      }
    } catch { /* ignore */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await loadQueue();
    await loadRuns();
    await loadDocsFromDashboard();
  }, [loadQueue, loadRuns, loadDocsFromDashboard]);

  const handleEvent = useCallback((ev: PollEvent) => {
    if (ev.kind === "log") {
      const g = GRP[ev.group || "INFO"] || GRP.INFO;
      dispatch({ type: "PUSH_LOG", line: { ts: ev.ts, group: ev.group || "", message: ev.message || "", gc: g[0], cls: g[1] } });
    } else if (ev.kind === "document" && ev.document) {
      dispatch({ type: "UPSERT_DOC", doc: ev.document });
    } else if (ev.kind === "finished") {
      refreshAll();
      toast("ok", "ประมวลผลเสร็จ — ดูคิวตรวจสอบได้ที่เมนูซ้าย");
    }
  }, [refreshAll, toast]);

  const poll = useCallback(async () => {
    let res;
    try { res = await api.poll(); } catch { return; }
    (res.events || []).forEach(handleEvent);
    const st = res.state || ({} as typeof res.state);
    dispatch({
      type: "SET_POLL_STATE", running: !!st.running, step: st.step || 0,
      stepName: st.step_name || "", currentFile: st.current_file || "",
      elapsed: st.elapsed || 0, sourceFiles: st.source_files || 0,
    });
  }, [handleEvent]);

  useEffect(() => {
    (async () => {
      try {
        const info = await api.ping();
        dispatch({ type: "SET_BACKEND_INFO", info });
      } catch {
        toast("err", "เชื่อมต่อ backend ไม่ได้ — ตรวจสอบว่ารัน uvicorn app.server:app แล้วหรือยัง");
      }
      try { dispatch({ type: "SET_SETTINGS", settings: await api.getSettings() }); } catch { /* ignore */ }
      try { await api.scanSource(); } catch { /* ignore */ }
      await refreshAll();
    })();
    const id = setInterval(poll, 450);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((page: Page) => {
    dispatch({ type: "SET_PAGE", page });
    if (page === "queue") loadQueue();
    if (page === "history") loadRuns();
  }, [loadQueue, loadRuns]);

  const start = useCallback(async () => {
    const res = await api.startRun("officer");
    if (!res || !res.ok) { toast("warn", res?.error || "เริ่มไม่สำเร็จ"); return; }
    dispatch({ type: "SET_TOTAL", total: (res.files || 0) + stateRef.current.docs.length });
    toast("info", "เริ่มรอบประมวลผล " + res.files + " ชุดเอกสาร");
    poll();
  }, [poll, toast]);

  const stop = useCallback(async () => {
    const res = await api.stopRun();
    if (res?.ok) toast("warn", "สั่งหยุดแล้ว — จะหยุดหลังจบไฟล์ปัจจุบัน");
  }, [toast]);

  const resetView = useCallback(async () => {
    dispatch({ type: "RESET_VIEW" });
    toast("info", "ล้างผลบนหน้าจอแล้ว (ข้อมูลในฐานข้อมูลยังอยู่)");
  }, [toast]);

  const clearLogs = useCallback(() => dispatch({ type: "CLEAR_LOGS" }), []);
  const setFilter = useCallback((f: State["filter"]) => dispatch({ type: "SET_FILTER", filter: f }), []);
  const setLogFilter = useCallback((f: State["logFilter"]) => dispatch({ type: "SET_LOG_FILTER", filter: f }), []);
  const setSel = useCallback((id: number | null) => dispatch({ type: "SET_SEL", id }), []);

  const openCase = useCallback(async (id: number) => {
    dispatch({ type: "SET_SEL", id });
    if (stateRef.current.page !== "queue") go("queue");
  }, [go]);

  const confirmCase = useCallback(async (id: number, rows: unknown[]) => {
    const res = await api.confirmCase(id, rows);
    if (!res || !res.ok) { toast("err", "บันทึกไม่สำเร็จ: " + (res?.error || "ไม่ทราบสาเหตุ")); return; }
    toast("ok", "บันทึกเข้า SCMS แล้ว" + (res.edited_rows ? " · แก้ไข " + res.edited_rows + " แถว (edited flag)" : ""));
    dispatch({ type: "SET_SEL", id: null });
    await refreshAll();
  }, [refreshAll, toast]);

  const rejectCase = useCallback(async (id: number) => {
    const res = await api.rejectCase(id, "ส่งกลับให้โรงเรียนต้นสังกัดแก้ไข");
    if (!res || !res.ok) { toast("err", "ส่งกลับไม่สำเร็จ"); return; }
    toast("warn", "ส่งเคสกลับโรงเรียนต้นสังกัดแล้ว");
    dispatch({ type: "SET_SEL", id: null });
    await refreshAll();
  }, [refreshAll, toast]);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const res = await api.saveSettings(patch);
    toast(res?.ok ? "ok" : "err", res?.ok ? "บันทึกการตั้งค่าแล้ว" : "บันทึกไม่สำเร็จ");
    if (res?.ok) dispatch({ type: "SET_SETTINGS", settings: res.settings });
    try { await api.scanSource(); } catch { /* ignore */ }
  }, [toast]);

  const reloadSettings = useCallback(async () => {
    try { dispatch({ type: "SET_SETTINGS", settings: await api.getSettings() }); } catch { /* ignore */ }
  }, []);

  const uploadFiles = useCallback(async (files: FileList) => {
    try {
      const res = await api.upload(files);
      toast("ok", `อัปโหลดแล้ว ${res.uploaded.length} ไฟล์`);
    } catch {
      toast("err", "อัปโหลดไม่สำเร็จ");
    }
  }, [toast]);

  const value: Ctx = {
    state, go, setFilter, setLogFilter, setSel, toast, start, stop, resetView, clearLogs,
    loadQueue, loadRuns, refreshAll, openCase, confirmCase, rejectCase, saveSettings, reloadSettings,
    uploadFiles,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
