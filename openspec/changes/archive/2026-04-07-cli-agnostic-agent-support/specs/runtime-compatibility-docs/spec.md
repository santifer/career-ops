# runtime-compatibility-docs Specification

## Purpose
Document supported runtimes, update boundaries, and test expectations for the agnostic architecture.

## Requirements
### Requirement: Docs and System-Layer Classification
The system MUST update `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`, and `DATA_CONTRACT.md` to describe the runtime-neutral core, supported adapters, and the first-PR scope. Adapter files for Claude and OpenCode SHALL be classified as system-layer assets, not user data.

#### Scenario: User reads support expectations
- GIVEN a contributor reads repo docs
- WHEN they inspect runtime documentation
- THEN they can identify supported adapters, canonical files, current limitations, and OpenCode's preferred specialized-agent UX with explicit commands as fallback

### Requirement: Update and Test Expectations
The system MUST update repo tooling so release/update/test paths know about canonical runtime files and adapter entry files. `test-all.mjs` and related checks SHALL verify adapter references to the core, and docs MUST state that batch/background worker parity is deferred, not promised, in this PR.

#### Scenario: Deferred work is explicit
- GIVEN a contributor reviews support docs or tests
- WHEN they inspect batch/background behavior
- THEN they see it marked as deferred follow-up work
- AND no first-PR parity claim is implied

#### Scenario: Compatibility regression is caught
- GIVEN an adapter file stops referencing canonical runtime metadata
- WHEN automated checks run
- THEN the regression fails validation before release
