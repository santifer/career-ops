---
description: Draft outreach/intro messages to a person
---

# /career-ops-contact

Arguments: `$ARGUMENTS` (person's name, optionally + company + context)

Load context:
1. `modes/_shared.md`
2. `modes/_profile.md`
3. `config/profile.yml`
4. `cv.md`

Read `modes/contacto.md` and execute it. The mode will:
- Draft a LinkedIn-style intro or email (short, specific, proof-point-first)
- Surface one concrete thing about the recipient (recent post, product, shared connection, talk) to anchor the hook
- Keep under 80 words; no "I hope this finds you well"
- Match the recipient's language

Stop at drafted message. Never send.
