# Data Handling

## Principles
- Keep all private data local and DB-backed.
- Minimize the amount of sensitive information written to curated docs.
- Prefer abstract descriptions over raw examples when describing data flows.

## What to document
- Data origins and destinations.
- Where sensitive signals are stored.
- How exported examples are sanitized before use.

## What not to document
- Raw local file paths with private data.
- Secrets, API keys, or any personally identifiable signals.
- Internal user session contents.
