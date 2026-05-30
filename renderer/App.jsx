import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import Dashboard from "./screens/Dashboard";
import Accounts from "./screens/Accounts";
import LiveFeed from "./screens/LiveFeed";
import GitMonitor from "./screens/GitMonitor";
import ProgressLog from "./screens/ProgressLog";
import Settings from "./screens/Settings";
import LocalLLM from "./screens/LocalLLM";
import BrowserAutomation from "./screens/BrowserAutomation";
import BrowserPanel from "./BrowserPanel";
import PromptTemplates from "./screens/PromptTemplates";
import RobotFramework from "./screens/RobotFramework";
import Logs from "./Logs.jsx";

// --- Screen IDs ---
const SCREENS = {
  DASH: "dashboard",
  ACC: "accounts",
  LLM: "llm",
  BROWSER: "browser",
  PROMPTS: "prompts",
  ROBOT: "robot",
  LIVE: "live",
  GIT: "git",
  PROG: "progress",
  LOGS: "logs",
  SETTINGS: "settings",
};

// --- Human-readable title + icon for each screen (used in TopBar) ---
const SCREEN_META = {
  dashboard: { label: "Dashboard", icon: "ti-layout-dashboard" },
  accounts: { label: "Accounts", icon: "ti-users" },
  llm: { label: "Local LLM", icon: "ti-cpu" },
  browser: { label: "Browser Automation", icon: "ti-world" },
  prompts: { label: "Prompt Templates", icon: "ti-file-text" },
  robot: { label: "Robot Framework", icon: "ti-robot" },
  live: { label: "Live Feed", icon: "ti-activity" },
  git: { label: "Git Monitor", icon: "ti-brand-git" },
  progress: { label: "Progress Log", icon: "ti-list" },
  logs: { label: "Logs", icon: "ti-activity" },
  settings: { label: "Settings", icon: "ti-settings" },
};

// --- Theme tokens for TopBar (reads same localStorage key as Sidebar) ---
const TOPBAR_THEMES = {
  teal: {
    bar: "#ffffff",
    border: "#e5e7eb",
    text: "#111827",
    muted: "#9ca3af",
    pillBg: "#E1F5EE",
    pillText: "#085041",
    icon: "#6b7280",
  },
  midnight: {
    bar: "#0f1117",
    border: "#1e2028",
    text: "#f0f2f5",
    muted: "#4a4f5c",
    pillBg: "#0C447C",
    pillText: "#B5D4F4",
    icon: "#6b7280",
  },
  ember: {
    bar: "#1a1410",
    border: "#2e2418",
    text: "#faf0e0",
    muted: "#6b5a40",
    pillBg: "#633806",
    pillText: "#FAC775",
    icon: "#7a6040",
  },
  slate: {
    bar: "#ffffff",
    border: "#e5e7eb",
    text: "#2C2C2A",
    muted: "#B4B2A9",
    pillBg: "#F1EFE8",
    pillText: "#2C2C2A",
    icon: "#888780",
  },
  coral: {
    bar: "#fdf8f6",
    border: "#f0ddd5",
    text: "#2d1208",
    muted: "#c4a090",
    pillBg: "#FAECE7",
    pillText: "#4A1B0C",
    icon: "#a06040",
  },
  garuda: {
    bar: "#1C1409",
    border: "#3A2A0E",
    text: "#F5DFA0",
    muted: "#7A5C20",
    pillBg: "#3A2800",
    pillText: "#F5DFA0",
    icon: "#9A7A40",
  },
};

const THEME_KEY = "garuda_sidebar_theme";

// --- TopBar component ---
function TopBar({ screen, daemonRunning, onRefresh }) {
  const [themeId, setThemeId] = useState(
    () => localStorage.getItem(THEME_KEY) || "teal",
  );

  // Stay in sync with Sidebar theme changes
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === THEME_KEY && e.newValue) setThemeId(e.newValue);
    };
    globalThis.addEventListener("storage", onStorage);
    return () => globalThis.removeEventListener("storage", onStorage);
  }, []);

  const t = TOPBAR_THEMES[themeId] || TOPBAR_THEMES.teal;
  const meta = SCREEN_META[screen] || {
    label: screen,
    icon: "ti-layout-dashboard",
  };

  const iconBtnStyle = {
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    border: `0.5px solid ${t.border}`,
    background: "transparent",
    color: t.icon,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    fontSize: "15px",
    outline: "none",
    transition: "background 0.15s",
  };

  return (
    <div
      style={{
        height: "44px",
        flexShrink: 0,
        background: t.bar,
        borderBottom: `0.5px solid ${t.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "10px",
        transition: "background 0.25s, border-color 0.25s",
      }}
    >
      {/* Screen icon + title */}
      <i
        className={`ti ${meta.icon}`}
        aria-hidden="true"
        style={{ fontSize: "16px", color: t.muted, flexShrink: 0 }}
      />
      <span style={{ fontSize: "14px", fontWeight: 500, color: t.text }}>
        {meta.label}
      </span>

      {/* Daemon status pill */}
      <span
        style={{
          fontSize: "11px",
          fontWeight: 500,
          borderRadius: "10px",
          padding: "2px 9px",
          background: t.pillBg,
          color: t.pillText,
          marginLeft: "4px",
        }}
      >
        {daemonRunning ? "passive learning on" : "passive learning off"}
      </span>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Refresh button */}
      <button
        style={iconBtnStyle}
        onClick={onRefresh}
        title="Refresh"
        aria-label="Refresh current screen"
      >
        <i className="ti ti-refresh" aria-hidden="true" />
      </button>

      {/* Keyboard shortcut hint */}
      <span
        style={{ fontSize: "10px", color: t.muted, fontFamily: "monospace" }}
      >
        Ctrl+1-0
      </span>
    </div>
  );
}

TopBar.propTypes = {
  screen: PropTypes.string.isRequired,
  daemonRunning: PropTypes.bool.isRequired,
  onRefresh: PropTypes.func.isRequired,
};

// --- App ---
export default function App() {
  const [screen, setScreen] = useState(SCREENS.DASH);
  const [daemon, setDaemon] = useState({ running: false });
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Capture + docs state -- passed down to StatusBar
  const [captureCount, setCaptureCount] = useState(0);
  const [lastCapturedAt, setLastCapturedAt] = useState(null);
  const [totalDocs, setTotalDocs] = useState(0);

  // Daemon status + event listener
  useEffect(() => {
    globalThis.rotator.daemon
      .status()
      .then(setDaemon)
      .catch(() => {});
    const handler = (evt) => {
      // Re-fetch daemon status on any daemon event
      globalThis.rotator.daemon
        .status()
        .then(setDaemon)
        .catch(() => {});
      // If the event carries capture data, update counters
      if (evt && evt.type === "capture") {
        setCaptureCount((n) => n + 1);
        setLastCapturedAt(Date.now());
      }
      if (evt && typeof evt.totalDocs === "number") {
        setTotalDocs(evt.totalDocs);
      }
    };
    globalThis.rotator.daemon.onEvent(handler);
    return () => globalThis.rotator.daemon.offEvent(handler);
  }, []);

  // Keyboard shortcuts Ctrl/Cmd + 1-0
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const map = {
        1: SCREENS.DASH,
        2: SCREENS.ACC,
        3: SCREENS.LLM,
        4: SCREENS.BROWSER,
        5: SCREENS.PROMPTS,
        6: SCREENS.LIVE,
        7: SCREENS.GIT,
        8: SCREENS.PROG,
        9: SCREENS.LOGS,
        0: SCREENS.ROBOT,
      };
      const s = map[e.key];
      if (s) setScreen(s);
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  // Show/hide browser panel when switching to/from browser screen
  useEffect(() => {
    if (globalThis.rotator?.browser?.setVisible) {
      globalThis.rotator.browser
        .setVisible(screen === SCREENS.BROWSER)
        .catch(() => {});
    }
  }, [screen]);

  const handleEditTemplate = (template) => {
    setActiveTemplate(template);
    setScreen(SCREENS.PROMPTS);
  };

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        overflow: "hidden",
        fontFamily: "inherit",
      }}
    >
      {/* Sidebar */}
      <Sidebar active={screen} onSelect={setScreen} />

      {/* Main area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        {/* Top bar */}
        <TopBar
          screen={screen}
          daemonRunning={daemon.running}
          onRefresh={handleRefresh}
        />

        {/* Screen content */}
        <div
          style={{ flex: 1, padding: "16px", overflowY: "auto" }}
          key={refreshKey}
        >
          {screen === SCREENS.DASH && (
            <Dashboard onEditTemplate={handleEditTemplate} />
          )}
          {screen === SCREENS.ACC && <Accounts />}
          {screen === SCREENS.LLM && <LocalLLM />}
          {screen === SCREENS.BROWSER && (
            <BrowserPanel initialPlatform="chatgpt" />
          )}
          {screen === SCREENS.PROMPTS && (
            <PromptTemplates activePrompt={activeTemplate} />
          )}
          {screen === SCREENS.ROBOT && <RobotFramework />}
          {screen === SCREENS.LIVE && <LiveFeed />}
          {screen === SCREENS.GIT && <GitMonitor />}
          {screen === SCREENS.PROG && <ProgressLog />}
          {screen === SCREENS.LOGS && <Logs />}
          {screen === SCREENS.SETTINGS && <Settings />}
        </div>

        {/* Status bar -- TrainingStatus is removed; StatusBar absorbs it */}
        <StatusBar
          captureCount={captureCount}
          lastCapturedAt={lastCapturedAt}
          totalDocs={totalDocs}
        />
      </div>
    </div>
  );
}
