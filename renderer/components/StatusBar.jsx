import React, { useEffect, useState } from 'react'

const RED_STATUSES = new Set(['error', 'exhausted', 'not_monitoring', 'unavailable'])
const AMBER_STATUSES = new Set(['cooling_down', 'degraded'])
const HEALTHY_STATUSES = new Set(['ok', 'ready'])

function collectStatuses(health) {
  if (!health) return []

  return [
    health.account?.status,
    health.daemon?.status,
    health.localLlm?.status,
    ...(health.account?.accounts ?? []).map((account) => account.healthStatus)
  ].filter(Boolean)
}

function deriveStatus(health) {
  const statuses = collectStatuses(health)

  if (statuses.length === 0) return { color: 'bg-gray-400', label: 'unknown' }
  if (statuses.some((status) => RED_STATUSES.has(status))) {
    return { color: 'bg-red-500', label: 'unhealthy' }
  }
  if (statuses.some((status) => AMBER_STATUSES.has(status))) {
    return { color: 'bg-amber-500', label: 'degraded' }
  }
  if (statuses.every((status) => HEALTHY_STATUSES.has(status))) {
    return { color: 'bg-green-500', label: 'healthy' }
  }

  return { color: 'bg-gray-400', label: 'unknown' }
}

export default function StatusBar() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    let mounted = true
    const refresh = () => {
      globalThis.rotator.health.aggregate().then((h) => {
        if (mounted) setHealth(h)
      }).catch(() => {})
    }

    refresh()
    const interval = setInterval(refresh, 15000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [])

  const status = deriveStatus(health)
  const account = health?.account?.accounts?.[0] ?? null

  return (
    <div className="h-7 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 flex items-center text-sm">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${status.color}`} />
        <span>{status.label}</span>
      </div>
      <div className="flex-1 text-center truncate">{account ? `${account.email ?? account.id}` : 'No account'}</div>
      <div className="text-right">&nbsp;</div>
    </div>
  )
}
