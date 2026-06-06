<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: career-ops
description: Personal job-search agent that learns who you are and helps you decide which jobs are worth applying to.
---

# Design System: career-ops

## 1. Overview

**Creative North Star: "The Well-Lit Desk"**

A personal workspace where everything is where you expect it. Not a corporate command center, not a chatbot skin. The interface feels like a well-organized notebook on a clean desk with morning light: warm, considered, ready to work. The two-pane layout is the desk itself: your profile on the left (what you know about yourself), the agent on the right (what the agent is learning).

The system earns trust through transparency and restraint. Every interaction shows its reasoning. Every update waits for approval. The UI disappears into the task of teaching an agent who you are. It is warm without being precious, smart without being showy, approachable without being casual.

This system explicitly rejects corporate SaaS dashboard energy (no Salesforce/HubSpot data-overload chrome), generic AI chat wrapper aesthetics (not a ChatGPT skin with a sidebar), and job board UIs (no card grids of listings, no ATS-form aesthetic).

**Key Characteristics:**
- **Transparent.** The agent's knowledge is always visible, reviewable, and editable. No hidden state.
- **Restrained.** Color is used for meaning (actions, status, selection), not decoration. Neutrals carry the architecture.
- **Personal.** The interface serves one person's search. It is warm and intimate, not enterprise-scale.
- **Responsive.** Interactions give immediate feedback. Panels transition smoothly. Chat messages arrive with presence, not fanfare.

## 2. Colors

The palette follows a restrained strategy: tinted neutrals carry the architecture, with a single violet accent used sparingly for primary actions, selection, and status.

### Primary
- **Considered Violet** [to be resolved during implementation]: Anchored at the 270 hue family. A deep, unsaturated violet that reads as thoughtful rather than playful or corporate. Used for primary buttons, active selection indicators, and the profile readiness meter. Never decorative.

### Neutral
- **Background** [to be resolved during implementation]: Pure white. The content and the profile panel are the focus, not the surface. Warmth comes from the type and the violet accent, not from a tinted background.
- **Surface** [to be resolved during implementation]: Background pulled slightly toward ink. Used for the profile panel background, card surfaces, and the annotation popover.
- **Ink** [to be resolved during implementation]: Near-black with the faintest violet lean. Body text, headings, profile content. Must reach 7:1 contrast against background.
- **Muted** [to be resolved during implementation]: Ink pulled 40% toward background. Secondary text, timestamps, metadata, placeholder copy. Must reach 3.5:1 contrast against background.

### Named Rules
**The Restraint Rule.** The violet accent appears on no more than 10% of any given screen. Its scarcity signals importance: if the accent is everywhere, nothing is important.

**The No-Tint Rule.** The background surface is pure white, not cream, not sand, not warm-neutral. The brand's warmth lives in the type, the accent, and the interaction design, not in the surface color.

## 3. Typography

**Body Font:** [warm sans-serif to be chosen at implementation] (humanist or geometric-humanist axis; DM Sans, Plus Jakarta Sans, or similar)

**Character:** A single warm sans-serif varied by weight. The typeface should feel approachable at body sizes and quietly confident at display sizes. No display/body split: one family carries everything from section headers to button labels to chat messages. Weight contrast (400 vs. 600 vs. 700) creates hierarchy, not font switching.

### Hierarchy
- **Display** (700, [size to be resolved], 1.1): Profile panel section headers, onboarding welcome.
- **Title** (600, [size to be resolved], 1.25): Agent-proposed update cards, annotation popovers.
- **Body** (400, [size to be resolved], 1.6): Profile content, chat messages, descriptions. Max line length 65-75ch.
- **Label** (500, [size to be resolved], 1.4): Button text, status indicators, metadata, timestamps.

### Named Rules
**The One Family Rule.** One sans-serif, four weights. No display font, no serif accent, no monospace for "technical feel." Weight and size do the work.

## 4. Elevation

Flat by default. Surfaces are distinguished by background tint (surface vs. background), not by shadow. Shadows appear only as a response to state: the annotation popover lifts on open, proposed-update cards lift on hover, the chat input lifts on focus. At rest, everything is flat.

### Named Rules
**The Flat-By-Default Rule.** If a surface is at rest, it has no shadow. Elevation is earned through interaction, not decoration. If you're reaching for a shadow, ask whether a border or background tint does the same job.

## 5. Components

[To be resolved during implementation. No components exist yet.]

## 6. Do's and Don'ts

### Do:
- **Do** use the violet accent exclusively for primary actions (accept, send, submit) and active selection state. Everything else is neutral.
- **Do** show the agent's reasoning inline. Proposed updates display the selected text, the user's comment, and the structured change side by side. Transparency is the product.
- **Do** use weight contrast (400 vs. 600 vs. 700) for hierarchy within a single type family. No font switching between sections.
- **Do** provide immediate visual feedback for every interaction: button press, text selection, comment submission, profile update acceptance. Motion is responsive, not choreographed.
- **Do** keep the profile panel scannable. Dense information is fine; unclear information is not. Every section should be readable at a glance.

### Don't:
- **Don't** build a corporate SaaS dashboard. No data-overload panels, no enterprise-gray chrome, no feature-flag-everything aesthetic. This is a personal tool, not a team platform.
- **Don't** build a generic AI chat wrapper. The profile panel and annotation flow are the differentiator. The chat is important but it is not the whole product. If the right pane looks like it could be any chatbot, the design has failed.
- **Don't** build a job board. No card grids of listings, no ATS-form aesthetic. The product evaluates jobs, it doesn't list them.
- **Don't** use gradient text, side-stripe borders, glassmorphism, hero-metric templates, or numbered section markers. None of these serve a task-oriented product UI.
- **Don't** use cream, sand, beige, or any warm-neutral tinted background. The warmth comes from the type and the violet, not from the surface.
- **Don't** add orchestrated page-load sequences or entrance choreography. The user is in a task. Load into a ready state.
- **Don't** reinvent standard affordances. Use familiar form controls, standard modals (sparingly), and recognizable icons. Delight lives in the annotation flow and the trust loop, not in custom scrollbars.
