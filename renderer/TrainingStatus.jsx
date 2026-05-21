import React from 'react'

/**
 * Format a timestamp as relative time (e.g., "2 min ago")
 * Uses Intl.RelativeTimeFormat or falls back to manual computation.
 * @param {number|null} timestamp - ISO string or milliseconds; null = never
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
  if (!timestamp) {
    return 'never'
  }

  // Handle both ISO strings and milliseconds
  const ms = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  const now = Date.now()
  const diffMs = now - ms

  if (diffMs < 0) return 'in the future'
  if (diffMs < 1000) return 'just now'
  if (diffMs < 60000) return `${Math.floor(diffMs / 1000)}s ago`
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`

  // For dates > 1 day, use Intl if available, else fallback
  try {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    const daysAgo = Math.floor(diffMs / 86400000)
    return rtf.format(-daysAgo, 'day')
  } catch {
    const daysAgo = Math.floor(diffMs / 86400000)
    return `${daysAgo}d ago`
  }
}

/**
 * TrainingStatus component
 * Displays a compact status bar showing capture count, last capture time, and total documents.
 *
 * @param {Object} props
 * @param {number} props.captureCount - Number of responses captured this session (default: 0)
 * @param {number|string|null} props.lastCapturedAt - Timestamp of last capture (ISO string or ms); null = never
 * @param {number} props.totalDocs - Total documents in experience DB (default: 0)
 * @returns {React.ReactElement}
 */
export default function TrainingStatus({
  captureCount = 0,
  lastCapturedAt = null,
  totalDocs = 0
}) {
  const relativeTime = formatRelativeTime(lastCapturedAt)

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300">
      {/* Badge: Capture count */}
      <div className="flex items-center gap-1">
        <span className="inline-block px-2 py-1 bg-blue-500 text-white rounded text-xs font-semibold">
          {captureCount}
        </span>
        <span>captured this session</span>
      </div>

      {/* Timestamp: Last capture */}
      <div className="flex items-center gap-1">
        <span className="text-gray-500 dark:text-gray-400">Last:</span>
        <span>{relativeTime}</span>
      </div>

      {/* Total documents */}
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-gray-500 dark:text-gray-400">Total docs:</span>
        <span className="font-medium">{totalDocs}</span>
      </div>
    </div>
  )
}
