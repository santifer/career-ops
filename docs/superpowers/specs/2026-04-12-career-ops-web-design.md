# Career-Ops Web — Design Specification

**Date:** 2026-04-12
**Status:** Approved
**Scope:** Full-stack SaaS web application that brings career-ops terminal interactions to a browser-based interface.

---

## 1. Product Overview

Career-Ops Web is a cloud-hosted, multi-user SaaS that replaces the terminal-based career-ops experience with a browser application. It combines a data-rich dashboard for at-a-glance visibility with a full-page AI chat for complex tasks powered by Claude.

The system currently operates via Claude Code in the terminal, reading/writing local markdown and YAML files. This spec defines the transition to a cloud-hosted web app with PostgreSQL as the primary data store, the Anthropic API for AI features, and a tiered pricing model (free, pro, BYOK).

### Core Decisions

| Decision | Choice |
|----------|--------|
| UI model | Hybrid: dashboard + full-page AI chat with rich cards |
| Backend | Cloud-hosted monolithic Next.js, Anthropic API for AI |
| Data layer | PostgreSQL as primary, with markdown/file export |
| Users | Multi-user SaaS |
| Tech stack | Next.js + React + PostgreSQL + Tailwind + shadcn/ui |
| AI pricing | Free tier (limited) → Pro tier → BYOK for power users |
| Chat UX | Full-page chat with split view (conversation + report panel) |
| Onboarding | Wizard (structured data) → Chat (conversational "get to know you") |
| Auth | Magic link (passwordless email) |
| Navigation | Editorial top nav with ⌘K command bar |
| Tracker | Kanban board with drag-and-drop status changes |
| Home | Metrics + actions dashboard |

### Design Aesthetic

Clean, minimal, professional — inspired by modern CRM/inbox interfaces with a focus on density without clutter.

**Design Cheatsheet:**
- **Typography:** Inter font family. Letter spacing at -0.31px across the board.
- **Backgrounds:** Two surfaces — `#FFFFFF` (cards, panels) and `#FCFCFC` (page background).
- **Colors:** TailwindCSS Neutral palette. `neutral-500` for muted/secondary text, `neutral-800` for emphasized text. Accent colors from the existing scoring system (green for high scores, amber for medium, red for low).
- **Icons:** Heroicons (https://heroicons.com/) — outline style for nav, solid for emphasis.
- **Avatar illustrations:** @dariusdan style (https://tiny.supply/all) — warm, illustrated character avatars for the user and Claude.
- **Borders:** `neutral-200` (#e5e5e5), 1px solid. Rounded corners at 8-12px.
- **Spacing:** Generous but not wasteful. 16-24px padding on cards, 12-16px gaps.
- **Overall feel:** The app should feel like a premium productivity tool (Linear, Notion) — not flashy, not bland. Every pixel earns its place.

---

## 2. Database Schema

### 2.1 Users & Auth

**`users`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique, indexed |
| name | VARCHAR(255) | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**`magic_links`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| token_hash | VARCHAR(64) | SHA-256 of the raw token |
| expires_at | TIMESTAMP | 15 minutes from creation |
| used_at | TIMESTAMP | Nullable, set on verification |
| created_at | TIMESTAMP | |

**`subscriptions`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users, unique |
| plan | ENUM('free','pro','byok') | Default: free |
| api_key_encrypted | TEXT | AES-256 encrypted, BYOK only |
| ai_credits_used | INTEGER | Reset each billing period |
| ai_credits_limit | INTEGER | Derived from plan |
| billing_period_start | DATE | |
| stripe_customer_id | VARCHAR(255) | Nullable |
| stripe_subscription_id | VARCHAR(255) | Nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 2.2 Profile

**`profiles`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users, unique |
| full_name | VARCHAR(255) | |
| email | VARCHAR(255) | Contact email (may differ from auth email) |
| phone | VARCHAR(50) | |
| location | VARCHAR(255) | City, country |
| timezone | VARCHAR(50) | IANA timezone |
| linkedin | VARCHAR(500) | URL |
| portfolio_url | VARCHAR(500) | |
| github | VARCHAR(500) | |
| headline | TEXT | One-line professional headline |
| exit_story | TEXT | Why leaving / what seeking |
| superpowers | TEXT | Unique selling points |
| deal_breakers | TEXT | Non-negotiables |
| best_achievement | TEXT | Lead interview story |
| cv_markdown | TEXT | Full CV in markdown |
| article_digest | TEXT | Proof points from portfolio |
| preferred_language | VARCHAR(10) | Nullable, e.g., "en", "de", "fr", "ja" — controls AI response language |
| onboarding_completed | BOOLEAN | Default: false — tracks wizard completion |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**`target_roles`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| profile_id | UUID | FK → profiles |
| title | VARCHAR(255) | e.g., "Senior AI Engineer" |
| is_primary | BOOLEAN | |

**`archetypes`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| profile_id | UUID | FK → profiles |
| name | VARCHAR(255) | e.g., "AI Platform/LLMOps" |
| level | VARCHAR(50) | e.g., "Senior", "Staff" |
| fit | ENUM('primary','secondary','adjacent') | |
| framing_notes | TEXT | How to position for this archetype |

**`compensation_targets`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| profile_id | UUID | FK → profiles, unique |
| currency | VARCHAR(10) | e.g., "USD", "EUR" |
| target_min | INTEGER | |
| target_max | INTEGER | |
| minimum | INTEGER | Absolute floor |

### 2.3 Applications & Reports

**`applications`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users, indexed |
| number | INTEGER | Sequential per user, auto-incremented |
| date | DATE | |
| company | VARCHAR(255) | |
| role | VARCHAR(255) | |
| score | DECIMAL(2,1) | 1.0–5.0 |
| status | VARCHAR(50) | Canonical: Evaluated, Applied, Responded, Interview, Offer, Rejected, Discarded, SKIP |
| pdf_url | VARCHAR(500) | URL to stored PDF |
| notes | TEXT | |
| url | VARCHAR(1000) | Original job posting URL |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Unique constraint: (user_id, company, role) — prevents duplicate applications.

**`reports`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| application_id | UUID | FK → applications, unique |
| number | INTEGER | Sequential per user |
| company_slug | VARCHAR(255) | Slugified company name |
| date | DATE | |
| jd_text | TEXT | Full job description |
| jd_url | VARCHAR(1000) | Source URL |
| legitimacy_tier | VARCHAR(50) | High Confidence / Proceed with Caution / Suspicious |
| overall_score | DECIMAL(2,1) | |
| block_a | JSONB | Role summary |
| block_b | JSONB | CV match |
| block_c | JSONB | Seniority strategy |
| block_d | JSONB | Compensation research |
| block_e | JSONB | Personalization plan |
| block_f | JSONB | Interview prep |
| block_g | JSONB | Posting legitimacy |
| full_markdown | TEXT | Complete report as markdown (for export) |
| created_at | TIMESTAMP | |

### 2.4 Pipeline

**`pipeline_entries`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| url | VARCHAR(1000) | |
| company | VARCHAR(255) | Nullable, extracted or manual |
| role | VARCHAR(255) | Nullable |
| status | ENUM('pending','processing','completed','failed') | |
| source | ENUM('manual','scan') | |
| report_id | UUID | FK → reports, nullable |
| added_at | TIMESTAMP | |
| processed_at | TIMESTAMP | Nullable |

### 2.5 Portal Scanner

**`portal_configs`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users, unique |
| title_filters_positive | TEXT[] | Array of positive keywords |
| title_filters_negative | TEXT[] | Array of negative keywords |
| seniority_boost | TEXT[] | Keywords that boost ranking |

**`tracked_companies`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| portal_config_id | UUID | FK → portal_configs |
| name | VARCHAR(255) | |
| careers_url | VARCHAR(1000) | |
| api_url | VARCHAR(1000) | Nullable, Greenhouse/Ashby/Lever |
| scan_query | VARCHAR(500) | WebSearch fallback query |
| enabled | BOOLEAN | Default: true |

**`scan_history`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| company | VARCHAR(255) | |
| role_title | VARCHAR(255) | |
| url | VARCHAR(1000) | Indexed for dedup |
| scan_date | DATE | |
| is_active | BOOLEAN | |

### 2.6 Follow-ups

**`follow_ups`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| application_id | UUID | FK → applications |
| round_number | INTEGER | 1, 2, 3... |
| sent_at | TIMESTAMP | |
| channel | ENUM('email','linkedin') | |
| message_summary | TEXT | |
| next_due_at | TIMESTAMP | Calculated based on cadence rules |

### 2.7 Interview Prep

**`story_bank_entries`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| theme | VARCHAR(255) | |
| situation | TEXT | STAR+R |
| task | TEXT | |
| action | TEXT | |
| result | TEXT | |
| reflection | TEXT | |
| best_for_questions | TEXT[] | Question types this story fits |
| created_at | TIMESTAMP | |

**`interview_intel`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| application_id | UUID | FK → applications |
| company | VARCHAR(255) | |
| role | VARCHAR(255) | |
| process_overview | TEXT | |
| rounds | JSONB | Round-by-round breakdown |
| likely_questions | JSONB | Technical, behavioral, role-specific |
| story_mapping | JSONB | Stories mapped to likely questions |
| created_at | TIMESTAMP | |

### 2.8 Chat

**`conversations`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| title | VARCHAR(255) | Auto-generated or user-set |
| mode | VARCHAR(50) | evaluation, general, interview-prep, etc. |
| application_id | UUID | FK → applications, nullable (if tied to a specific app) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**`messages`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| conversation_id | UUID | FK → conversations |
| role | ENUM('user','assistant') | |
| content | TEXT | Raw text content |
| rich_card_type | VARCHAR(50) | Nullable: evaluation, pdf, contact, follow-up, etc. |
| rich_card_data | JSONB | Nullable: structured data for card rendering |
| created_at | TIMESTAMP | |

### 2.9 AI Usage

**`ai_usage_logs`**
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| user_id | UUID | FK → users |
| action_type | VARCHAR(50) | evaluation, pdf, chat, contact, interview-prep, scan |
| input_tokens | INTEGER | |
| output_tokens | INTEGER | |
| model | VARCHAR(50) | e.g., claude-sonnet-4-20250514 |
| cost_usd | DECIMAL(8,6) | Calculated at current rates |
| created_at | TIMESTAMP | Indexed for billing queries |

---

## 3. Application Architecture

### 3.1 Monolithic Next.js Structure

```
career-ops-web/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (fonts, theme, providers)
│   ├── page.tsx                  # Landing/marketing page
│   ├── (auth)/
│   │   ├── login/page.tsx        # Email input → magic link
│   │   └── verify/page.tsx       # Token verification
│   ├── (onboarding)/
│   │   ├── layout.tsx            # Onboarding wizard layout
│   │   ├── welcome/page.tsx      # Step 1: Name
│   │   ├── cv/page.tsx           # Step 2: Upload/paste CV
│   │   ├── roles/page.tsx        # Step 3: Target roles + comp
│   │   ├── portals/page.tsx      # Step 4: Portal setup
│   │   └── chat/page.tsx         # Step 5: Redirect to chat for "get to know you"
│   ├── (app)/                    # Authenticated app shell
│   │   ├── layout.tsx            # Top nav, ⌘K command bar
│   │   ├── home/page.tsx         # Overview dashboard
│   │   ├── applications/page.tsx # Kanban board
│   │   ├── pipeline/page.tsx     # URL inbox
│   │   ├── reports/
│   │   │   ├── page.tsx          # Report list
│   │   │   └── [id]/page.tsx     # Report reader
│   │   ├── chat/
│   │   │   ├── page.tsx          # New conversation
│   │   │   └── [id]/page.tsx     # Conversation with split view
│   │   ├── profile/page.tsx      # CV & profile editor
│   │   ├── scanner/page.tsx      # Portal config + run
│   │   ├── follow-ups/page.tsx   # Cadence tracker
│   │   ├── interview-prep/
│   │   │   ├── page.tsx          # Story bank
│   │   │   └── [id]/page.tsx     # Company intel report
│   │   ├── analytics/page.tsx    # Patterns & funnel
│   │   └── settings/page.tsx     # Account, billing, API key, export
│   └── api/                      # API routes (see Section 6 of design)
│       └── ...
├── lib/
│   ├── db/
│   │   ├── schema.ts             # Drizzle ORM schema definitions
│   │   ├── migrations/           # Database migrations
│   │   └── queries/              # Typed query helpers per table
│   ├── services/
│   │   ├── evaluation.ts         # A-G evaluation orchestration
│   │   ├── cv-generator.ts       # CV rewriting + PDF generation
│   │   ├── scanner.ts            # Portal API fetching + filtering
│   │   ├── contact-finder.ts     # LinkedIn contact search + message drafts
│   │   ├── interview-prep.ts     # Research + story mapping
│   │   ├── follow-up.ts          # Cadence calculation + draft generation
│   │   ├── pattern-analysis.ts   # Rejection pattern computation
│   │   ├── chat.ts               # Streaming conversation orchestration
│   │   └── export.ts             # DB → markdown file export
│   ├── prompts/
│   │   ├── shared.ts             # System prompt (scoring, archetypes, guidelines)
│   │   ├── evaluation.ts         # Full A-G evaluation prompt
│   │   ├── cv-generator.ts       # Keyword extraction + rewriting prompt
│   │   ├── contact-finder.ts     # Outreach message prompt
│   │   ├── interview-prep.ts     # Story mapping + question gen prompt
│   │   ├── follow-up.ts          # Follow-up drafting prompt
│   │   ├── deep-research.ts      # Company research prompt
│   │   ├── training-eval.ts      # Course evaluation prompt
│   │   ├── project-eval.ts       # Portfolio project evaluation prompt
│   │   └── chat.ts               # General chat with career context
│   ├── ai/
│   │   ├── client.ts             # Anthropic SDK client (handles BYOK)
│   │   ├── streaming.ts          # SSE streaming utilities
│   │   └── usage.ts              # Token counting + cost logging
│   ├── auth/
│   │   ├── magic-link.ts         # Token generation, verification
│   │   ├── session.ts            # JWT creation, validation, middleware
│   │   └── middleware.ts         # Next.js middleware for route protection
│   └── utils/
│       ├── slugify.ts
│       ├── scoring.ts            # Score color mapping, tier labels
│       └── export-markdown.ts    # Format DB records as markdown
├── components/
│   ├── ui/                       # shadcn/ui primitives
│   ├── layout/
│   │   ├── top-nav.tsx           # Editorial top navigation
│   │   ├── command-bar.tsx       # ⌘K command palette
│   │   └── user-menu.tsx         # Avatar, settings, logout
│   ├── home/
│   │   ├── stat-cards.tsx        # Metric cards row
│   │   ├── funnel-chart.tsx      # Application funnel
│   │   └── needs-attention.tsx   # Action items list
│   ├── applications/
│   │   ├── kanban-board.tsx      # Drag-and-drop board
│   │   ├── kanban-column.tsx     # Status column
│   │   └── application-card.tsx  # Individual card
│   ├── chat/
│   │   ├── conversation-list.tsx # Left sidebar conversations
│   │   ├── message-thread.tsx    # Message list with streaming
│   │   ├── message-input.tsx     # Text input with submit
│   │   ├── report-panel.tsx      # Right-side report reader
│   │   └── rich-cards/
│   │       ├── evaluation-card.tsx
│   │       ├── pdf-card.tsx
│   │       ├── contact-card.tsx
│   │       └── follow-up-card.tsx
│   ├── reports/
│   │   ├── report-list.tsx
│   │   ├── report-reader.tsx     # Full A-G block rendering
│   │   └── block-renderer.tsx    # Individual block component
│   ├── pipeline/
│   │   ├── url-list.tsx
│   │   └── add-url-form.tsx
│   ├── scanner/
│   │   ├── portal-config.tsx
│   │   ├── company-list.tsx
│   │   └── scan-progress.tsx
│   ├── profile/
│   │   ├── cv-editor.tsx         # Markdown editor with preview
│   │   ├── profile-form.tsx
│   │   └── archetype-manager.tsx
│   ├── follow-ups/
│   │   ├── cadence-list.tsx
│   │   └── draft-dialog.tsx
│   ├── interview-prep/
│   │   ├── story-bank.tsx
│   │   └── intel-report.tsx
│   ├── analytics/
│   │   ├── funnel-visualization.tsx
│   │   ├── archetype-breakdown.tsx
│   │   └── pattern-cards.tsx
│   └── onboarding/
│       ├── wizard-shell.tsx
│       ├── cv-upload.tsx
│       ├── role-selector.tsx
│       └── portal-picker.tsx
├── package.json
├── tailwind.config.ts
├── drizzle.config.ts
└── next.config.ts
```

### 3.2 Key Technology Choices

| Concern | Technology | Rationale |
|---------|-----------|-----------|
| Framework | Next.js 15 (App Router) | Full-stack React, server components, API routes |
| Database | PostgreSQL (Neon) | Serverless Postgres, scales to zero, branching for dev |
| ORM | Drizzle | Type-safe, lightweight, great migration story |
| UI components | shadcn/ui + Tailwind | Accessible, customizable, matches editorial aesthetic |
| AI | Anthropic SDK (@anthropic-ai/sdk) | Direct API access, streaming support |
| Auth | Custom magic link (no third-party) | Simple, passwordless, no vendor dependency |
| Email | Resend | Developer-friendly transactional email |
| Task queue | Inngest | Serverless background jobs, retries, cron |
| PDF generation | Puppeteer (serverless) | HTML→PDF, same approach as current generate-pdf.mjs |
| File storage | S3 (or R2/Supabase Storage) | PDF storage, CV uploads |
| Payments | Stripe | Subscriptions for Pro tier |
| Drag-and-drop | @dnd-kit | Kanban board drag-and-drop |
| Markdown | react-markdown + remark | CV editor preview, report rendering |
| Charts | Recharts | Funnel, analytics visualizations |
| Command bar | cmdk | ⌘K command palette |
| Deployment | Vercel | Native Next.js hosting, edge functions |

---

## 4. API Routes

```
app/api/
├── auth/
│   ├── magic-link/send/        POST — send magic link email
│   └── magic-link/verify/      POST — verify token, create session
├── users/
│   └── me/                     GET/PATCH — current user profile
├── applications/
│   ├── route                   GET (list, filterable) / POST (create)
│   ├── [id]/route              GET / PATCH / DELETE
│   └── [id]/reorder/           PATCH — kanban drag-drop status change
├── evaluations/
│   └── route                   POST — submit JD URL/text, triggers AI evaluation
├── reports/
│   ├── route                   GET (list, paginated)
│   ├── [id]/route              GET (full report with blocks)
│   └── [id]/export/            GET — download as markdown file
├── chat/
│   ├── conversations/route     GET (list) / POST (create)
│   ├── conversations/[id]/route GET (with messages)
│   └── conversations/[id]/messages/route  GET / POST (streaming SSE response)
├── pipeline/
│   ├── route                   GET (list) / POST (add URLs)
│   └── process/route           POST — trigger batch evaluation of pending entries
├── scanner/
│   ├── config/route            GET / PUT (portal configuration)
│   ├── run/route               POST — trigger background scan
│   └── history/route           GET (scan results history)
├── cv/
│   ├── route                   GET / PUT (cv markdown)
│   └── generate-pdf/route      POST — generate tailored PDF for a specific JD
├── contacts/
│   └── route                   POST — find contacts + draft outreach messages
├── interview-prep/
│   ├── stories/route           GET / POST (story bank CRUD)
│   └── [applicationId]/route   GET / POST (generate/read company intel)
├── follow-ups/
│   ├── route                   GET (urgency-sorted dashboard)
│   └── [id]/draft/route        POST — AI-draft follow-up message
├── analytics/
│   └── patterns/route          GET — computed rejection patterns + funnel
├── billing/
│   ├── usage/route             GET — AI credits consumed this period
│   └── subscription/route      GET / POST — manage plan
├── export/
│   └── route                   POST — export all data as markdown zip
└── webhooks/
    └── stripe/route            POST — Stripe subscription events
```

---

## 5. AI Integration

### 5.1 Prompt Templates

Each career-ops mode becomes a prompt template function in `lib/prompts/`. Templates receive user context and task input, return a structured prompt.

**Context injection pattern — every AI call receives:**
```
System prompt:
  [Shared rules: scoring system, archetypes, writing guidelines]
  [User's CV markdown]
  [User's profile: headline, superpowers, exit story, deal breakers]
  [User's archetypes and framing notes]
  [User's compensation targets]
  [Article digest / proof points, if exists]

User prompt:
  [Mode-specific instructions]
  [Task input: JD text, company name, URL, etc.]
```

This replaces Claude Code reading local files — context is pulled from the database and injected into the prompt at call time.

### 5.2 Prompt Templates Map

| Template file | Source mode | Trigger |
|--------------|------------|---------|
| `shared.ts` | `modes/_shared.md` + `modes/_profile.md` | Included in all calls |
| `evaluation.ts` | `modes/oferta.md` | Evaluation request |
| `cv-generator.ts` | `modes/pdf.md` | PDF generation |
| `contact-finder.ts` | `modes/contacto.md` | Contact search |
| `interview-prep.ts` | `modes/interview-prep.md` | Interview prep request |
| `follow-up.ts` | `modes/followup.md` | Follow-up draft |
| `deep-research.ts` | `modes/deep.md` | Deep company research |
| `training-eval.ts` | `modes/training.md` | Course evaluation |
| `project-eval.ts` | `modes/project.md` | Portfolio project evaluation |
| `chat.ts` | General | Free-form chat |

### 5.3 Streaming Architecture

Chat responses stream via Server-Sent Events (SSE):

```
1. User sends message → POST /api/chat/conversations/[id]/messages
2. Server loads user context from DB (CV, profile, archetypes, comp targets)
3. Detect intent from message content:
   - URL or "evaluate" → evaluation mode
   - "generate PDF" / "create CV" → pdf mode
   - "find contacts" / "outreach" → contact mode
   - "interview prep" / "prepare for" → interview-prep mode
   - "follow up" / "draft" → follow-up mode
   - Otherwise → general chat mode
4. Build prompt: shared system prompt + user context + mode template + user message
5. Call Anthropic API with streaming enabled
6. Stream response chunks to frontend via SSE
7. For evaluation/structured responses: use tool_use to get JSON blocks
8. Save complete message + rich_card_data to DB
9. If evaluation: also create/update application + report records
10. Log token usage to ai_usage_logs
```

### 5.4 Rich Card Rendering

Claude's structured responses (evaluations, contacts, follow-ups) use Anthropic tool_use to return JSON alongside natural language. The frontend detects `rich_card_type` on messages and renders the appropriate component:

| rich_card_type | Component | Data shape |
|---------------|-----------|-----------|
| `evaluation` | `EvaluationCard` | `{ score, company, role, archetype, legitimacy, blocks: { a, b, c, d, e, f, g } }` |
| `pdf` | `PdfCard` | `{ url, company, role, keywords_injected, format }` |
| `contact` | `ContactCard` | `{ contacts: [{ name, title, linkedin_url, message }] }` |
| `follow-up` | `FollowUpCard` | `{ company, round, channel, message, next_due }` |
| `interview-intel` | `InterviewIntelCard` | `{ company, rounds, likely_questions, story_mapping }` |
| `comparison` | `ComparisonCard` | `{ offers: [{ company, role, score, dimensions }] }` |

### 5.5 Usage Metering & Tier Limits

Every API call logs usage and checks against plan limits before executing:

```
Pre-check: user's ai_credits_used < ai_credits_limit
  → If exceeded: return 429 with upgrade prompt
  → If BYOK: skip check, use user's API key

Post-call: log input_tokens, output_tokens, model, calculated cost
```

| Plan | Evaluations/mo | PDF generations/mo | Chat messages/mo | Scanner runs/mo | Price |
|------|---------------|-------------------|-----------------|----------------|-------|
| Free | 5 | 3 | 20 | 2 | $0 |
| Pro | 50 | 30 | 200 | 10 | $29/mo |
| BYOK | Unlimited | Unlimited | Unlimited | Unlimited | $9/mo (platform fee) |

---

## 6. Authentication & Sessions

### 6.1 Magic Link Flow

```
1. User enters email on /login
2. POST /api/auth/magic-link/send
   → Generate 32-byte random token
   → Store SHA-256 hash in magic_links table (expires in 15 min)
   → Send email via Resend with link: https://app.career-ops.com/auth/verify?token=xxx
3. User clicks link → /auth/verify page
4. POST /api/auth/magic-link/verify { token }
   → Hash token, find matching unexpired/unused magic_link
   → Mark as used (set used_at)
   → Find or create user by email
   → Create JWT session token (30-day expiry)
   → Set as httpOnly secure cookie
   → Redirect to /home (existing user) or /onboarding/welcome (new user)
```

### 6.2 Security Rules

- Tokens expire after 15 minutes
- Single-use: consumed on verification
- Rate limit: 3 magic links per email per hour
- New link invalidates all previous unused links for same email
- JWT in httpOnly, secure, sameSite=strict cookie (not localStorage)
- 30-day session expiry, refreshed on activity
- BYOK API keys: AES-256 encrypted at rest, decrypted only in-memory during API calls
- CSRF protection via Next.js built-in mechanisms
- All API routes behind auth middleware except /api/auth/*

---

## 7. Onboarding Flow

### 7.1 Wizard Phase (structured data collection)

**Step 1 — Welcome** `/onboarding/welcome`
- Editorial welcome screen with Career-Ops branding
- Name input field (pre-filled from email local-part if possible)
- "Get Started" button

**Step 2 — Your CV** `/onboarding/cv`
- Three input methods:
  1. Paste text → parsed to markdown
  2. Upload PDF → server-side PDF parsing to extract text → converted to markdown
  3. LinkedIn URL → scrape public profile data (best-effort)
- Markdown preview shown alongside input
- "I'll do this later" skip option

**Step 3 — Target Roles** `/onboarding/roles`
- Multi-input for role titles (tags-style input)
- Salary range: currency selector + min/max sliders
- Location: country/city + remote preference (Remote / Hybrid / On-site / Flexible)
- Timezone selector

**Step 4 — Portal Setup** `/onboarding/portals`
- Pre-loaded list of 45+ companies from default portal config
- Searchable, with toggle switches
- Search keywords auto-populated from Step 3 target roles
- "Select all" / "Deselect all" options

### 7.2 Chat Phase (conversational depth)

After wizard completion, redirect to `/chat/new` with a system-initiated message:

> "The basics are set up! Now I'd like to understand what makes you unique as a candidate.
>
> Tell me about:
> - Your superpower — the thing you do better than most candidates
> - What kind of work excites you? What drains you?
> - Any deal-breakers I should know about?
> - Your best professional achievement — the one you'd lead with in an interview
>
> The more context you give me, the better I'll filter and tailor everything for you."

Claude processes responses and updates the database:
- Superpowers → `profiles.superpowers`
- Deal-breakers → `profiles.deal_breakers`
- Best achievement → `profiles.best_achievement`
- Archetype framing → `archetypes.framing_notes`

### 7.3 Completion

After the conversational phase, Claude suggests first actions:

> "You're all set! Here's what you can do:
> - Paste a job URL here to evaluate it
> - Go to Scanner to find new matching offers
> - Check your Home dashboard for an overview
>
> Tip: Having a personal portfolio dramatically improves your job search."

---

## 8. Page Designs

### 8.1 Navigation

Editorial top navigation bar (light background, serif logo, horizontal links):

```
[Career-Ops]  Home  Applications  Pipeline  Reports  Chat  [More ▾]  [⌘K]  [Avatar]
```

"More" dropdown contains: Scanner, Follow-ups, Interview Prep, Analytics, Settings.

**⌘K Command Bar** (powered by cmdk):
- Search across all entities: applications, reports, companies, conversations
- Quick actions: "Evaluate [URL]", "Generate PDF for [company]", "Scan portals"
- Navigation: jump to any page
- Fuzzy matching on company names, role titles, report numbers

### 8.2 Home Page

Greeting + date at top. Four stat cards in a row:
1. Total Applications (with weekly delta)
2. Active Interviews (count)
3. Average Score (with weekly trend)
4. Pipeline (pending count with new-today count)

Below, two-column layout:
- **Left: Funnel** — Horizontal bar chart showing Evaluated → Applied → Interview → Offer counts
- **Right: Needs Attention** — Priority-sorted action items with color-coded dots:
  - Red: overdue follow-ups
  - Yellow: pipeline items ready, expiring offers
  - Blue: new scanner matches

All elements are clickable — stats link to filtered views, action items link to relevant pages.

### 8.3 Applications (Kanban)

Kanban board with columns for each canonical status:
- **Evaluated** — Newly evaluated, pending decision
- **Applied** — Application submitted
- **Responded** — Company responded
- **Interview** — In interview process
- **Offer** — Offer received
- **Rejected** — Rejected by company
- **Discarded** — Discarded by user
- **SKIP** — Not applying

Each card shows: company name, role title, score (color-coded), and urgency indicators (follow-up due, offer expiring). Drag-and-drop between columns updates status.

Clicking a card opens the report in a slide-over panel.

### 8.4 Pipeline

List of pending URLs with status badges (pending, processing, completed, failed). "Add URL" form at the top. "Evaluate All" button triggers batch processing. Progress indicators during processing.

### 8.5 Reports

Two-column layout matching the report reader from the chat:
- Left: searchable/filterable report list (company, score, date)
- Right: full report reader with all A-G blocks rendered as sections

### 8.6 Chat

Split view:
- **Left (40% width):** Conversation thread. User messages right-aligned in light blue bubbles, Claude messages left-aligned with avatar. Streaming text appears with typing indicator. Rich cards render inline but are summarized (score, company, key action).
- **Right (60% width):** Report/detail panel. When Claude produces a report, it opens here in full. PDF previews, contact lists, interview intel all render in this panel. Panel is collapsible when not needed.

Conversation list accessible via a sidebar toggle.

### 8.7 CV & Profile

Tabbed interface:
- **CV tab:** Split-pane markdown editor (left: edit, right: preview)
- **Profile tab:** Form fields for all profile data
- **Roles tab:** Target roles manager with archetype configuration
- **Compensation tab:** Salary range, currency, minimum

### 8.8 Scanner

Portal configuration table (company name, careers URL, API URL, enabled toggle). Title filter keywords as editable tag inputs. "Run Scan" button with progress bar. Results appear as a list of new matches with "Add to Pipeline" action.

### 8.9 Follow-ups

Urgency-sorted list:
- **URGENT (red):** Due within 24 hours
- **OVERDUE (orange):** Past due
- **WAITING (gray):** On track, showing days until next due
- **COLD (muted):** 2+ weeks with no response

Each item shows company, role, last contact date, next due date, round number. "Draft Follow-up" button triggers AI to generate a message in a dialog.

### 8.10 Interview Prep

Two sections:
- **Story Bank:** Table of STAR+R stories with theme, situation summary, and "best for" tags. Add/edit/delete stories.
- **Company Intel:** List of generated intel reports. Click to read. "Generate Intel" button triggers AI research for a specific application.

### 8.11 Analytics

Three visualization sections:
- **Funnel:** Visual funnel from Evaluated → Applied → Interview → Offer with conversion rates
- **Archetype Breakdown:** Pie/bar chart of applications by archetype, with average scores per archetype
- **Pattern Cards:** AI-generated insight cards (from pattern analysis) showing what's working, what's wasting time, tech stack gaps, and recommendations

### 8.12 Settings

Sections:
- **Account:** Email, name, delete account
- **Subscription:** Current plan, usage bar, upgrade/downgrade
- **API Key (BYOK):** Encrypted key input, test connection button
- **Export:** Download all data as markdown ZIP (reports, CV, profile, tracker)
- **Notifications:** Email preferences for follow-up reminders, scanner results

---

## 9. Background Jobs

Powered by Inngest for serverless background execution:

| Job | Trigger | What it does |
|-----|---------|-------------|
| `scanner/run` | User clicks "Run Scan" or scheduled cron | Fetch portal APIs, filter titles, dedup against history, add matches to pipeline |
| `evaluation/process` | User submits JD URL in chat or pipeline | Extract JD text, run A-G evaluation via Anthropic API, create report, update application |
| `pipeline/batch` | User clicks "Evaluate All" on pipeline | Queue individual evaluation jobs for each pending entry |
| `pdf/generate` | User requests PDF in chat | Rewrite CV with JD keywords, render HTML, generate PDF via Puppeteer, upload to S3 |
| `follow-up/check` | Daily cron (8am user timezone) | Check overdue follow-ups, send email notification |
| `scanner/scheduled` | Configurable cron (e.g., every 3 days) | Automatic portal scan, notify user of new matches |

Job progress is communicated to the frontend via polling (GET endpoint returns job status) or WebSocket for real-time updates.

---

## 10. Data Migration & Export

### 10.1 Import (for existing career-ops users)

An import wizard in Settings allows existing career-ops users to bring their data:

1. Upload a ZIP containing their career-ops directory (or connect a GitHub repo)
2. Parser reads:
   - `cv.md` → `profiles.cv_markdown`
   - `config/profile.yml` → `profiles.*`, `target_roles`, `archetypes`, `compensation_targets`
   - `data/applications.md` → `applications` rows
   - `reports/*.md` → `reports` rows (parse blocks A-G into JSONB)
   - `data/pipeline.md` → `pipeline_entries`
   - `portals.yml` → `portal_configs` + `tracked_companies`
   - `data/scan-history.tsv` → `scan_history`
   - `interview-prep/story-bank.md` → `story_bank_entries`
   - `article-digest.md` → `profiles.article_digest`
3. Preview of parsed data before confirming import
4. Deduplication against existing database records

### 10.2 Export (database → files)

The export endpoint generates a ZIP file containing:
- `cv.md` — from `profiles.cv_markdown`
- `profile.yml` — from profiles, target_roles, archetypes, compensation_targets
- `applications.md` — formatted markdown table from applications
- `reports/` — each report as a numbered markdown file
- `pipeline.md` — from pipeline_entries
- Generated PDFs — from S3 storage

This ensures data portability and no vendor lock-in.

---

## 11. Deployment Architecture

```
                    ┌─────────────┐
                    │   Vercel     │
                    │  (Next.js)   │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───┐ ┌─────▼─────┐
       │  Neon        │ │ S3/R2│ │  Inngest   │
       │ (PostgreSQL) │ │(PDFs)│ │  (Jobs)    │
       └─────────────┘ └──────┘ └─────┬─────┘
                                       │
                                ┌──────▼──────┐
                                │  Anthropic   │
                                │    API       │
                                └─────────────┘
```

| Service | Provider | Purpose |
|---------|----------|---------|
| Frontend + API | Vercel | Next.js hosting, edge middleware, serverless functions |
| Database | Neon | Serverless PostgreSQL, auto-scaling, branch per PR |
| File storage | Cloudflare R2 (or S3) | PDF storage, CV uploads |
| Background jobs | Inngest | Scanner, batch eval, PDF gen, cron jobs |
| AI | Anthropic API | All Claude interactions |
| Email | Resend | Magic links, follow-up notifications |
| Payments | Stripe | Pro tier subscriptions |
| DNS/CDN | Cloudflare (or Vercel) | Domain, SSL, caching |

---

## 12. Ethical Guardrails

Preserving the original career-ops philosophy in the SaaS context:

1. **Quality over quantity.** The system warns users when applying to low-scoring roles (< 3.5/5). The UI shows a confirmation dialog: "This role scored 3.2/5. Are you sure you want to proceed?"

2. **No auto-submit.** The "Apply" flow drafts form answers and generates PDFs, but never submits applications automatically. A clear "Review Before Applying" step ensures the user makes the final call.

3. **Transparency on AI costs.** The settings page shows real-time usage: "You've used 12 of 50 evaluations this month." No surprise charges.

4. **Data ownership.** Users can export all their data at any time as markdown files. Account deletion removes all data within 30 days.

5. **No metric fabrication.** Evaluation prompts explicitly instruct Claude to never invent experience, metrics, or skills that don't exist in the user's CV.

---

## 13. Internationalization

The current system supports 7 languages (EN, ES, DE, FR, JA, RU, PT) via localized mode files. In the SaaS:

- **UI language:** English for v1. i18n framework (next-intl) set up from day one for future translations.
- **AI language:** Claude auto-detects JD language and responds accordingly. Prompt templates support language-specific variants (the localized mode files become language-specific prompt template variants).
- **User preference:** `profiles` table gets a `preferred_language` column. When set, AI responses and notifications use that language.

---

## 14. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| XSS | React's built-in escaping, CSP headers, httpOnly cookies |
| CSRF | SameSite=strict cookies, Next.js CSRF protection |
| SQL injection | Drizzle ORM parameterized queries |
| API key exposure | BYOK keys AES-256 encrypted at rest, never logged, never sent to frontend |
| Rate limiting | Per-user rate limits on API routes (Vercel edge middleware) |
| Data isolation | All queries scoped by user_id, enforced at ORM query layer |
| JD URL fetching | Server-side fetch only, no SSRF (allowlist of known job board domains + generic fetch with timeout) |

---

## 15. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first evaluation | < 5 minutes from signup |
| Evaluation quality | Parity with CLI career-ops (same scoring accuracy) |
| Chat response time (first token) | < 2 seconds |
| Dashboard load time | < 1.5 seconds |
| Monthly active users (6 months) | 500+ |
| Free → Pro conversion | 5-10% |
| Data export completeness | 100% fidelity with CLI format |
