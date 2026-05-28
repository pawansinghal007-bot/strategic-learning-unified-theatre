# Robot Framework Test Suite

This directory contains Robot Framework integration and regression tests for `strategic-learning-unified-theatre`.

## Purpose

- Provide a system-level test layer above the existing `vitest` unit tests
- Validate CLI behavior, file permissions, and integration flows
- Support a TDD workflow for new source files

## Layout

- `robot/resources/common.resource` — shared keywords and CLI helpers
- `robot/resources/cli.resource` — CLI-specific Robot keywords
- `robot/functional` — functional coverage tests
- `robot/non_functional` — performance, security, and reliability tests
- `robot/regression` — high-level smoke and bug regression tests

## Getting started

Install Robot Framework and Playwright dependencies globally or in your Python environment:

```bash
pip install robotframework robotframework-playwright
```

Run the scaffolded runner:

```bash
npm run test:robot:all
```

Generate a skeleton Robot file for a new source module:

```bash
node ./src/test-runner.js skeleton src/my-module.js
```

