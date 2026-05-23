# Data Flow

## Browser capture path
1. Online LLM session is observed in the browser.
2. Browser responses are written to capture files.
3. The ingester processes those files and stores chunks in the experience database.

## VS Code signal path
1. VS Code activity is collected by the passive learning integration.
2. Signals are staged and normalized.
3. The ingester adds them to the experience database.

## Prompt generation path
1. The prompt generator retrieves documents, mistakes, and context from the experience database.
2. It assembles context-aware prompts for future sessions.

## Training export path
1. Experience data is exported as JSONL.
2. Exported examples are prepared for future local fine-tuning readiness.

## Current limitation
The training export path exists, but local fine-tuning is not yet production-ready due to sparse paired training data.
