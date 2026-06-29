import * as fs from 'fs'
import * as path from 'path'

const LOG_PATH = process.env.SESSION_LOG_PATH
  ?? path.resolve(process.cwd(), 'logs', 'agent-session.ndjson')

export interface SessionLogEntry {
  timestamp: string         // ISO 8601
  command: string
  taskId: string
  stepNumber: number
  stepName: string
  agentName: string
  success: boolean
  durationMs: number
  outputPreview: string     // first 200 chars of output
  error?: string
}

export function appendSessionLog(entry: SessionLogEntry): void {
  // Create logs/ directory if missing (recursive: true)
  // Append JSON.stringify(entry) + '\n' to LOG_PATH
  // If write fails: console.error only — never throw (logging must not crash harness)
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true })
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n')
  } catch (error) {
    console.error('Failed to append to session log:', error)
  }
}

export function readSessionLog(limit = 20): SessionLogEntry[] {
  // Read LOG_PATH, split by newline, parse each line as JSON
  // Return last `limit` entries
  // Return [] if file doesn't exist
  // Skip malformed lines silently
  try {
    const data = fs.readFileSync(LOG_PATH, 'utf8')
    const lines = data.split('\n').filter(line => line.trim() !== '')
    const entries: SessionLogEntry[] = []
    
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - limit); i--) {
      try {
        const entry = JSON.parse(lines[i])
        entries.unshift(entry)
      } catch {
        // Skip malformed lines silently
      }
    }
    
    return entries
  } catch {
    // Return empty array if file doesn't exist
    return []
  }
}