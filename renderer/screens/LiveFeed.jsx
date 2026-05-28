import React, { useEffect, useRef, useState } from 'react'

export default function LiveFeed() {
  const [items, setItems] = useState([])
  const [paused, setPaused] = useState(false)
  const containerRef = useRef()

  useEffect(() => {
    const onEvent = (e) => {
      setItems((s) => [...s, e].slice(-100))
      if (!paused) {
        setTimeout(() => containerRef.current?.scrollTo(0, containerRef.current.scrollHeight), 10)
      }
    }
    window.rotator.daemon.onEvent(onEvent)
    return () => window.rotator.daemon.offEvent(onEvent)
  }, [paused])

  const filtered = items
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Live Feed</h2>
        <div className="flex gap-2">
          <button onClick={() => setPaused((p) => !p)} className="px-3 py-1 rounded bg-gray-200">{paused ? 'Resume' : 'Pause'}</button>
        </div>
      </div>
      <div ref={containerRef} className="bg-white dark:bg-gray-800 rounded shadow p-3 h-96 overflow-auto text-sm">
        {filtered.map((it, i) => (
          <div key={i} className="py-1 border-b last:border-b-0">
            <div className="text-xs text-gray-500">{it.ts ?? ''}</div>
            <div className="font-medium">{it.type}</div>
            <div className="text-gray-600 text-sm">{it.detail ?? JSON.stringify(it)}</div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-sm text-gray-500">No events</div>}
      </div>
    </div>
  )
}
