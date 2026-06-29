# Code Standards

## TypeScript
- Strict mode enabled: no implicit any, strict null checks
- Prefer interfaces over type aliases for object shapes
- Use const over let where possible
- Destructure imports: import { x } from 'y' not import * as y

## Documentation
- JSDoc on all exported functions: @param, @returns, @throws
- JSDoc on all exported classes and interfaces
- Inline comments for non-obvious logic only

## Error Handling
- All async functions: wrap in try/catch or use Result pattern
- Never swallow errors silently — log with logger.warn or logger.error
- Throw typed errors (extend DomainError from ../shared/errors)

## Logging
- Import: import { logger } from '../shared/logging/logger'
- Use structured events: logger.info('module.event', { key: value })
- No console.log, console.warn, console.error in src/

## Testing
- Co-locate tests: src/foo/bar.ts → src/foo/bar.test.ts
- Test file must import the module under test directly
- At minimum: one happy-path test, one error-path test per exported function

## Functions
- Max 50 lines per function (excluding JSDoc)
- Single responsibility: one function does one thing
- Name functions as verbs: getX, buildY, applyZ