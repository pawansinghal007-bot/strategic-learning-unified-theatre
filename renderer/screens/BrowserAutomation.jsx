import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const PLATFORMS = [
  { value: "codex", label: "Codex" },
  { value: "trae", label: "Trae" },
  { value: "vscode", label: "VS Code" },
];

export default function BrowserAutomation({ onEditTemplate }) {
  const [platform, setPlatform] = useState("codex");
  const [prompt, setPrompt] = useState(
    "Summarize the current browser automation use case in one paragraph.",
  );
  const [responses, setResponses] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    try {
      const [respList, promptList] = await Promise.all([
        globalThis.rotator.browser.listResponses({ platform, limit: 10 }),
        globalThis.rotator.browser.listPrompts(),
      ]);
      setResponses(respList);
      setPrompts(promptList);
    } catch (err) {
      setStatus(String(err));
    }
  };

  useEffect(() => {
    refresh();
  }, [platform]);

  const handleSend = async () => {
    if (!prompt?.trim()) return;
    setLoading(true);
    setStatus("Sending prompt...");
    setResult(null);
    try {
      const res = await globalThis.rotator.browser.send({
        platform,
        prompt,
        browserType: "chromium",
        headless: false,
      });
      setResult(res);
      setStatus("Prompt delivered successfully");
      await refresh();
    } catch (err) {
      setStatus(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setStatus("Opening browser login flow...");
    try {
      const res = await globalThis.rotator.browser.login({
        platform,
        browserType: "chromium",
      });
      setStatus(res?.message || "Login flow completed");
    } catch (err) {
      setStatus(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = () => {
    const promptItem = prompts.find((item) => item.id === selectedPromptId);
    if (promptItem) {
      setPrompt(promptItem.template);
    }
  };

  const handleCopyToEditor = () => {
    const promptItem = prompts.find((item) => item.id === selectedPromptId);
    if (promptItem && onEditTemplate) {
      onEditTemplate(promptItem);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
        <div>
          <h2 className="text-xl font-semibold">Browser Automation</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Send saved prompts to browser-based platforms and inspect response
            files.
          </p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Selected: {platform}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-4">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="mb-3">
            <label className="block text-sm font-medium">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
            >
              {PLATFORMS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium">Prompt</label>
            <textarea
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={handleSend}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded"
            >
              {loading ? "Sending..." : "Send prompt"}
            </button>
            <button
              onClick={handleLogin}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded"
            >
              Open login flow
            </button>
            <button
              onClick={refresh}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
            >
              Refresh
            </button>
          </div>
          {status && (
            <div className="text-sm text-blue-600 dark:text-blue-400 mb-4">
              {status}
            </div>
          )}
          {result && (
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-700 whitespace-pre-wrap text-sm">
              <div className="font-medium mb-2">Last result</div>
              <pre className="text-xs whitespace-pre-wrap break-words">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h3 className="font-medium mb-3">Prompt library</h3>
          <div className="mb-3">
            <label className="block text-sm">Use template</label>
            <select
              value={selectedPromptId}
              onChange={(e) => setSelectedPromptId(e.target.value)}
              className="mt-1 p-2 border rounded w-full"
            >
              <option value="">Select a saved prompt</option>
              {prompts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={handleUseTemplate}
                className="px-3 py-2 bg-teal-600 text-white rounded"
                disabled={!selectedPromptId}
              >
                Load template
              </button>
              <button
                onClick={handleCopyToEditor}
                className="px-3 py-2 bg-blue-600 text-white rounded"
                disabled={!selectedPromptId}
              >
                Copy template to prompt editor
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Templates are managed on the Prompt Templates screen in the sidebar.
            Use that screen to create, edit, and delete saved templates, then
            select one here.
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
        <h3 className="font-medium mb-3">Recent responses</h3>
        <div className="space-y-3">
          {responses.length === 0 && (
            <div className="text-sm text-gray-500">
              No responses found for selected platform.
            </div>
          )}
          {responses.map((item) => (
            <div
              key={item.filename}
              className="border rounded p-3 bg-gray-50 dark:bg-gray-900"
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="font-medium">{item.filename}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {item.filepath}
                  </div>
                </div>
              </div>
              <pre className="mt-2 text-xs whitespace-pre-wrap break-words bg-white dark:bg-gray-800 p-3 rounded">
                {item.content}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

BrowserAutomation.propTypes = {
  onEditTemplate: PropTypes.func,
};
