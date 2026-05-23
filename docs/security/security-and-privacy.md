# strategic-learning-unified-theatre — Security and Privacy

## Overview
The product is designed around a local-first workflow.
Sensitive operational state, experience memory, and training exports are intended to stay on the user's machine unless explicitly moved elsewhere.

## Security Principles
- Local-first storage
- Least exposure of sensitive data
- No plaintext secrets in logs
- Secure file permissions where applicable
- Atomic writes for critical outputs
- Clear separation between active state and published documentation

## Data Handled
- Browser-captured chat content
- VS Code activity signals
- Prompt history
- Mistake and rubric records
- Training export pairs
- Handoff and sprint metadata

## Storage Locations
- Experience database
- Browser response capture folders
- VS Code signal staging folders
- Training export output folders

## Privacy Position
User workflow data is valuable and sensitive.
The product should default to local retention, explicit operator control, and minimal unnecessary exposure.

## Current Controls
- Local SQLite storage
- Atomic file writes
- Restricted file permissions for exports where required
- No plaintext secrets in logs
- Snapshot-based handoff to reduce uncontrolled sprawl

## Known Limitations
- Security hardening is still evolving
- Enterprise controls are not yet complete
- Formal retention and deletion policies are still early-stage

## Recommended Future Additions
- Data retention policy
- Redaction rules for sensitive captures
- Export classification rules
- Backup and restore guidance
- Threat model and security review checklist

## User Trust Statement
The long-term goal is to give users more control over their AI workflow memory, not less.
