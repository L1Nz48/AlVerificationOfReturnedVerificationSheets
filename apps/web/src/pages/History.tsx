import { useState } from "react";
import { api } from "../api/client";
import { useApp } from "../state/store";
import type { AuditEntry } from "../types";

export default function History() {
  const { state } = useApp();
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [audit, setAudit] = useState<Record<number, AuditEntry[]>>({});

  const toggle = async (id: number) => {
    const next = new Set(open);
    if (next.has(id)) { next.delete(id); setOpen(next); return; }
    next.add(id); setOpen(next);
    if (!audit[id]) {
      try { setAudit(a => ({ ...a, [id]: [] })); const trail = await api.getAudit(id); setAudit(a => ({ ...a, [id]: trail || [] })); }
      catch { setAudit(a => ({ ...a, [id]: [] })); }
    }
  };

  return (
    <div className="hist">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>ประวัติการประมวลผล</div>
          <div className="tag-label">กดที่แถวเพื่อดู Audit Trail ของรอบนั้น</div>
        </div>
      </div>
      <div className="hline">
        {!state.runs.length ? <div className="panel"><div className="empty">ยังไม่มีรอบการทำงาน</div></div> : state.runs.map(r => {
          const ok = r.status === "done";
          const total = r.total || 0;
          const isOpen = open.has(r.id);
          return (
            <div className={"panel hrun " + (ok ? "ok" : "warn") + (isOpen ? " open" : "")} key={r.id}>
              <div className="hrun-hd" onClick={() => toggle(r.id)}>
                <span className="hcaret">›</span>
                <span className="hrun-id">รอบที่ {r.id}</span>
                <span className="hrun-time">{r.started_at} → {r.finished_at || "-"}</span>
                <div className="hrun-stats">
                  <div className="hstat"><div className="hs-v">{total}</div><div className="hs-k">ชุดเอกสาร</div></div>
                  <div className="hstat"><div className="hs-v" style={{ color: "var(--lime)" }}>{r.auto || 0}</div><div className="hs-k">ผ่านอัตโนมัติ</div></div>
                  <div className="hstat"><div className="hs-v" style={{ color: "var(--amber)" }}>{r.exception || 0}</div><div className="hs-k">เข้าคิว</div></div>
                  <div className="hstat"><div className="hs-v" style={{ color: "var(--brand)" }}>{r.posted || 0}</div><div className="hs-k">เข้า SCMS</div></div>
                  <span className={"chip " + (ok ? "c-lime" : "c-amber")}>{ok ? "เสร็จสิ้น" : r.status === "stopped" ? "หยุดกลางคัน" : r.status}</span>
                </div>
              </div>
              {isOpen && (
                <div className="hbody">
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>อัตราผ่านอัตโนมัติ</dt><dd>{total ? Math.round((r.auto || 0) / total * 100) : 0}% ({r.auto || 0}/{total})</dd>
                    <dt>บันทึกเข้า SCMS</dt><dd>{r.posted || 0} ชุด</dd>
                    <dt>ผู้สั่งรอบทำงาน</dt><dd>{r.operator || "officer"}</dd>
                  </dl>
                  <div className="audit">
                    {!audit[r.id]?.length ? "กำลังโหลด Audit Trail…" : audit[r.id].map((a, i) => {
                      const d = (a.detail || {}) as { verdict?: string; file?: string };
                      const extra = d.verdict ? " · " + d.verdict : d.file ? " · " + d.file : "";
                      return <div key={i}><span>[{a.action}]</span>{a.ts} · {a.actor}{extra}</div>;
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
