# Product

## Register

product

## Users

Job seekers across industries, actively searching. They range from technical (engineers, data scientists) to non-technical (product managers, marketers, ops leads). Their shared context: they're in the middle of a search, juggling multiple leads, and need an agent that understands their strengths well enough to filter signal from noise.

They arrive with a CV and scattered preferences. They leave with a structured profile the agent can use to evaluate roles intelligently. The job to be done: teach an AI recruiter who I am in five minutes, then trust it to tell me which jobs are worth my time.

## Product Purpose

Career-ops is a personal job-search agent that learns who you are, understands what roles you want, and helps you decide which jobs are worth applying to.

The frontend wraps an existing CLI pipeline (offer evaluation, CV generation, portal scanning, application tracking) in a two-pane experience focused on onboarding. Left pane: what the agent knows about me. Right pane: agent chat. The core interaction is annotation-based personalization: select profile text, add a comment, and the agent proposes structured updates the user can accept, edit, or ignore.

Success looks like: a user opens the app, pastes their CV, highlights a few things that matter, and within five minutes has a profile good enough that pasting a job URL produces a genuinely useful evaluation.

## Brand Personality

Warm, approachable, smart.

The product should feel like a thoughtful colleague who remembers everything you told them. Not a corporate dashboard. Not a chatbot skin. A personal tool that earns trust through transparency: it shows what it knows, proposes what it learned, and waits for approval before changing anything.

## Anti-references

- **Corporate SaaS dashboards.** No Salesforce/HubSpot energy. No data-overload panels, no enterprise-gray chrome, no feature-flag-everything aesthetic. This is a personal tool, not a team platform.
- **Generic AI chat wrappers.** Not a ChatGPT skin with a sidebar. The profile panel and annotation flow are the differentiator. The chat is important but secondary to the structured context the agent builds.
- **Job board UIs.** Not LinkedIn, not Indeed. No card grids of listings, no ATS-form aesthetic. The product evaluates jobs, it doesn't list them.

## Design Principles

1. **Show, don't configure.** The agent learns from natural interaction, not forms and settings pages. No setup wizards. No preference checkboxes. The user talks, highlights, and comments; the agent structures.
2. **Trust through transparency.** The agent proposes, the user approves. No silent rewrites. Every change to the profile is visible, reviewable, and reversible. The UI makes the agent's reasoning legible.
3. **Context is the product.** The left-pane profile is the differentiator. The richer and more accurate it becomes, the better every downstream feature works. Design should make the profile feel alive and worth investing in.
4. **First five minutes are everything.** Onboarding should feel magical and trustworthy. If a user can paste a CV, highlight two things, and get a smart evaluation in five minutes, the product has proven itself.
5. **Personal, not powerful.** This is a tool for one person's job search, not a team workspace. Warmth over efficiency. Approachable over impressive. The interface should feel like it's working for you, not managing you.

## Accessibility & Inclusion

WCAG AA. 4.5:1 contrast for body text, 3:1 for large text. Keyboard navigation throughout. Screen reader support for the two-pane layout, annotation flow, and chat. Reduced-motion alternatives for any transitions.
