import React, { useEffect, useState } from 'react'

const items = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'llm', label: 'Local LLM' },
  { id: 'browser', label: 'Browser Automation' },
  { id: 'prompts', label: 'Prompt Templates' },
  { id: 'robot', label: 'Robot Framework' },
  { id: 'live', label: 'Live Feed' },
  { id: 'git', label: 'Git Monitor' },
  { id: 'progress', label: 'Progress Log' },
  { id: 'settings', label: 'Settings' }
]

export default function Sidebar({ active, onSelect }) {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.rotator.app.version().then((v) => setVersion(v)).catch(() => {})
  }, [])

  return (
    <div className="w-52 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-4 font-semibold">Strategic Learning Unified Theatre</div>
      <nav className="flex-1">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center ${active === it.id ? 'border-l-4 border-teal-500 bg-gray-50 dark:bg-gray-900' : ''}`}>
            <span className="ml-2">{it.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3 text-xs text-gray-500 dark:text-gray-400">v{version}</div>
    </div>
  )
}
