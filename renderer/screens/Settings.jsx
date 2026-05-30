import React, { useEffect, useState } from 'react'

export default function Settings() {
  const [cfg, setCfg] = useState({})

  useEffect(() => { globalThis.rotator.config.get().then(setCfg).catch(() => {}) }, [])

  const update = (patch) => setCfg((c) => ({ ...c, ...patch }))
  const save = async () => { await globalThis.rotator.config.set(cfg); alert('Saved') }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Settings</h2>
      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow">
          <label className="block text-sm">Poll interval (ms)</label>
          <input type="number" value={cfg.pollIntervalMs || 30000} onChange={(e) => update({ pollIntervalMs: Number(e.target.value) })} className="mt-1 p-2 border rounded w-48" />
        </div>
        <div className="flex gap-2">
          <button onClick={save} className="px-3 py-1 bg-teal-500 text-white rounded">Save</button>
        </div>
      </div>
    </div>
  )
}
