import { parsePipeline, interpolate } from './src/agents/pipeline.js'

console.log('=== Pipeline Parser Test ===\n')

const sampleMarkdown = `# Code Review Pipeline
Input: { filePath: string, reviewType: string }

## Step 1: Read File
agent: file-reader
prompt: |
  Read the file at {{filePath}} and return its full content.
  Focus on {{reviewType}} aspects.

## Step 2: Analyze Code
agent: code-analyzer
prompt: |
  Analyze the following code for {{reviewType}} issues:
  
  {{previousOutput}}
  
  Provide specific recommendations.
maxIterations: 3

## Step 3: Generate Summary
agent: summarizer
prompt: |
  Summarize the code review findings:
  
  {{previousOutput}}
doneMarker: [SUMMARY-DONE]
`

try {
  const pipeline = parsePipeline('code-review', sampleMarkdown)
  console.log('Parsed Pipeline:', JSON.stringify(pipeline, null, 2))

  // Test interpolation
  const testVars = {
    filePath: '/path/to/file.ts',
    reviewType: 'security',
    previousOutput: 'Some previous output'
  }
  
  const interpolated = interpolate(pipeline.steps[0].promptTemplate, testVars)
  console.log('\nInterpolated Step 1 Prompt:')
  console.log(interpolated)

  console.log('\n=== Test Passed ===')
} catch (err) {
  console.error('Test Failed:', err)
  process.exit(1)
}