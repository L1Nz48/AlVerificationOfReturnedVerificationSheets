import { useApp } from "../state/store";

export default function Toasts() {
  const { state } = useApp();
  return (
    <div className="toasts">
      {state.toasts.map(t => (
        <div key={t.id} className={"toast " + (t.kind === "ok" ? "" : t.kind === "err" ? "err" : t.kind)}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
