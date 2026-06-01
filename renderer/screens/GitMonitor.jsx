import React, { useEffect, useState } from "react";

export default function GitMonitor() {
  const [repos, setRepos] = useState([]);
  const rotator = globalThis.rotator; // NOSONAR
  const confirmGlobal = globalThis.confirm; // NOSONAR

  const load = async () => {
    const list = await rotator.git.watchedRepos().catch(() => []);
    setRepos(list);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    const p = await rotator.git.pickDir();
    if (p) await rotator.git.addRepo(p);
    load();
  };

  const remove = async (p) => {
    if (!confirmGlobal("Remove repo?")) return;
    await rotator.git.removeRepo(p);
    load();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Git Monitor</h2>
        <div>
          <button
            onClick={add}
            className="px-3 py-1 bg-teal-500 text-white rounded"
          >
            Add repo
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {repos.map((p) => (
          <div key={p} className="p-3 bg-white dark:bg-gray-800 rounded shadow">
            <div className="font-medium">{p.split(/[/\\]/).pop()}</div>
            <div className="text-xs text-gray-500 break-all">{p}</div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => remove(p)}
                className="px-2 py-1 bg-red-500 text-white rounded"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {repos.length === 0 && (
          <div className="text-sm text-gray-500">No watched repos</div>
        )}
      </div>
    </div>
  );
}
