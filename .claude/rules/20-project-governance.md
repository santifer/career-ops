---
title: Project Governance (CI/CD, Community, Contributing)
type: rule
priority: medium
description: Padrões de CI/CD (GitHub Actions, branch protection, Dependabot), processo de contribuição, governança (BDFL ladder), Code of Conduct, política de segurança e suporte do projeto Career-Ops open-source.
applies_when:
  - Modificando .github/workflows/* ou GitHub Actions
  - Atualizando CONTRIBUTING.md, CODE_OF_CONDUCT.md, GOVERNANCE.md, SECURITY.md, SUPPORT.md
  - Discutindo processo de PR, review ou release
  - Onboarding de novos contribuidores
  - Atualizando políticas de comunidade (Discord, Discussions)
globs:
  - .github/**/*.yml
  - .github/**/*.md
  - CONTRIBUTING.md
  - CODE_OF_CONDUCT.md
  - GOVERNANCE.md
  - SECURITY.md
  - SUPPORT.md
  - test-all.mjs
last_updated: 2026-04-26
version: 1.1.0
related:
  - CONTRIBUTING.md
  - GOVERNANCE.md
  - .claude/rules/10-scan-priority.md
---

# Project Governance (CI/CD, Community, Contributing)

## CI/CD and Quality

- **GitHub Actions** run on every PR: `test-all.mjs` (63+ checks), auto-labeler (risk-based: 🔴 core-architecture, ⚠️ agent-behavior, 📄 docs), welcome bot for first-time contributors
- **Branch protection** on `main`: status checks must pass before merge. No direct pushes to main (except admin bypass).
- **Dependabot** monitors npm, Go modules, and GitHub Actions for security updates
- **Contributing process**: issue first → discussion → PR with linked issue → CI passes → maintainer review → merge

## Community and Governance

- **Code of Conduct**: Contributor Covenant 2.1 with enforcement actions (see `CODE_OF_CONDUCT.md`)
- **Governance**: BDFL model with contributor ladder — Participant → Contributor → Triager → Reviewer → Maintainer (see `GOVERNANCE.md`)
- **Security**: private vulnerability reporting via email (see `SECURITY.md`)
- **Support**: help questions go to Discord/Discussions, not issues (see `SUPPORT.md`)
- **Discord**: https://discord.gg/8pRpHETxa4
