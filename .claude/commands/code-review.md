# Code Review Pipeline
Input: { filePath: string }

## Step 1: review
agent: code-reviewer
prompt: |
  Review the file at {{filePath}}.
  Project root is /home/pawan/vscodeagent/Solution.
  Use the read-file tool to read the file before reviewing.
  Follow all instructions in your system prompt exactly.
  Write your review in the required format and end with [DONE].
maxIterations: 5
doneMarker: [DONE]