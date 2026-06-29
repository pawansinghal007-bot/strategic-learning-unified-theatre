import { appendSessionLog, readSessionLog } from "./src/agents/memory/session-log";

// Test the session log functionality
console.log("Testing session log functionality...");

// Test append
appendSessionLog({
  timestamp: new Date().toISOString(),
  command: 'test',
  taskId: '123',
  stepNumber: 1,
  stepName: 'test-step',
  agentName: 'test-agent',
  success: true,
  durationMs: 42,
  outputPreview: 'hello'
});

// Test read
const entries = readSessionLog();
console.log("Session log entries:", entries);

// Test with a longer output
appendSessionLog({
  timestamp: new Date().toISOString(),
  command: 'test2',
  taskId: '456',
  stepNumber: 2,
  stepName: 'test-step2',
  agentName: 'test-agent2',
  success: false,
  durationMs: 100,
  outputPreview: 'This is a longer output that should be truncated to 200 characters. ' + 'x'.repeat(250),
  error: 'Test error message'
});

const allEntries = readSessionLog(10);
console.log("All session log entries:", allEntries);