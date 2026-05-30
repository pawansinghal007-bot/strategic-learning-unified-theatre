import React, { useEffect, useState } from 'react'
import { marked } from 'marked'

export default function ProgressLog() {
  const [md, setMd] = useState('')
  const [view, setView] = useState('markdown')
  const journal = globalThis.rotator.journal // NOSONAR

  const load = async () => {
    const raw = await journal.rawMd().catch(() => '')
    setMd(raw)
  }

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t) }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Progress Log</h2>
        <div className="flex gap-2">
          <button onClick={() => setView('markdown')} className="px-3 py-1 bg-gray-200 rounded">Markdown</button>
          <button onClick={() => setView('timeline')} className="px-3 py-1 bg-gray-200 rounded">Timeline</button>
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 prose dark:prose-invert max-w-none">
        {view === 'markdown' ? (
          <div dangerouslySetInnerHTML={{ __html: marked.parse(md || '') }} />
        ) : (
          <pre className="text-sm">{md}</pre>
        )}
      </div>
    </div>
  )
}
