import React, { useEffect, useState } from 'react'

const SUITES = [
  { id: 'functional', label: 'Functional' },
  { id: 'non_functional', label: 'Non-functional' },
  { id: 'regression', label: 'Regression' },
  { id: 'all', label: 'All suites' }
]

export default function RobotFramework() {
  const [suite, setSuite] = useState('functional')
  const [status, setStatus] = useState('')
  const [summary, setSummary] = useState(null)
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [selectedRobotFile, setSelectedRobotFile] = useState('')
  const [selectedSourceFile, setSelectedSourceFile] = useState('')
  const [generatedRobotFile, setGeneratedRobotFile] = useState('')
  const [robotFiles, setRobotFiles] = useState([])
  const [browserSelectedFile, setBrowserSelectedFile] = useState('')
  const [previewContent, setPreviewContent] = useState('')

  useEffect(() => {
    setSummary(null)
    setOutput('')
    setStatus('Select a suite or file, then run tests or generate a Robot skeleton from a source file.')
    loadRobotFiles()
  }, [])

  const loadRobotFiles = async () => {
    try {
      const files = await globalThis.rotator.robot.listFiles()
      setRobotFiles(files)
      setStatus(`Loaded ${files.length} Robot files.`)
    } catch (err) {
      setStatus(`Failed to load Robot files: ${String(err)}`)
    }
  }

  const previewRobotFile = async (file) => {
    setBrowserSelectedFile(file)
    setStatus(`Previewing ${file}...`)
    setSummary(null)
    setOutput('')
    try {
      const content = await globalThis.rotator.robot.readFile(file)
      setPreviewContent(content)
      setStatus(`Preview loaded for ${file}`)
    } catch (err) {
      console.error('[RobotFramework] previewFile error', err)
      setPreviewContent('')
      setStatus(`Failed to preview ${file}: ${String(err)}`)
    }
  }

  const openBrowserFile = async (file) => {
    setStatus(`Opening ${file}...`)
    try {
      const result = await globalThis.rotator.robot.openFile(file)
      setStatus(`Opened file in editor: ${result.path}`)
    } catch (err) {
      setStatus(`Failed to open file: ${String(err)}`)
    }
  }

  const runSuite = async () => {
    setRunning(true)
    setStatus(`Running ${suite} Robot suite...`)
    setSummary(null)
    setOutput('')

    try {
      const result = await globalThis.rotator.robot.runSuite({ suite })
      setSummary(result)
      setStatus(`Completed ${suite} suite with exit code ${result.exitCode}`)
      setOutput(JSON.stringify(result, null, 2))
    } catch (err) {
      console.error('[RobotFramework] runSuite error', err)
      setStatus(`Robot suite failed: ${String(err)}`)
      setOutput(String(err))
    } finally {
      setRunning(false)
    }
  }

  const runSelectedRobotFile = async () => {
    if (!selectedRobotFile) {
      setStatus('Select a Robot file first.')
      return
    }
    setRunning(true)
    setStatus(`Running ${selectedRobotFile}...`)
    setSummary(null)
    setOutput('')

    try {
      const result = await globalThis.rotator.robot.runFile(selectedRobotFile)
      setSummary(result)
      setStatus(`Completed ${selectedRobotFile} with exit code ${result.exitCode}`)
      setOutput(JSON.stringify(result, null, 2))
    } catch (err) {
      console.error('[RobotFramework] runFile error', err)
      setStatus(`Robot file run failed: ${String(err)}`)
      setOutput(String(err))
    } finally {
      setRunning(false)
    }
  }

  const runTddCheck = async () => {
    setRunning(true)
    setStatus('Running TDD check...')
    setSummary(null)
    setOutput('')

    try {
      const result = await globalThis.rotator.robot.tddCheck({ graceMs: 60000 })
      setSummary({ passed: result.length === 0 ? 1 : 0, failed: result.length })
      setStatus(result.length === 0 ? 'TDD check passed.' : 'TDD check found violations.')
      setOutput(JSON.stringify(result, null, 2))
    } catch (err) {
      setStatus(`TDD check failed: ${String(err)}`)
      setOutput(String(err))
    } finally {
      setRunning(false)
    }
  }

  const pickRobotFile = async () => {
    const file = await globalThis.rotator.robot.pickRobotFile()
    if (file) {
      setSelectedRobotFile(file)
      setStatus(`Selected Robot file: ${file}`)
    }
  }

  const pickSourceFile = async () => {
    const file = await globalThis.rotator.robot.pickSourceFile()
    if (file) {
      setSelectedSourceFile(file)
      setGeneratedRobotFile('')
      setStatus(`Selected source file: ${file}`)
    }
  }

  const generateSkeleton = async () => {
    if (!selectedSourceFile) {
      setStatus('Select a source file first.')
      return
    }
    setRunning(true)
    setStatus(`Generating skeleton for ${selectedSourceFile}...`)
    setSummary(null)
    setOutput('')

    try {
      const generatedPath = await globalThis.rotator.robot.generateSkeleton(selectedSourceFile)
      setGeneratedRobotFile(generatedPath)
      setStatus(`Skeleton generated at: ${generatedPath}`)
      setOutput(generatedPath)
      await loadRobotFiles()
    } catch (err) {
      setStatus(`Skeleton generation failed: ${String(err)}`)
      setOutput(String(err))
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
        <div>
          <h2 className="text-xl font-semibold">Robot Framework</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Run Robot suites, choose a test file, or generate a Robot skeleton from a source file.</p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">GUI-driven testing</div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4 mb-4">
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium">Suite</label>
            <select value={suite} onChange={(e) => setSuite(e.target.value)} className="mt-1 p-2 border rounded w-full">
              {SUITES.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <button onClick={runSuite} disabled={running} className="px-4 py-2 bg-blue-600 text-white rounded">
              {running ? 'Running...' : 'Run suite'}
            </button>
            <button onClick={runTddCheck} disabled={running} className="px-4 py-2 bg-teal-600 text-white rounded">
              {running ? 'Running...' : 'Run TDD check'}
            </button>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <div className="font-medium mb-2">Selected Robot file</div>
            <div className="space-y-2">
              <button onClick={pickRobotFile} disabled={running} className="px-4 py-2 bg-slate-600 text-white rounded">
                Choose Robot file
              </button>
              {selectedRobotFile && (
                <div className="text-sm text-gray-700 dark:text-gray-300 break-words">{selectedRobotFile}</div>
              )}
              <button onClick={runSelectedRobotFile} disabled={running || !selectedRobotFile} className="px-4 py-2 bg-indigo-600 text-white rounded">
                {running ? 'Running...' : 'Run selected file'}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="font-medium mb-2">Generate Robot skeleton</div>
          <div className="mb-4">
            <button onClick={pickSourceFile} disabled={running} className="px-4 py-2 bg-slate-600 text-white rounded">
              Select source file
            </button>
            {selectedSourceFile && (
              <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 break-words">{selectedSourceFile}</div>
            )}
          </div>
          <button onClick={generateSkeleton} disabled={running || !selectedSourceFile} className="px-4 py-2 bg-emerald-600 text-white rounded w-full">
            {running ? 'Generating...' : 'Generate skeleton'}
          </button>
          {generatedRobotFile && (
            <div className="mt-4 text-sm text-green-600 dark:text-green-400 break-words">
              Generated file: {generatedRobotFile}
              <div className="mt-2">
                <button onClick={() => openBrowserFile(generatedRobotFile)} disabled={running} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
                  Open generated file
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 mb-4">
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Robot test browser</div>
            <button onClick={loadRobotFiles} disabled={running} className="text-sm px-3 py-1 bg-slate-600 text-white rounded">
              Refresh
            </button>
          </div>
          <div className="h-64 overflow-auto border border-gray-200 dark:border-gray-700 rounded p-2 bg-gray-50 dark:bg-gray-900">
            {robotFiles.length === 0 ? (
              <div className="text-sm text-gray-500">No Robot files found.</div>
            ) : (
              robotFiles.map((file) => (
                <div key={file} className="mb-2 p-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm break-all">{file}</span>
                    <div className="flex gap-2">
                      <button onClick={() => previewRobotFile(file)} disabled={running} className="px-2 py-1 text-xs bg-blue-600 text-white rounded">
                        Preview
                      </button>
                      <button onClick={() => openBrowserFile(file)} disabled={running} className="px-2 py-1 text-xs bg-teal-600 text-white rounded">
                        Open
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded shadow p-4">
          <div className="font-medium mb-3">Preview</div>
          {browserSelectedFile ? (
            <>
              <div className="text-sm text-gray-700 dark:text-gray-300 mb-3 break-words">{browserSelectedFile}</div>
              <div className="h-80 overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 text-xs whitespace-pre-wrap break-words">{previewContent || 'No preview available.'}</div>
            </>
          ) : (
            <div className="text-sm text-gray-500">Select a Robot file to preview its contents.</div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 mb-4">
        <div className="text-sm text-blue-600 dark:text-blue-400 mb-2">{status}</div>
        {summary && (
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded border border-gray-200 dark:border-gray-700 mb-4">
            <div className="font-medium mb-2">Result summary</div>
            <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(summary, null, 2)}</pre>
          </div>
        )}
        <div className="bg-gray-50 dark:bg-gray-900 rounded shadow p-4">
          <div className="font-medium mb-2">Output</div>
          <pre className="text-xs whitespace-pre-wrap break-words max-h-96 overflow-auto">{output || 'No output yet.'}</pre>
        </div>
      </div>
    </div>
  )
}
