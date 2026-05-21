import React, { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import StatusBar from './components/StatusBar'
import Dashboard from './screens/Dashboard'
import Accounts from './screens/Accounts'
import LiveFeed from './screens/LiveFeed'
import GitMonitor from './screens/GitMonitor'
import ProgressLog from './screens/ProgressLog'
import Settings from './screens/Settings'
import LocalLLM from './screens/LocalLLM'
import BrowserAutomation from './screens/BrowserAutomation'
import BrowserPanel from './BrowserPanel'
import PromptTemplates from './screens/PromptTemplates'
import RobotFramework from './screens/RobotFramework'

const SCREENS = {
  DASH: 'dashboard',
  ACC: 'accounts',
  LLM: 'llm',
  BROWSER: 'browser',
  PROMPTS: 'prompts',
  ROBOT: 'robot',
  LIVE: 'live',
  GIT: 'git',
  PROG: 'progress',
  SETTINGS: 'settings'
}

export default function App() {
  const [screen, setScreen] = useState(SCREENS.DASH)
  const [daemon, setDaemon] = useState({ running: false })
  const [activeTemplate, setActiveTemplate] = useState(null)

  useEffect(() => {
    window.rotator.daemon.status().then(setDaemon).catch(() => {})
    const handler = (evt) => {
      // optionally update daemon status on events
    }
    window.rotator.daemon.onEvent(handler)
    return () => window.rotator.daemon.offEvent(handler)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const map = {
        '1': SCREENS.DASH,
        '2': SCREENS.ACC,
        '3': SCREENS.LLM,
        '4': SCREENS.BROWSER,
        '5': SCREENS.PROMPTS,
        '6': SCREENS.LIVE,
        '7': SCREENS.GIT,
        '8': SCREENS.PROG,
        '9': SCREENS.SETTINGS,
        '0': SCREENS.ROBOT
      }
      const s = map[e.key]
      if (s) setScreen(s)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const isBrowser = screen === SCREENS.BROWSER
    if (window.rotator && window.rotator.browser && window.rotator.browser.setVisible) {
      window.rotator.browser.setVisible(isBrowser).catch(() => {})
    }
  }, [screen])

  const handleEditTemplate = (template) => {
    setActiveTemplate(template)
    setScreen(SCREENS.PROMPTS)
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar active={screen} onSelect={setScreen} />
      <div className="flex-1 flex flex-col">
        <div className="flex-1 p-4 overflow-auto">
          {screen === SCREENS.DASH && <Dashboard />}
          {screen === SCREENS.ACC && <Accounts />}
          {screen === SCREENS.LLM && <LocalLLM />}
          {screen === SCREENS.BROWSER && <BrowserPanel initialPlatform="chatgpt" />}
          {screen === SCREENS.PROMPTS && <PromptTemplates activePrompt={activeTemplate} />}
          {screen === SCREENS.ROBOT && <RobotFramework />}
          {screen === SCREENS.LIVE && <LiveFeed />}
          {screen === SCREENS.GIT && <GitMonitor />}
          {screen === SCREENS.PROG && <ProgressLog />}
          {screen === SCREENS.SETTINGS && <Settings />}
        </div>
        <StatusBar />
      </div>
    </div>
  )
}
