export interface RowResult {
  row_no: number;
  student_id: string | null;
  full_name: string | null;
  faculty: string | null;
  graduation: string | null;
  doc_date: string | null;
  degree: string | null;
  note: string | null;
  confidence: number;
  source_page: number;
  scms_match: boolean | null;
  scms_name: string | null;
  issues: string[];
  edited: boolean;
  adverse: boolean;
}

export interface DocResult {
  id: number;
  file_name: string;
  file_path?: string;
  form_type: "spu" | "other";
  doc_no: string | null;
  set_no: string | null;
  school_name: string | null;
  school_code: string | null;
  verifier_signed: boolean;
  verifier_name: string | null;
  verifier_position: string | null;
  rows: RowResult[];
  row_count: number;
  readable_rows: number;
  min_confidence: number;
  verdict: "auto" | "exception";
  reasons: string[];
  status: string;
  error?: string;
}

export interface RunSummary {
  id: number;
  started_at: string;
  finished_at: string | null;
  total: number;
  auto: number;
  exception: number;
  posted: number;
  status: string;
  operator?: string;
}

export interface AuditEntry {
  ts: string;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
}

export interface Settings {
  ai_provider: string;
  model: string;
  workers: number;
  min_confidence: number;
  require_all_rows: boolean;
  cross_check_scms: boolean;
  dry_run: boolean;
  store_original_scan: boolean;
  notify_student: boolean;
  prompt: string;
  scms_endpoint: string;
  scms_account: string;
  source_dir: string;
  archive_dir: string;
  has_api_key: boolean;
}

export interface PollEvent {
  kind: "log" | "document" | "step" | "progress" | "finished";
  ts: string;
  group?: string;
  message?: string;
  document?: DocResult;
  step?: number;
  name?: string;
  file?: string;
  index?: number;
  total?: number;
  done?: number;
  auto?: number;
  exception?: number;
  elapsed?: number;
  summary?: RunSummary;
}

export interface PollState {
  running: boolean;
  step: number;
  step_name: string;
  current_file: string;
  source_files: number;
  elapsed: number;
  run: { run_id: number; total: number } | null;
}

export type Page = "dashboard" | "process" | "queue" | "history" | "settings";

export interface LogLine {
  ts: string;
  group: string;
  message: string;
  gc: string;
  cls: string;
}
