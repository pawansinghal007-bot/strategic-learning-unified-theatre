import React, { useEffect, useState } from 'react'

export default function Dashboard() {
  const [accounts, setAccounts] = useState([])
  const [events, setEvents] = useState([])

  useEffect(() => {
    window.rotator.accounts.list().then(setAccounts).catch(() => {})
    // recent events not available via API; listen to daemon events
    const onEvent = (e) => setEvents((s) => [e].concat(s).slice(0, 5))
    window.rotator.daemon.onEvent(onEvent)
    return () => window.rotator.daemon.offEvent(onEvent)
  }, [])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Dashboard</h2>
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-medium">Active Account</h3>
          {accounts[0] ? (
            <div className="mt-2">
              <div className="font-semibold">{accounts[0].email || accounts[0].id}</div>
              <div className="text-sm text-gray-500">{accounts[0].agentType}</div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 mt-2">No accounts</div>
          )}
        </div>

        <div className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-medium">Recent Events</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {events.map((ev, i) => (
              <li key={i} className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">{ev.type}</span>
                <span className="text-gray-400 text-xs">{ev.detail ?? ''}</span>
              </li>
            ))}
            {events.length === 0 && <li className="text-sm text-gray-500">No recent events</li>}
          </ul>
        </div>
      </div>
    </div>
  )
}
