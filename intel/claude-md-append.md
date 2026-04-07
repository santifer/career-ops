<!-- INTEL ENGINE — added by intel setup -->
### Intelligence Engine Commands

| If the user... | Mode |
|----------------|------|
| Asks for OSINT on a company/person | osint |
| Wants to see auto-discovered roles | prospect |
| Wants to review outreach queue | outreach |
| Wants to run self-improvement | improve |
| Wants intelligence briefing | intel |
| Wants to purge scraped PII data | purge-pii |

### Intel Integration
- After auto-pipeline eval with score >= 4.0: suggest HM discovery + outreach
- After every user action (apply/skip/dismiss): record in config/strategy-ledger.md
- Use intel/router.mjs for OSINT query routing
- Use google-docs-mcp for resume collaboration, gogcli for Drive operations
- Use Gmail MCP for outreach drafts and response monitoring

See intel/README.md for full documentation.
<!-- END INTEL ENGINE -->
