# Standing Rules

## Persistent architecture rules
- Qdrant is the only supported vector store; Milvus is not permitted.
- PostgreSQL is the only supported relational store.
- Guard files must be preserved and respected; do not bypass them without explicit maintainer direction.
- The preload entrypoint is extend-only; do not replace or rewrite its role.
- The Window interface is the canonical integration surface for window-related behavior.
- IPC modules must stay lazy-require based unless a change explicitly requires otherwise.
- `.cjs` imports must retain the explicit extension when required by the module system.
- Playwright Electron launches must use `electron.launch()` as the supported pattern.

## Drift Log

| Date | File | Contradiction | Note |
|---|---|---|---|
