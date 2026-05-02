# Mode: cover-site -- Deployed Cover Letter SPA

Build and deploy a one-off Cloudflare Worker SPA for a specific job application. The site is a cover letter + personal site hybrid: a polished, public artifact the candidate can include in an application to show fit, taste, speed, and engineering ability.

This mode should run in a subagent. The parent agent should pass any recently mentioned company, role, job URL, report path, JD text, or deployment preference as invocation-specific context. The subagent owns context resolution, project generation, build verification, deploy, report updates, and final handoff.

Before launching the subagent, the parent agent must instruct the subagent to read and apply these design references:

1. The local `frontend-design` skill instructions.
2. The SVG animation skill at `https://raw.githubusercontent.com/supermemoryai/skills/refs/heads/main/svg-animations/SKILL.md`.

The parent agent does not need to read or apply those references itself. The subagent prompt should make the references explicit so the subagent loads/reads them before designing or implementing the site.

## Invocation

Primary:

```text
/career-ops cover-site
```

Optional context hints:

```text
/career-ops cover-site {job posting URL | report path | company name}
```

Do not require positional arguments if the company, job posting, or report is already present in the conversation or repository context.

## Required Sources

Always read:

1. `cv.md`
2. `config/profile.yml`
3. `modes/_profile.md`
4. `article-digest.md` if it exists
5. The most relevant existing report in `reports/` if a company or role can be inferred

Use these sources as truth. Do not invent experience, metrics, customers, links, or credentials.

## Context Resolution

Resolve the application target in this order:

1. Explicit hints in the `cover-site` invocation.
2. Recent job posting URL, JD text, company name, role title, or report path in the conversation.
3. Matching `reports/{###}-{company-slug}-{YYYY-MM-DD}.md`; prefer the newest matching report.
4. Current browser/page context if available: URL, title, and visible job posting content.
5. `data/applications.md` or `data/pipeline.md` if the user clearly refers to a recently evaluated or pending company.

Ask one concise question only when a critical input cannot be inferred. Critical inputs are company name and either a JD, job posting URL, or existing report. Resume context is not a critical question because it comes from `cv.md` and profile files by default.

If multiple plausible companies or reports match, ask the user to choose before creating or deploying anything.

## Paths and Names

Local project directory:

```text
../job-app-sites/{company-slug}-application/
```

Worker project name for first deploy:

```text
{company-slug}-application-{7 random lowercase hex chars}
```

Example:

```text
../job-app-sites/cloudflare-application/
cloudflare-application-a13f9c2
```

Rules:

1. Normalize company names to lowercase kebab-case for paths and worker names.
2. Create `../job-app-sites/` if missing.
3. If the local project already exists and has a `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc` with a `name`, preserve that deployed worker name. Do not create a new URL unless the user asks for a fresh deploy.
4. If the local project exists but has no Wrangler name, add one using the naming rule above.
5. Keep all generated application-site work under `../job-app-sites/`.

Use Node's crypto module or equivalent to generate the suffix. Example:

```bash
node -e "console.log(require('crypto').randomBytes(4).toString('hex').slice(0, 7))"
```

## Site Brief

Create a premium SPA that blends:

1. A concise cover letter written to the company.
2. A personal engineering microsite.
3. A proof map from the JD to the candidate's real experience.
4. A subtle meta-signal that the candidate can quickly put together a deployed, tasteful, technically credible artifact with AI-assisted engineering workflows.

Content structure:

1. Hero: candidate + company, one sharp thesis for why this match makes sense, primary CTA to resume/PDF or email, secondary CTA to GitHub/LinkedIn/portfolio when available.
2. Why this role: 2-4 concrete reasons tied to the JD and company.
3. Proof map: exact JD needs mapped to real proof points from `cv.md`, `article-digest.md`, `_profile.md`, or the matched report.
4. Selected work: 2-4 relevant projects or achievements with metrics.
5. Operating style: how the candidate builds, ships, collaborates, debugs, and uses AI.
6. Closing note: short, confident, specific cover-letter close.

Tone:

1. Direct, specific, and selective: "I'm choosing this company for concrete reasons."
2. No generic enthusiasm, no corporate filler, no claims that cannot be traced to source files.
3. Mention AI-assisted creation only as a work-style signal, not as prompt-language or design commentary.
4. Use the language of the JD; default to English.

## Design Requirements

Use the injected frontend-design guidance before implementing:

1. State a visual thesis, content plan, and interaction plan before writing files.
2. Treat this as greenfield unless the generated project already has a design system.
3. Make the first viewport feel like a poster, not a generic SaaS page.
4. Avoid generic card grids, purple-on-white defaults, and stock gradient decoration.
5. Ship responsive desktop and mobile layouts.
6. Use semantic HTML, visible focus states, and WCAG AA contrast.
7. Include `prefers-reduced-motion` handling.

Use the injected SVG animation guidance from:

```text
https://raw.githubusercontent.com/supermemoryai/skills/refs/heads/main/svg-animations/SKILL.md
```

Apply these SVG rules:

1. Inline SVGs with `viewBox`, `<title>`, and `<desc>`.
2. Prefer `transform`, `opacity`, gradients, masks, stroke drawing, and path motion for performance.
3. Use `stroke-linecap="round"` for drawn paths.
4. Use grouped `<g>` transforms for layered choreography.
5. Avoid complex `d` animation unless the visual payoff is high.
6. Disable animation under `prefers-reduced-motion`.

## Implementation Guidance

Prefer a minimal Cloudflare Worker-compatible SPA:

1. Vite + React or plain Vite if that is faster for the artifact.
2. TypeScript when using React.
3. Self-contained styling in the generated project; do not depend on Career-Ops CSS.
4. No backend or secrets unless explicitly needed.
5. No analytics by default.
6. Do not include phone number unless the user explicitly asks; email, LinkedIn, GitHub, and portfolio are fine if present in `config/profile.yml`.

Initialize with the current Cloudflare-supported project flow when available. If `create-cloudflare` is not practical non-interactively, create a Vite app and add Wrangler config for Workers static assets.

The generated project should include:

1. `package.json` with `dev`, `build`, `preview`, and `deploy` scripts.
2. Wrangler config with the preserved or generated worker name.
3. Source files for the SPA.
4. A short `APPLICATION-NOTES.md` with source context, target company, job URL/report, deployed URL after deploy, and commands run.

## Build, Verify, Deploy

Run:

1. Dependency install for the generated project.
2. Build command.
3. A visual sanity pass on desktop and mobile if browser tooling is available.
4. `wrangler deploy` from the generated project.

If Wrangler is not authenticated, stop after build and report the exact command the user needs to run. Do not fake a deployment URL.

After deploy, capture the real URL from Wrangler output. If Wrangler outputs multiple URLs, prefer the `workers.dev` URL unless the user configured a custom route.

## Report and Tracker Updates

If a matching report exists, append or update a `## Cover Site` section with:

1. Local path
2. Worker name
3. Deployed URL
4. Source job URL or report path
5. Date generated

Do not create a new tracker entry just because a cover site was generated. If the application is already tracked, updating notes/status is allowed only when the user asks or confirms the application state changed.

## Final Response

Return:

1. Deployed URL, or exact blocker if deployment could not complete.
2. Local project path.
3. Worker name.
4. Source context used: report/JD/job URL.
5. Verification performed: build, visual check, deploy.
6. Any manual next step, such as adding the URL to the application form.

Never submit the application for the user.
