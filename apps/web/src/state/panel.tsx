import React, { createContext, useCallback, useContext, useState } from "react";

interface PanelState { open: boolean; title: string; sub: string; node: React.ReactNode }

interface Ctx {
  panel: PanelState;
  openPanel: (title: string, sub: string, node: React.ReactNode) => void;
  closePanel: () => void;
}

const PanelContext = createContext<Ctx | null>(null);

export function usePanel(): Ctx {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error("usePanel must be used within PanelProvider");
  return ctx;
}

export function PanelProvider({ children }: { children: React.ReactNode }) {
  const [panel, setPanel] = useState<PanelState>({ open: false, title: "", sub: "", node: null });
  const openPanel = useCallback((title: string, sub: string, node: React.ReactNode) => {
    setPanel({ open: true, title, sub, node });
  }, []);
  const closePanel = useCallback(() => setPanel(p => ({ ...p, open: false })), []);
  return <PanelContext.Provider value={{ panel, openPanel, closePanel }}>{children}</PanelContext.Provider>;
}
