import { usePanel } from "../state/panel";

export default function SidePanel() {
  const { panel, closePanel } = usePanel();
  return (
    <>
      <div className={"mask" + (panel.open ? " on" : "")} onClick={closePanel} />
      <aside className={"sheetpanel" + (panel.open ? " on" : "")}>
        <div className="sp-hd">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{panel.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{panel.sub}</div>
          </div>
          <button className="tool" onClick={closePanel}>✕</button>
        </div>
        <div className="sp-bd">{panel.node}</div>
      </aside>
    </>
  );
}
