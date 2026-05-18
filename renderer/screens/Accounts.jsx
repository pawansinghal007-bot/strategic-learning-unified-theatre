import React, { useEffect, useState } from 'react'

function StatusChip({ status }) {
  const cls = status === 'active' ? 'bg-teal-100 text-teal-800' : status === 'cooldown' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{status}</span>
}

export default function Accounts() {
  const [rows, setRows] = useState([])

  const load = () => window.rotator.accounts.list().then(setRows).catch(() => {})

  useEffect(() => { load() }, [])

  const doSwitch = async (id) => {
    if (!window.confirm('Switch to this account?')) return
    try { await window.rotator.switcher.switch(id); await load() } catch (err) { alert(String(err)) }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Accounts</h2>
        <div>
          <button onClick={load} className="px-3 py-1 bg-teal-500 text-white rounded">Refresh</button>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded shadow">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left"><th className="p-2">Email</th><th>Agent</th><th>Status</th><th>Last Used</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t"><td className="p-2">{r.email || r.id}</td><td>{r.agentType}</td><td><StatusChip status={r.status} /></td><td>{r.lastUsed ? new Date(r.lastUsed).toLocaleString() : '-'}</td><td><button onClick={() => doSwitch(r.id)} className="px-2 py-1 bg-blue-500 text-white rounded text-sm">Switch</button></td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-4 text-sm text-gray-500">No accounts</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
