# cli-adapters Specification

## Purpose
Define thin runtime adapters for Claude and OpenCode without allowing adapter drift.

## Requirements
### Requirement: Adapter-Specific Entry Files
The system MUST keep adapter-specific instructions in adapter-owned files only. Claude SHALL use `.claude/skills/career-ops/SKILL.md` as its interactive entrypoint. OpenCode SHALL use `AGENTS.md` plus `.opencode/**` entry files, including a specialized `career-ops` agent and explicit command wrapper. These files MUST describe invocation syntax and runtime affordances, but SHALL point to canonical runtime files for routing, context loading, and operating rules.

#### Scenario: Claude adapter stays thin
- GIVEN a Claude invocation
- WHEN the adapter is reviewed
- THEN Claude-specific files contain wrapper behavior only
- AND canonical routing/rules are referenced, not restated

#### Scenario: OpenCode preferred UX stays bounded
- GIVEN an OpenCode invocation
- WHEN both the specialized `career-ops` agent and explicit `/career-ops` command surface exist
- THEN the specialized agent is treated as the preferred interface for natural-language use
- AND explicit commands remain fallback/escape-hatch UX
- AND both surfaces resolve through the same canonical runtime files and safeguards

### Requirement: Drift Prevention Contract
Adapters MUST advertise the same supported interactive modes, context-loading behavior, and safety boundaries as the runtime core. Any adapter-only enhancement MAY exist, but it MUST be declared as additive and MUST NOT redefine business outcomes or bypass shared safeguards.

#### Scenario: Adapter adds unsupported divergence
- GIVEN an adapter that changes a mode map or skips a safeguard
- WHEN compatibility checks run
- THEN the change fails validation

#### Scenario: Adapter-specific enhancement is acceptable
- GIVEN OpenCode adds a better manual UX for an existing mode
- WHEN compatibility checks run
- THEN the enhancement passes if core routing and safeguards are unchanged
