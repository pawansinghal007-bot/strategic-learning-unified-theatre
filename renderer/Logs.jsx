import React, { useEffect, useState } from "react";

const LEVELS = ["debug", "info", "warn", "error"];

export default function Logs() {
  const [entries, setEntries] = useState([]);
  const [moduleFilter, setModuleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [correlationFilter, setCorrelationFilter] = useState("");

  useEffect(() => {
    const subscribe = globalThis.rotator?.logs?.onEvent;
    if (typeof subscribe !== "function") return undefined;

    const unsubscribe = subscribe((entry) => {
      setEntries((current) => [entry, ...current].slice(0, 500));
    });

    return typeof unsubscribe === "function" ? unsubscribe : undefined;
  }, []);

  const modules = Array.from(
    new Set(entries.map((entry) => entry?.module).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const filteredEntries = entries.filter((entry) => {
    if (moduleFilter && entry?.module !== moduleFilter) return false;
    if (levelFilter && entry?.level !== levelFilter) return false;
    if (
      correlationFilter &&
      !String(entry?.correlationId ?? "").includes(correlationFilter)
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Module{' '}
          <select
            value={moduleFilter}
            onChange={(event) => setModuleFilter(event.target.value)}
            className="min-w-48 rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">All modules</option>
            {modules.map((moduleName) => (
              <option key={moduleName} value={moduleName}>
                {moduleName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Level{' '}
          <select
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
            className="min-w-40 rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="">All levels</option>
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
          Correlation ID{' '}
          <input
            type="text"
            value={correlationFilter}
            onChange={(event) => setCorrelationFilter(event.target.value)}
            className="rounded border border-gray-300 bg-white p-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            placeholder="Filter by correlation ID"
          />
        </label>
      </div>

      <div className="max-h-[calc(100vh-180px)] overflow-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        {filteredEntries.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400">
            No log entries yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredEntries.map((entry, index) => (
              <div
                key={`${entry?.ts ?? "log"}-${index}`}
                className="p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                    {entry?.ts}
                  </span>
                  <strong>{entry?.level}</strong>
                  <span>{entry?.module}</span>
                  {entry?.correlationId && (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
                      {entry.correlationId}
                    </span>
                  )}
                  {entry?.code && (
                    <span className="font-mono text-xs text-red-700 dark:text-red-300">
                      {entry.code}
                    </span>
                  )}
                </div>
                <div className="mt-1 break-words text-gray-900 dark:text-gray-100">
                  {entry?.msg}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
