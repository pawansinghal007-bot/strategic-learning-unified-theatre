import React, { useEffect, useState } from 'react'

export default function StatusBar() {
  const [status, setStatus] = useState({ running: false })
  const [account, setAccount] = useState(null)

  useEffect(() => {
    window.rotator.daemon.status().then(setStatus).catch(() => {})
    window.rotator.accounts.list().then((l) => setAccount(l[0] ?? null)).catch(() => {})
  }, [])

  return (
    <div className="h-7 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 flex items-center text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status.running ? 'bg-green-500' : 'bg-gray-400'}`} />
        <span>{status.running ? 'daemon running' : 'daemon paused'}</span>
      </div>
      <div className="flex-1 text-center truncate">{account ? `${account.email ?? account.id}` : 'No account'}</div>
      <div className="text-right">&nbsp;</div>
    </div>
  )
}
