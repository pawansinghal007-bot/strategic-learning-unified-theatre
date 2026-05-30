import React, { useEffect, useState } from 'react'

const MODEL_OPTIONS = [
  { value: 'phi3', label: 'Phi-3-mini-4k-instruct-q4' },
  { value: 'tinyllama', label: 'TinyLlama 1.1b' }
]

export default function LocalLLM() {
  const [status, setStatus] = useState({ available: false, models: [], modelPath: null })
  const [model, setModel] = useState('phi3')
  const [question, setQuestion] = useState('Explain the purpose of a VS Code auth switcher in a browser automation tool.')
  const llm = globalThis.rotator.llm // NOSONAR
  const [answer, setAnswer] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const refreshStatus = async () => {
    try {
      const stat = await llm.status()
      setStatus(stat)
    } catch (err) {
      setStatus({ available: false, models: [], modelPath: null })
      setMessage(String(err))
    }
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  const handleSetup = async () => {
    setLoading(true)
    setMessage('Downloading and validating model...')
    try {
      const result = await llm.setup({ model })
      setMessage(`Model ready at ${result.modelPath}`)
      await refreshStatus()
    } catch (err) {
      setMessage(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleAsk = async () => {
    if (!question || question.trim().length === 0) {
      return
    }
    setLoading(true)
    setAnswer('')
    setMessage('Querying local LLM...')
    try {
      const response = await llm.ask({ question, modelPath: status.modelPath })
      setAnswer(typeof response === 'string' ? response : JSON.stringify(response, null, 2))
      setMessage('Answer received')
    } catch (err) {
      setMessage(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold">Local LLM</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Install and query a local model from the renderer.</p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Status: {status.available ? 'Ready' : 'Not available'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-4">
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h3 className="font-medium mb-2">Model status</h3>
          <div className="text-sm text-gray-600 dark:text-gray-300 mb-2">Available models:</div>
          <ul className="text-sm space-y-1">
            {status.models.length > 0 ? status.models.map((item) => (
              <li key={item}>{item}</li>
            )) : <li className="text-gray-500">No local models found.</li>}
          </ul>
          {status.modelPath && (
            <div className="mt-3 text-xs text-gray-500 break-all">{status.modelPath}</div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h3 className="font-medium mb-2">Install model</h3>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full p-2 border rounded mb-3">
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button onClick={handleSetup} disabled={loading} className="w-full px-4 py-2 bg-teal-600 text-white rounded">
            {loading ? 'Installing...' : 'Download and install'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 mb-4">
        <h3 className="font-medium mb-2">Ask the local model</h3>
        <textarea
          rows={4}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full p-2 border rounded mb-3"
        />
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleAsk} disabled={loading || !status.available} className="px-4 py-2 bg-blue-600 text-white rounded">
            {loading ? 'Asking...' : 'Ask model'}
          </button>
          <button onClick={refreshStatus} className="px-4 py-2 bg-gray-200 text-gray-900 rounded">Refresh status</button>
        </div>
      </div>

      {message && <div className="mb-4 text-sm text-blue-600 dark:text-blue-400">{message}</div>}

      {answer && (
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4 whitespace-pre-wrap break-words">
          <h3 className="font-medium mb-2">Response</h3>
          <div className="text-sm text-gray-100">{answer}</div>
        </div>
      )}
    </div>
  )
}
