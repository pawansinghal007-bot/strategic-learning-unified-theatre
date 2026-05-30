import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

const emptyForm = { name: "", template: "" };

export default function PromptTemplates({ activePrompt }) {
  const [prompts, setPrompts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const browser = globalThis.rotator.browser; // NOSONAR
  const confirmGlobal = globalThis.confirm; // NOSONAR

  const refresh = async () => {
    try {
      const list = await browser.listPrompts();
      setPrompts(list);
      setStatus("");
    } catch (err) {
      setStatus(String(err));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (activePrompt && activePrompt.id) {
      setSelectedId(activePrompt.id);
      setForm({ name: activePrompt.name, template: activePrompt.template });
      setStatus(`Copied "${activePrompt.name}" from Browser Automation`);
    }
  }, [activePrompt]);

  const selectPrompt = (id) => {
    setSelectedId(id);
    const prompt = prompts.find((item) => item.id === id);
    if (prompt) {
      setForm({ name: prompt.name, template: prompt.template });
      setStatus(`Editing prompt: ${prompt.name}`);
    } else {
      setForm(emptyForm);
    }
  };

  const savePrompt = async () => {
    if (!form.name.trim() || !form.template.trim()) {
      setStatus("Name and template are required.");
      return;
    }

    setLoading(true);
    try {
      if (selectedId) {
        await browser.updatePrompt(selectedId, {
          name: form.name,
          template: form.template,
        });
        setStatus("Template updated");
      } else {
        await browser.addPrompt({
          name: form.name,
          template: form.template,
          lastUsed: null,
        });
        setStatus("Template created");
      }
      await refresh();
    } catch (err) {
      setStatus(String(err));
    } finally {
      setLoading(false);
    }
  };

  const deletePrompt = async () => {
    if (!selectedId) return;
    if (!confirmGlobal("Delete this prompt template?")) return;
    setLoading(true);
    try {
      await browser.deletePrompt(selectedId);
      setSelectedId("");
      setForm(emptyForm);
      setStatus("Template deleted");
      await refresh();
    } catch (err) {
      setStatus(String(err));
    } finally {
      setLoading(false);
    }
  };

  const startNew = () => {
    setSelectedId("");
    setForm(emptyForm);
    setStatus("Creating new template");
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
        <div>
          <h2 className="text-xl font-semibold">Prompt Templates</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage browser automation templates in a dedicated editor.
          </p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Templates: {prompts.length}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-4">
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium">Template name</label>
            <input
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              className="mt-1 p-2 border rounded w-full"
              placeholder="Enter template name"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium">Template body</label>
            <textarea
              rows={8}
              value={form.template}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, template: e.target.value }))
              }
              className="mt-1 p-2 border rounded w-full"
              placeholder="Enter the prompt template text"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={savePrompt}
              disabled={loading}
              className="px-4 py-2 bg-teal-600 text-white rounded"
            >
              {loading
                ? "Saving..."
                : selectedId
                  ? "Save changes"
                  : "Create template"}
            </button>
            <button
              onClick={startNew}
              className="px-4 py-2 bg-gray-200 text-gray-900 rounded"
            >
              New template
            </button>
            <button
              onClick={deletePrompt}
              disabled={!selectedId || loading}
              className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
            >
              Delete
            </button>
          </div>
          {status && (
            <div className="mt-4 text-sm text-blue-600 dark:text-blue-400">
              {status}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium">Saved templates</h3>
            <button
              onClick={refresh}
              className="px-2 py-1 bg-gray-200 text-gray-900 rounded"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-2 max-h-[52vh] overflow-auto">
            {prompts.length === 0 && (
              <div className="text-sm text-gray-500">No templates yet.</div>
            )}
            {prompts.map((item) => (
              <button
                key={item.id}
                onClick={() => selectPrompt(item.id)}
                className={`block w-full text-left p-3 rounded border ${item.id === selectedId ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"}`}
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {item.template}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 text-sm text-gray-500 dark:text-gray-400">
        Use the Browser Automation screen to execute prompts from this template
        library. This editor is for managing template content and saving
        reusable prompt definitions.
      </div>
    </div>
  );
}

PromptTemplates.propTypes = {
  activePrompt: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    template: PropTypes.string,
  }),
};
