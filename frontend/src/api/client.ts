import type {
  AuditEntry, DocResult, PollEvent, PollState, RunSummary, Settings,
} from "../types";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const api = {
  ping: () => req<{ ok: boolean; backend: string; ai: string; has_api_key: boolean }>("/api/ping"),
  getSettings: () => req<Settings>("/api/settings"),
  saveSettings: (patch: Partial<Settings>) =>
    req<{ ok: boolean; settings: Settings }>("/api/settings", { method: "POST", body: JSON.stringify({ patch }) }),
  testAi: () => req<{ ok: boolean; provider?: string; error?: string }>("/api/test-ai", { method: "POST" }),
  upload: (files: FileList) => {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("files", f));
    return req<{ ok: boolean; count: number; source_dir: string; archive_dir: string; uploaded: string[] }>(
      "/api/upload", { method: "POST", body: fd },
    );
  },
  scanSource: () => req<{ ok: boolean; count: number; source_dir: string; archive_dir: string }>("/api/scan-source"),
  startRun: (operator = "officer") =>
    req<{ ok: boolean; run_id?: number; files?: number; error?: string }>(
      "/api/runs/start", { method: "POST", body: JSON.stringify({ operator }) },
    ),
  stopRun: () => req<{ ok: boolean; error?: string }>("/api/runs/stop", { method: "POST" }),
  poll: () => req<{ events: PollEvent[]; state: PollState }>("/api/poll"),
  getQueue: () => req<DocResult[]>("/api/queue"),
  confirmCase: (id: number, rows: unknown[], operator = "officer") =>
    req<{ ok: boolean; edited_rows?: number; error?: string }>(
      `/api/documents/${id}/confirm`, { method: "POST", body: JSON.stringify({ rows, operator }) },
    ),
  rejectCase: (id: number, reason: string, operator = "officer") =>
    req<{ ok: boolean; error?: string }>(
      `/api/documents/${id}/reject`, { method: "POST", body: JSON.stringify({ reason, operator }) },
    ),
  getDocument: (id: number) => req<DocResult | null>(`/api/documents/${id}`),
  getRuns: (limit = 20) => req<RunSummary[]>(`/api/runs?limit=${limit}`),
  getRunDocuments: (runId: number) => req<DocResult[]>(`/api/runs/${runId}/documents`),
  getAudit: (runId: number) => req<AuditEntry[]>(`/api/runs/${runId}/audit`),
  getDashboard: () => req<{
    latest_run: RunSummary | null; documents: DocResult[]; queue_size: number;
    trend: unknown[]; storage: string;
  }>("/api/dashboard"),
};
