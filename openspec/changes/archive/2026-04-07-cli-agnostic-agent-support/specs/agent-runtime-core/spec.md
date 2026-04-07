# agent-runtime-core Specification

## Purpose
Define the single runtime-neutral contract for interactive career-ops behavior.

## Requirements
### Requirement: Canonical Runtime Files
The system MUST expose one canonical runtime directory that every adapter consumes. It SHALL include `runtime/modes.yml` for input→mode routing, `runtime/context-loading.yml` for mode→file loading rules, and `runtime/operating-rules.md` for shared execution boundaries, manual-flow rules, and declared deferred capabilities.

#### Scenario: Adapter resolves an interactive command
- GIVEN a supported adapter and `/career-ops scan`
- WHEN the adapter loads runtime metadata
- THEN routing comes from `runtime/modes.yml`
- AND context loading comes from `runtime/context-loading.yml`

#### Scenario: Raw JD stays adapter-neutral
- GIVEN a pasted JD or offer URL
- WHEN any adapter classifies the input
- THEN it resolves to `auto-pipeline` using the same canonical routing file

### Requirement: Business Logic Isolation
The runtime core MUST reference `modes/*`, `CLAUDE.md`, and system scripts as source material, but it MUST NOT duplicate mode business logic or scoring prose. Changes to routing, context loading, or execution policy SHALL be authored in canonical runtime files first, with adapters limited to runtime mapping.

#### Scenario: Shared rule changes once
- GIVEN a new execution rule for interactive flows
- WHEN the rule is introduced
- THEN the change is made in canonical runtime files
- AND adapters only update references or wrappers

#### Scenario: Deferred worker parity remains out of core scope
- GIVEN batch/background worker behavior
- WHEN this change is implemented
- THEN worker abstraction is marked deferred
- AND interactive/manual flows remain the only required parity target
