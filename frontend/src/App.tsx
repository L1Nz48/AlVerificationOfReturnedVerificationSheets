import Header from "./components/Header";
import Rail from "./components/Rail";
import SidePanel from "./components/SidePanel";
import Toasts from "./components/Toasts";
import { PanelProvider } from "./state/panel";
import { AppProvider, useApp } from "./state/store";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Process from "./pages/Process";
import Queue from "./pages/Queue";
import Settings from "./pages/Settings";

function Pages() {
  const { state } = useApp();
  switch (state.page) {
    case "dashboard": return <Dashboard />;
    case "process": return <Process />;
    case "queue": return <Queue />;
    case "history": return <History />;
    case "settings": return <Settings />;
  }
}

function Shell() {
  return (
    <div className="app">
      <Rail />
      <div className="main">
        <Header />
        <div className="view"><Pages /></div>
      </div>
      <SidePanel />
      <Toasts />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <PanelProvider>
        <Shell />
      </PanelProvider>
    </AppProvider>
  );
}
