# System Context

## Purpose
This page describes the broader environment and constraints for the repository.

## Local-first workflow
The system is designed to work primarily on the local machine, with browser capture, VS Code signal ingestion, and a local experience database.

## Platform scope
- Target environment: Windows and Node 18+.
- No build step is required for the core repo.
- No cloud API calls are expected for local inference workflows.

## Current state
- Browser capture and VS Code passive learning exist.
- The experience database is in local SQLite.
- Training export readiness path exists, but local fine-tuning is not production-ready yet.
