# Sprint 28 — Policy Presets + Sensitive Task Rules

## Goal
Add reusable policy presets and automatic sensitive-task restrictions so
routing becomes safer and easier to control.

## In scope
- Coding, research, private, enterprise presets
- Sensitive prompt detection for PII, credentials, finance, legal, security
- Forced local routing for highest-risk task types
- Approved-provider restrictions for sensitive domains
- Routing explanations that mention policy and sensitive-task rules
- Dashboard and CLI controls for presets

## Out of scope
- ML-based sensitivity classification
- DLP integration
- Remote compliance engine
- Team-level policy inheritance
- External policy sync

## Acceptance criteria
1. Applying a preset updates routing behavior immediately.
2. PII or credential-like prompts force local routing.
3. Finance, legal, and security-sensitive prompts restrict candidate providers.
4. Routing explanations show preset or sensitive-rule influence.
5. Dashboard and CLI can list and apply presets.

## Estimated effort
24–32 hours, building on Sprint 27 policy engine.
