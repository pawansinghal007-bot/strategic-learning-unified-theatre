export interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentTask {
  taskId: string
  agentName: string
  systemPrompt: string
  userPrompt: string
  workspaceId?: string
  maxIterations: number
  doneMarker?: string
}

export interface AgentResult {
  taskId: string
  agentName: string
  success: boolean
  output: string
  iterations: number
  durationMs: number
  error?: string
}
