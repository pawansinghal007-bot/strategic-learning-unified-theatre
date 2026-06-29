import { parsePipeline } from './src/agents/pipeline.js'

console.log('=== Simple Pipeline Parser Test ===\n')

const simpleMarkdown = `# Simple Pipeline
Input: { test: string }

## Step 1: First Step
agent: test-agent
prompt: |
  This is a test prompt.
  {{test}} should be replaced.
`

try {
  const pipeline = parsePipeline('simple', simpleMarkdown)
  console.log('Parsed Pipeline:', JSON.stringify(pipeline, null, 2))
  console.log('\n=== Test Passed ===')
} catch (err) {
  console.error('Test Failed:', err)
  process.exit(1)
}