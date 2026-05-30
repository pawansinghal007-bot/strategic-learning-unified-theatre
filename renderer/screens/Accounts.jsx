import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const LOGIN_TARGETS = {
  vscode: "https://code.visualstudio.com/",
  github: "https://github.com/features/copilot",
  codex: "https://app.codex.com/login",
  trae: "https://trae.ai/",
};

const AGENT_LABELS = {
  vscode: "VS Code",
  github: "GitHub Copilot",
  codex: "Codex",
  trae: "Trae",
  other: "Other",
};

function StatusChip({ status }) {
  const cls =
    status === "active"
      ? "bg-teal-100 text-teal-800"
      : status === "cooldown"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>;
}

StatusChip.propTypes = {
  status: PropTypes.string.isRequired,
};

export default function Accounts() {
  const [rows, setRows] = useState([]);
  const [healthById, setHealthById] = useState({});
  const [mode, setMode] = useState("list");
  const [selectedAgentType, setSelectedAgentType] = useState("all");
  const [subView, setSubView] = useState("users");
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [authOnly, setAuthOnly] = useState(true);
  const [form, setForm] = useState({
    email: "",
    agentType: "vscode",
    authBlob: "",
    profileName: "",
  });
  const [status, setStatus] = useState("");
  const [capturing, setCapturing] = useState(false);

  const loadHealth = async (id) => {
    try {
      const health = await globalThis.rotator.accounts.health(id);
      setHealthById((current) => ({ ...current, [id]: health }));
    } catch (err) {
      setHealthById((current) => ({
        ...current,
        [id]: { valid: false, error: String(err) || "Probe failed" },
      }));
    }
  };

  const load = () =>
    globalThis.rotator.accounts
      .listDetails()
      .then((list) => {
        setRows(list);
        if (list.length > 0 && !selectedAccount) setSelectedAccount(list[0]);
        list.forEach((row) => loadHealth(row.id));
      })
      .catch(async () => {
        const list = await globalThis.rotator.accounts.list();
        setRows(list);
        if (list.length > 0 && !selectedAccount) setSelectedAccount(list[0]);
        list.forEach((row) => loadHealth(row.id));
      });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedAgentType !== "all") {
      setForm((prev) => ({ ...prev, agentType: selectedAgentType }));
    }
  }, [selectedAgentType]);

  const doSwitch = async (id) => {
    const health = healthById[id];
    if (
      health &&
      health.error &&
      !window.confirm(
        `Account health warning: ${health.error}. Continue switching?`,
      )
    ) {
      return;
    }

    if (!window.confirm("Switch to this account?")) return;
    try {
      await globalThis.rotator.switcher.switch(id);
      await load();
    } catch (err) {
      alert(String(err));
    }
  };

  const refreshHealth = async (id) => {
    await loadHealth(id);
  };

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const handleManualAdd = async () => {
    try {
      await globalThis.rotator.accounts.add({
        email: form.email,
        agentType: form.agentType,
        authBlob: form.authBlob,
        profileName: form.profileName || null,
      });
      setForm({
        email: "",
        agentType: "vscode",
        authBlob: "",
        profileName: "",
      });
      setMode("list");
      await load();
      alert("Account added successfully");
    } catch (err) {
      alert(String(err));
    }
  };

  const getLoginUrl = (agentType) => {
    if (LOGIN_TARGETS[agentType]) return LOGIN_TARGETS[agentType];
    return `https://www.google.com/search?q=${encodeURIComponent(`login ${agentType}`)}`;
  };

  const handleOpenLoginPage = async () => {
    const url = getLoginUrl(form.agentType);

    try {
      await globalThis.rotator.app.openUrl(url);
    } catch (err) {
      alert(String(err));
    }
  };

  const handleCapture = async () => {
    try {
      setCapturing(true);
      setStatus("Starting capture...");
      await globalThis.rotator.accounts.capture({
        email: form.email,
        agentType: form.agentType,
        profileName: form.profileName || null,
        timeoutMs: 180000,
        launchEditor: authOnly && form.agentType !== "other",
      });
      setForm({
        email: "",
        agentType: "vscode",
        authBlob: "",
        profileName: "",
      });
      setMode("list");
      await load();
      alert("Account captured and added successfully");
    } catch (err) {
      alert(String(err));
    } finally {
      setCapturing(false);
      setStatus("");
    }
  };

  const SUPPORTED_VSCODE_AUTH = ["vscode", "github", "codex", "trae"];
  const agentTypes = ["all", "vscode", "github", "codex", "trae", "other"];
  const agentCounts = rows.reduce((acc, row) => {
    acc[row.agentType] = (acc[row.agentType] || 0) + 1;
    return acc;
  }, {});
  const filteredRows =
    selectedAgentType === "all"
      ? rows
      : rows.filter((row) => row.agentType === selectedAgentType);
  const selectedAgentLabel =
    selectedAgentType === "all"
      ? "All Agents"
      : AGENT_LABELS[selectedAgentType] || selectedAgentType;
  const canUseVsCodeAuth =
    selectedAgentType === "all"
      ? true
      : SUPPORTED_VSCODE_AUTH.includes(selectedAgentType);

  useEffect(() => {
    if (
      filteredRows.length > 0 &&
      !filteredRows.some((acct) => acct.id === selectedAccount?.id)
    ) {
      setSelectedAccount(filteredRows[0]);
    }
  }, [filteredRows, selectedAccount]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-1 bg-teal-500 text-white rounded"
          >
            Refresh
          </button>
          <button
            onClick={() => setMode("capture")}
            className="px-3 py-1 bg-blue-500 text-white rounded"
          >
            Capture Account
          </button>
          <button
            onClick={() => setMode("manual")}
            className="px-3 py-1 bg-gray-500 text-white rounded"
          >
            Manual Add
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {agentTypes.map((type) => {
          const label = type === "all" ? "All" : AGENT_LABELS[type] || type;
          const count = type === "all" ? rows.length : agentCounts[type] || 0;
          const selected = selectedAgentType === type;
          return (
            <button
              key={type}
              onClick={() => {
                setSelectedAgentType(type);
                setSubView("users");
              }}
              className={`px-3 py-1 rounded text-sm ${selected ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-900"}`}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {selectedAgentType !== "all" && (
        <div className="mb-4 flex flex-wrap gap-2">
          {["users", "auth"].map((view) => {
            const label = view === "users" ? "Users" : "VS Code Auth";
            const selected = subView === view;
            return (
              <button
                key={view}
                onClick={() => setSubView(view)}
                className={`px-3 py-1 rounded text-sm ${selected ? "bg-teal-600 text-white" : "bg-gray-200 text-gray-900"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {selectedAgentType !== "all" && subView === "auth" && (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded shadow p-4 space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p>
              Use the VS Code-only auth workflow for {selectedAgentLabel}{" "}
              accounts.
            </p>
            <p>
              {canUseVsCodeAuth
                ? `This will open VS Code and capture auth tokens for ${selectedAgentLabel}.`
                : "For this agent type, use the configured auth path and external login source."}
            </p>
            <p>
              Enter the account email and optional profile name, then start
              capture.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Agent type</label>
            <select
              value={form.agentType}
              onChange={(e) => updateForm({ agentType: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
              disabled={selectedAgentType !== "all"}
            >
              <option value="vscode">vscode</option>
              <option value="github">github</option>
              <option value="codex">codex</option>
              <option value="trae">trae</option>
              <option value="other">other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">
              Profile name (optional)
            </label>
            <input
              value={form.profileName}
              onChange={(e) => updateForm({ profileName: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              id="authOnly"
              type="checkbox"
              checked={authOnly}
              onChange={(e) => setAuthOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="authOnly"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              VS Code-only auth flow
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCapture}
              disabled={capturing || !form.email}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              {capturing ? "Capturing..." : "Start capture"}
            </button>
            <button
              onClick={handleOpenLoginPage}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Open {AGENT_LABELS[form.agentType] || "login"} page
            </button>
            <button
              onClick={() => {
                setMode("list");
                setStatus("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "capture" && (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded shadow p-4 space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p>
              Use this flow to sign in once and capture the auth token
              automatically.
            </p>
            <p>
              <strong>vscode:</strong> The app will launch VS Code and capture
              the auth state directly from the selected profile.
            </p>
            <p>
              <strong>github:</strong> The app will open VS Code and monitor
              GitHub Copilot auth while you complete login in VS Code.
            </p>
            <p>
              <strong>codex:</strong> The app will open VS Code for capture and
              monitor the Codex auth file while you complete login within VS
              Code.
            </p>
            <p>
              <strong>trae:</strong> The app will open VS Code for capture and
              monitor the Trae auth file while you complete login within VS
              Code.
            </p>
            <p>
              <strong>other:</strong> The tool will watch the configured auth
              path. Make sure your custom agent writes a login token to the
              configured location.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Agent type</label>
            <select
              value={form.agentType}
              onChange={(e) => updateForm({ agentType: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            >
              <option value="vscode">vscode</option>
              <option value="github">github</option>
              <option value="codex">codex</option>
              <option value="trae">trae</option>
              <option value="other">other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">
              Profile name (optional)
            </label>
            <input
              value={form.profileName}
              onChange={(e) => updateForm({ profileName: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          {status && <div className="text-sm text-blue-600">{status}</div>}
          <div className="flex items-center gap-3">
            <input
              id="authOnlyMode"
              type="checkbox"
              checked={authOnly}
              onChange={(e) => setAuthOnly(e.target.checked)}
              className="h-4 w-4"
            />
            <label
              htmlFor="authOnlyMode"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              VS Code-only auth flow
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCapture}
              disabled={capturing}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              {capturing ? "Capturing..." : "Start capture"}
            </button>
            <button
              onClick={handleOpenLoginPage}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Open {AGENT_LABELS[form.agentType] || "login"} page
            </button>
            <button
              onClick={() => {
                setMode("list");
                setStatus("");
              }}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "manual" && (
        <div className="mb-4 bg-white dark:bg-gray-800 rounded shadow p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              value={form.email}
              onChange={(e) => updateForm({ email: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Agent type</label>
            <select
              value={form.agentType}
              onChange={(e) => updateForm({ agentType: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            >
              <option value="vscode">vscode</option>
              <option value="github">github</option>
              <option value="codex">codex</option>
              <option value="trae">trae</option>
              <option value="other">other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Auth blob</label>
            <textarea
              value={form.authBlob}
              onChange={(e) => updateForm({ authBlob: e.target.value })}
              rows={4}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">
              Profile name (optional)
            </label>
            <input
              value={form.profileName}
              onChange={(e) => updateForm({ profileName: e.target.value })}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleManualAdd}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              Save account
            </button>
            <button
              onClick={() => setMode("list")}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">Email</th>
              <th>Agent</th>
              <th>Profile</th>
              <th>Status</th>
              <th>Health</th>
              <th>Auth path</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => {
              const health = healthById[r.id];
              const healthLabel = health?.valid
                ? "ok"
                : health?.error
                  ? health.error
                  : "unknown";
              const switchDisabled = health && !health.valid;
              return (
                <tr
                  key={r.id}
                  className={`border-t cursor-pointer ${selectedAccount?.id === r.id ? "bg-gray-100 dark:bg-gray-900" : ""}`}
                  onClick={() => setSelectedAccount(r)}
                >
                  <td className="p-2">{r.email || r.id}</td>
                  <td>{AGENT_LABELS[r.agentType] || r.agentType}</td>
                  <td>{r.profileName || "-"}</td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                    {healthLabel}
                  </td>
                  <td className="p-2 text-sm text-gray-600 dark:text-gray-300 truncate max-w-xs">
                    {r.authPath || "-"}
                  </td>
                  <td className="space-x-2">
                    <button
                      onClick={() => doSwitch(r.id)}
                      disabled={switchDisabled}
                      className="px-2 py-1 bg-blue-500 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Switch
                    </button>
                    <button
                      onClick={() => refreshHealth(r.id)}
                      className="px-2 py-1 bg-gray-200 text-gray-900 rounded text-sm"
                    >
                      Refresh
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-sm text-gray-500">
                  No accounts
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedAccount && (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded shadow p-4">
          <h3 className="text-lg font-semibold mb-3">Account details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div>
              <strong>Email:</strong>{" "}
              {selectedAccount.email || selectedAccount.id}
            </div>
            <div>
              <strong>Agent:</strong>{" "}
              {AGENT_LABELS[selectedAccount.agentType] ||
                selectedAccount.agentType}
            </div>
            <div>
              <strong>Profile:</strong> {selectedAccount.profileName || "-"}
            </div>
            <div>
              <strong>Status:</strong>{" "}
              <StatusChip status={selectedAccount.status} />
            </div>
            <div>
              <strong>Auth Path:</strong> {selectedAccount.authPath || "-"}
            </div>
            <div>
              <strong>Path Exists:</strong>{" "}
              {selectedAccount.authPathExists ? "Yes" : "No"}
            </div>
            <div>
              <strong>VS Code Auth:</strong>{" "}
              {selectedAccount.supportsVsCodeAuth
                ? "Supported"
                : "Manual/Other"}
            </div>
            <div>
              <strong>Login URL:</strong>{" "}
              <a
                className="text-indigo-600 dark:text-indigo-400 underline"
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  const url =
                    selectedAccount.loginUrl ||
                    getLoginUrl(selectedAccount.agentType);
                  await globalThis.rotator.app.openUrl(url);
                }}
              >
                {selectedAccount.loginUrl ||
                  getLoginUrl(selectedAccount.agentType)}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
