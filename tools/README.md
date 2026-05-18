# tools/

Fork-only additions that sit alongside upstream career-ops. Not covered by
`DATA_CONTRACT.md` — these are for the local deployment, not for upstream PRs.

## send-application-mail.mjs

Sends one email with optional PDF attachments via SMTP. Drives the
rate-screen / cover-letter / follow-up workflows that career-ops drafts
into `batch/apply-docs/`.

### Setup

```bash
cp .env.mail.example .env.mail
# Edit .env.mail — uncomment the Gmail block OR the Mailcow block, fill creds
```

### Examples

**Dry-run (no send) — sanity check before the real one:**
```bash
node tools/send-application-mail.mjs \
  --to "Recruiter Name <recruiter@example.com>" \
  --subject "Senior AI Engineer (Berlin / Full Remote) — rate-band screen" \
  --body batch/apply-docs/000-rate-screen-emails.md \
  --section "## Email 1" \
  --dry-run
```

**Send a rate-screen (body-only, no attachment):**
```bash
node tools/send-application-mail.mjs \
  --to recruiter@example.com \
  --subject "Senior AI Engineer (Berlin / Full Remote) — rate-band screen" \
  --body batch/apply-docs/000-rate-screen-emails.md \
  --section "## Email 1"
```

**Send a tailored apply with cover letter + CV PDF:**
```bash
node tools/send-application-mail.mjs \
  --to careers@example.com \
  --subject "Senior Solutions Architect — Your Name" \
  --body batch/apply-docs/NNN-company-role.md \
  --section "## Cover Letter" \
  --attach output/NNN-company-role-cv-YYYY-MM-DD.pdf
```

### Tips

- The `--section` flag extracts a markdown subsection from the body file —
  the email files in `batch/apply-docs/` are organised so each `##` heading
  is one ready-to-send email. Look at the file before sending to confirm
  the section name.
- The script will not send if SMTP `verify()` fails — saves you from
  silently mis-credentialed sends.
- For ATS systems that prefer text-only bodies, omit `--html`; the default
  is plain text and most career portals are fine with that.
- **Never** put `.env.mail` under version control; it's gitignored.
- Set `SMTP_TLS_INSECURE=true` in `.env.mail` only when sending through an
  SMTP relay you own that uses a self-signed cert (e.g. Mailcow whose ACME
  challenge is blocked by a fronting reverse proxy). Never set it for
  third-party relays.

## provision-mailcow-mailbox.mjs

Idempotent Mailcow mailbox creator. Reads `~/.mailcow-credentials` for
`MAILCOW_URL` + `MAILCOW_API_KEY`, talks to the Mailcow API on
`https://127.0.0.1:8443` (bypasses the public-IP ACL that hardened Mailcow
installs apply to the API).

### Examples

**Create a new mailbox:**
```bash
node tools/provision-mailcow-mailbox.mjs \
  --mailbox you@yourdomain.com \
  --name "Your Name" \
  --quota-mb 4096 \
  --creds-out ~/.yourdomain-mailbox-credentials
```

**Rotate the password on an existing mailbox** (breaks any active sessions):
```bash
node tools/provision-mailcow-mailbox.mjs \
  --mailbox you@yourdomain.com \
  --rotate --force \
  --creds-out ~/.yourdomain-mailbox-credentials
```

The script:
- Verifies the requested domain is provisioned in Mailcow (exits 4 if not).
- Refuses to overwrite an existing mailbox unless `--rotate --force`.
- Writes a 0600 credentials file with `MAILBOX_ADDRESS`, `MAILBOX_PASSWORD`,
  `SMTP_HOST`, `SMTP_PORT`, `IMAP_HOST`, `IMAP_PORT`. Shape matches what
  `send-application-mail.mjs` reads.
