export const pad = (n: number) => String(n).padStart(2, "0");
export const mmss = (s: number) => Math.floor(s / 60) + ":" + pad(Math.floor(s % 60));
export const cc = (c: number | null | undefined) =>
  (c ?? 0) >= 0.95 ? "var(--lime)" : (c ?? 0) >= 0.8 ? "var(--amber)" : "var(--red)";
export const pct = (c: number | null | undefined) => Math.round((c || 0) * 100) + "%";

export const GRP: Record<string, [string, string]> = {
  INFO: ["g-info", "info"], AI: ["g-ai", "info"], OK: ["g-ok", "ok"],
  WARN: ["g-warn", "warn"], ERROR: ["g-err", "warn"], SCMS: ["g-scms", "ok"],
};
