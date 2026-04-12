# Career-Ops Web — Phase 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a deployable Next.js app with the complete database schema, magic-link auth, the editorial layout shell with top nav and ⌘K command bar, and a working home dashboard page — the foundation every subsequent phase builds on.

**Architecture:** Monolithic Next.js 15 (App Router) with Drizzle ORM over Neon PostgreSQL. Custom magic-link auth with JWT sessions in httpOnly cookies. Design system built on Inter font, TailwindCSS Neutral palette, shadcn/ui components, and Heroicons.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Drizzle ORM, Neon PostgreSQL, Resend (email), jose (JWT), cmdk (command bar), @heroicons/react

**Design Cheatsheet (apply everywhere):**
- Typography: Inter, letter-spacing -0.31px
- Backgrounds: `#FFFFFF` (cards) and `#FCFCFC` (page bg)
- Colors: TailwindCSS Neutral. `neutral-500` muted, `neutral-800` emphasis
- Icons: Heroicons — outline for nav, solid for emphasis
- Borders: `neutral-200`, 1px solid, rounded 8-12px
- Spacing: 16-24px card padding, 12-16px gaps

---

## File Structure

```
career-ops-web/
├── app/
│   ├── layout.tsx                    # Root layout: Inter font, providers
│   ├── page.tsx                      # Landing page (public)
│   ├── globals.css                   # Tailwind directives + custom vars
│   ├── (auth)/
│   │   ├── login/page.tsx            # Email input form
│   │   └── verify/page.tsx           # Magic link verification
│   ├── (app)/
│   │   ├── layout.tsx                # Authenticated shell: top nav + command bar
│   │   └── home/page.tsx             # Dashboard with stats, funnel, attention
│   └── api/
│       ├── auth/
│       │   ├── magic-link/send/route.ts
│       │   └── magic-link/verify/route.ts
│       ├── users/me/route.ts
│       └── applications/stats/route.ts
├── lib/
│   ├── db/
│   │   ├── index.ts                  # Drizzle client + connection
│   │   ├── schema.ts                 # All table definitions
│   │   └── migrate.ts               # Migration runner script
│   ├── auth/
│   │   ├── magic-link.ts             # Token gen, send, verify
│   │   ├── session.ts                # JWT create/validate
│   │   └── middleware.ts             # Auth check for routes
│   └── utils/
│       └── scoring.ts                # Score → color/label helpers
├── components/
│   ├── ui/                           # shadcn/ui (button, input, card, badge, etc.)
│   ├── layout/
│   │   ├── top-nav.tsx
│   │   ├── command-bar.tsx
│   │   └── user-menu.tsx
│   └── home/
│       ├── stat-cards.tsx
│       ├── funnel-chart.tsx
│       └── needs-attention.tsx
├── middleware.ts                     # Next.js edge middleware (auth redirect)
├── package.json
├── tailwind.config.ts
├── drizzle.config.ts
├── tsconfig.json
├── .env.local.example
└── next.config.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `career-ops-web/package.json`
- Create: `career-ops-web/tsconfig.json`
- Create: `career-ops-web/next.config.ts`
- Create: `career-ops-web/tailwind.config.ts`
- Create: `career-ops-web/.env.local.example`
- Create: `career-ops-web/.gitignore`

- [ ] **Step 1: Create the project directory and initialize**

```bash
mkdir -p career-ops-web && cd career-ops-web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias="@/*" --turbopack --yes
```

- [ ] **Step 2: Install all Phase 1 dependencies**

```bash
cd career-ops-web
npm install drizzle-orm @neondatabase/serverless jose resend cmdk @heroicons/react/24/outline @heroicons/react/24/solid react-markdown class-variance-authority clsx tailwind-merge lucide-react
npm install -D drizzle-kit @types/node dotenv
```

- [ ] **Step 3: Create `.env.local.example`**

```bash
cat > .env.local.example << 'ENVEOF'
# Database (Neon)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# Auth
JWT_SECRET=your-256-bit-secret-here
MAGIC_LINK_BASE_URL=http://localhost:3000

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@career-ops.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
ENVEOF
```

- [ ] **Step 4: Create `drizzle.config.ts`**

Write file `career-ops-web/drizzle.config.ts`:

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Update `next.config.ts`**

Write file `career-ops-web/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 6: Verify the dev server starts**

```bash
cd career-ops-web && npm run dev
```

Expected: Server starts on http://localhost:3000 with the default Next.js page.

- [ ] **Step 7: Commit**

```bash
cd career-ops-web
git add -A
git commit -m "feat: scaffold Next.js project with all Phase 1 dependencies"
```

---

### Task 2: Design System — Tailwind + Global Styles

**Files:**
- Modify: `career-ops-web/app/globals.css`
- Modify: `career-ops-web/tailwind.config.ts`
- Modify: `career-ops-web/app/layout.tsx`

- [ ] **Step 1: Configure Tailwind with Inter font and design tokens**

Write file `career-ops-web/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tight: "-0.31px",
      },
      colors: {
        surface: {
          DEFAULT: "#FFFFFF",
          secondary: "#FCFCFC",
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Write global styles**

Write file `career-ops-web/app/globals.css`:

```css
@import "tailwindcss";

@layer base {
  * {
    letter-spacing: -0.31px;
  }

  body {
    @apply bg-[#FCFCFC] text-neutral-800 antialiased;
  }
}

@layer utilities {
  .text-muted {
    @apply text-neutral-500;
  }

  .text-emphasis {
    @apply text-neutral-800;
  }

  .card-surface {
    @apply bg-white border border-neutral-200 rounded-xl;
  }
}
```

- [ ] **Step 3: Set up root layout with Inter font**

Write file `career-ops-web/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Career-Ops",
  description: "AI-powered job search pipeline",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify font loads correctly**

```bash
cd career-ops-web && npm run dev
```

Open http://localhost:3000 — verify Inter font is rendering (check DevTools → Computed → font-family).

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add app/globals.css tailwind.config.ts app/layout.tsx
git commit -m "feat: design system with Inter font, neutral palette, custom surfaces"
```

---

### Task 3: shadcn/ui Setup and Base Components

**Files:**
- Create: `career-ops-web/components/ui/button.tsx`
- Create: `career-ops-web/components/ui/input.tsx`
- Create: `career-ops-web/components/ui/card.tsx`
- Create: `career-ops-web/components/ui/badge.tsx`
- Create: `career-ops-web/components/ui/dialog.tsx`
- Create: `career-ops-web/components/ui/dropdown-menu.tsx`
- Create: `career-ops-web/lib/utils.ts`

- [ ] **Step 1: Initialize shadcn/ui**

```bash
cd career-ops-web
npx shadcn@latest init -d
```

When prompted, select: New York style, Neutral color, CSS variables: yes.

- [ ] **Step 2: Install required shadcn components**

```bash
cd career-ops-web
npx shadcn@latest add button input card badge dialog dropdown-menu separator avatar tooltip
```

- [ ] **Step 3: Verify the `lib/utils.ts` helper exists**

Read file `career-ops-web/lib/utils.ts` — it should contain:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

If it doesn't exist or is different, create it with that content.

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add -A
git commit -m "feat: add shadcn/ui base components (button, input, card, badge, dialog, dropdown)"
```

---

### Task 4: Database Schema

**Files:**
- Create: `career-ops-web/lib/db/schema.ts`
- Create: `career-ops-web/lib/db/index.ts`

- [ ] **Step 1: Create the Drizzle schema with all tables**

Write file `career-ops-web/lib/db/schema.ts`:

```typescript
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
  date,
  jsonb,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──────────────────────────────────────────────

export const planEnum = pgEnum("plan", ["free", "pro", "byok"]);
export const fitEnum = pgEnum("fit", ["primary", "secondary", "adjacent"]);
export const pipelineStatusEnum = pgEnum("pipeline_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const pipelineSourceEnum = pgEnum("pipeline_source", [
  "manual",
  "scan",
]);
export const followUpChannelEnum = pgEnum("follow_up_channel", [
  "email",
  "linkedin",
]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

// ── Users & Auth ───────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  plan: planEnum("plan").default("free").notNull(),
  apiKeyEncrypted: text("api_key_encrypted"),
  aiCreditsUsed: integer("ai_credits_used").default(0).notNull(),
  aiCreditsLimit: integer("ai_credits_limit").default(20).notNull(),
  billingPeriodStart: date("billing_period_start"),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ── Profile ────────────────────────────────────────────

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  fullName: varchar("full_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  location: varchar("location", { length: 255 }),
  timezone: varchar("timezone", { length: 50 }),
  linkedin: varchar("linkedin", { length: 500 }),
  portfolioUrl: varchar("portfolio_url", { length: 500 }),
  github: varchar("github", { length: 500 }),
  headline: text("headline"),
  exitStory: text("exit_story"),
  superpowers: text("superpowers"),
  dealBreakers: text("deal_breakers"),
  bestAchievement: text("best_achievement"),
  cvMarkdown: text("cv_markdown"),
  articleDigest: text("article_digest"),
  preferredLanguage: varchar("preferred_language", { length: 10 }),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const targetRoles = pgTable("target_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  isPrimary: boolean("is_primary").default(false).notNull(),
});

export const archetypes = pgTable("archetypes", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  level: varchar("level", { length: 50 }),
  fit: fitEnum("fit").default("primary").notNull(),
  framingNotes: text("framing_notes"),
});

export const compensationTargets = pgTable("compensation_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  profileId: uuid("profile_id")
    .references(() => profiles.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  currency: varchar("currency", { length: 10 }).default("USD").notNull(),
  targetMin: integer("target_min"),
  targetMax: integer("target_max"),
  minimum: integer("minimum"),
});

// ── Applications & Reports ─────────────────────────────

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    number: integer("number").notNull(),
    date: date("date").notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    role: varchar("role", { length: 255 }).notNull(),
    score: decimal("score", { precision: 2, scale: 1 }),
    status: varchar("status", { length: 50 }).default("Evaluated").notNull(),
    pdfUrl: varchar("pdf_url", { length: 500 }),
    notes: text("notes"),
    url: varchar("url", { length: 1000 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("app_user_company_role_idx").on(
      table.userId,
      table.company,
      table.role,
    ),
    index("app_user_id_idx").on(table.userId),
  ],
);

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  applicationId: uuid("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .unique(),
  number: integer("number").notNull(),
  companySlug: varchar("company_slug", { length: 255 }).notNull(),
  date: date("date").notNull(),
  jdText: text("jd_text"),
  jdUrl: varchar("jd_url", { length: 1000 }),
  legitimacyTier: varchar("legitimacy_tier", { length: 50 }),
  overallScore: decimal("overall_score", { precision: 2, scale: 1 }),
  blockA: jsonb("block_a"),
  blockB: jsonb("block_b"),
  blockC: jsonb("block_c"),
  blockD: jsonb("block_d"),
  blockE: jsonb("block_e"),
  blockF: jsonb("block_f"),
  blockG: jsonb("block_g"),
  fullMarkdown: text("full_markdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Pipeline ───────────────────────────────────────────

export const pipelineEntries = pgTable("pipeline_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  url: varchar("url", { length: 1000 }).notNull(),
  company: varchar("company", { length: 255 }),
  role: varchar("role", { length: 255 }),
  status: pipelineStatusEnum("status").default("pending").notNull(),
  source: pipelineSourceEnum("source").default("manual").notNull(),
  reportId: uuid("report_id").references(() => reports.id),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

// ── Portal Scanner ─────────────────────────────────────

export const portalConfigs = pgTable("portal_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  titleFiltersPositive: text("title_filters_positive")
    .array()
    .default([])
    .notNull(),
  titleFiltersNegative: text("title_filters_negative")
    .array()
    .default([])
    .notNull(),
  seniorityBoost: text("seniority_boost").array().default([]).notNull(),
});

export const trackedCompanies = pgTable("tracked_companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  portalConfigId: uuid("portal_config_id")
    .references(() => portalConfigs.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  careersUrl: varchar("careers_url", { length: 1000 }),
  apiUrl: varchar("api_url", { length: 1000 }),
  scanQuery: varchar("scan_query", { length: 500 }),
  enabled: boolean("enabled").default(true).notNull(),
});

export const scanHistory = pgTable(
  "scan_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    company: varchar("company", { length: 255 }).notNull(),
    roleTitle: varchar("role_title", { length: 255 }).notNull(),
    url: varchar("url", { length: 1000 }).notNull(),
    scanDate: date("scan_date").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
  },
  (table) => [index("scan_url_idx").on(table.url)],
);

// ── Follow-ups ─────────────────────────────────────────

export const followUps = pgTable("follow_ups", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .notNull(),
  roundNumber: integer("round_number").notNull(),
  sentAt: timestamp("sent_at").notNull(),
  channel: followUpChannelEnum("channel").notNull(),
  messageSummary: text("message_summary"),
  nextDueAt: timestamp("next_due_at"),
});

// ── Interview Prep ─────────────────────────────────────

export const storyBankEntries = pgTable("story_bank_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  theme: varchar("theme", { length: 255 }).notNull(),
  situation: text("situation"),
  task: text("task"),
  action: text("action"),
  result: text("result"),
  reflection: text("reflection"),
  bestForQuestions: text("best_for_questions").array().default([]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const interviewIntel = pgTable("interview_intel", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .references(() => applications.id, { onDelete: "cascade" })
    .notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  processOverview: text("process_overview"),
  rounds: jsonb("rounds"),
  likelyQuestions: jsonb("likely_questions"),
  storyMapping: jsonb("story_mapping"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Chat ───────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  title: varchar("title", { length: 255 }),
  mode: varchar("mode", { length: 50 }).default("general").notNull(),
  applicationId: uuid("application_id").references(() => applications.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  richCardType: varchar("rich_card_type", { length: 50 }),
  richCardData: jsonb("rich_card_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── AI Usage ───────────────────────────────────────────

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    model: varchar("model", { length: 50 }),
    costUsd: decimal("cost_usd", { precision: 8, scale: 6 })
      .default("0")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("usage_user_created_idx").on(table.userId, table.createdAt)],
);

// ── Relations ──────────────────────────────────────────

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, {
    fields: [users.id],
    references: [profiles.userId],
  }),
  subscription: one(subscriptions, {
    fields: [users.id],
    references: [subscriptions.userId],
  }),
  applications: many(applications),
  conversations: many(conversations),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, {
    fields: [applications.userId],
    references: [users.id],
  }),
  report: one(reports, {
    fields: [applications.id],
    references: [reports.applicationId],
  }),
  followUps: many(followUps),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));
```

- [ ] **Step 2: Create the database client**

Write file `career-ops-web/lib/db/index.ts`:

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export type Database = typeof db;
```

- [ ] **Step 3: Generate and run migrations**

```bash
cd career-ops-web
npx drizzle-kit generate
npx drizzle-kit push
```

Expected: All tables created in the Neon database. Output shows each table name.

- [ ] **Step 4: Verify tables exist**

```bash
cd career-ops-web
npx drizzle-kit studio
```

Expected: Drizzle Studio opens in browser showing all 18 tables with correct columns.

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add lib/db/ drizzle.config.ts drizzle/
git commit -m "feat: complete database schema with all 18 tables"
```

---

### Task 5: Auth — Magic Link Backend

**Files:**
- Create: `career-ops-web/lib/auth/magic-link.ts`
- Create: `career-ops-web/lib/auth/session.ts`
- Create: `career-ops-web/app/api/auth/magic-link/send/route.ts`
- Create: `career-ops-web/app/api/auth/magic-link/verify/route.ts`
- Create: `career-ops-web/middleware.ts`

- [ ] **Step 1: Create the magic link utilities**

Write file `career-ops-web/lib/auth/magic-link.ts`:

```typescript
import crypto from "crypto";
import { db } from "@/lib/db";
import { magicLinks, users, profiles, subscriptions } from "@/lib/db/schema";
import { eq, and, isNull, lt } from "drizzle-orm";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export function generateToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export async function sendMagicLink(email: string): Promise<void> {
  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase()),
  });

  if (!user) {
    const [newUser] = await db
      .insert(users)
      .values({ email: email.toLowerCase() })
      .returning();
    user = newUser;

    // Create profile + subscription for new user
    await db.insert(profiles).values({ userId: user.id });
    await db.insert(subscriptions).values({ userId: user.id });
  }

  // Invalidate previous unused links for this user
  await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(and(eq(magicLinks.userId, user.id), isNull(magicLinks.usedAt)));

  // Create new token
  const { raw, hash } = generateToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await db.insert(magicLinks).values({
    userId: user.id,
    tokenHash: hash,
    expiresAt,
  });

  // Send email
  const link = `${process.env.MAGIC_LINK_BASE_URL}/verify?token=${raw}`;

  await resend.emails.send({
    from: process.env.EMAIL_FROM || "Career-Ops <noreply@career-ops.com>",
    to: email,
    subject: "Sign in to Career-Ops",
    html: `
      <div style="font-family: Inter, system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #262626; letter-spacing: -0.31px; margin-bottom: 8px;">Career-Ops</h1>
        <p style="color: #737373; font-size: 14px; margin-bottom: 24px;">Click the link below to sign in. It expires in 15 minutes.</p>
        <a href="${link}" style="display: inline-block; background: #262626; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">Sign in to Career-Ops</a>
        <p style="color: #a3a3a3; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function verifyMagicLink(
  token: string,
): Promise<{ userId: string; isNewUser: boolean } | null> {
  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const link = await db.query.magicLinks.findFirst({
    where: and(
      eq(magicLinks.tokenHash, hash),
      isNull(magicLinks.usedAt),
    ),
  });

  if (!link) return null;
  if (new Date() > link.expiresAt) return null;

  // Mark as used
  await db
    .update(magicLinks)
    .set({ usedAt: new Date() })
    .where(eq(magicLinks.id, link.id));

  // Check if user has completed onboarding
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, link.userId!),
  });

  const isNewUser = !profile?.onboardingCompleted;

  return { userId: link.userId!, isNewUser };
}
```

- [ ] **Step 2: Create session (JWT) utilities**

Write file `career-ops-web/lib/auth/session.ts`:

```typescript
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSION_COOKIE = "career-ops-session";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

export async function createSession(userId: string): Promise<string> {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60, // 30 days
    path: "/",
  });

  return token;
}

export async function getSession(): Promise<{
  userId: string;
} | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.userId),
    with: {
      profile: true,
      subscription: true,
    },
  });

  return user;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
```

- [ ] **Step 3: Create the send magic link API route**

Write file `career-ops-web/app/api/auth/magic-link/send/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { sendMagicLink } from "@/lib/auth/magic-link";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 },
      );
    }

    await sendMagicLink(email.toLowerCase());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Magic link send error:", error);
    return NextResponse.json(
      { error: "Failed to send magic link" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Create the verify magic link API route**

Write file `career-ops-web/app/api/auth/magic-link/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLink } from "@/lib/auth/magic-link";
import { createSession } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 },
      );
    }

    const result = await verifyMagicLink(token);

    if (!result) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 401 },
      );
    }

    await createSession(result.userId);

    const redirectTo = result.isNewUser ? "/onboarding/welcome" : "/home";

    return NextResponse.json({ success: true, redirectTo });
  } catch (error) {
    console.error("Magic link verify error:", error);
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 5: Create Next.js middleware for route protection**

Write file `career-ops-web/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/", "/login", "/verify", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // Allow API webhook routes
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get("career-ops-session")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
```

- [ ] **Step 6: Commit**

```bash
cd career-ops-web
git add lib/auth/ app/api/auth/ middleware.ts
git commit -m "feat: magic link auth with JWT sessions and route protection"
```

---

### Task 6: Auth — Login and Verify Pages

**Files:**
- Create: `career-ops-web/app/(auth)/login/page.tsx`
- Create: `career-ops-web/app/(auth)/verify/page.tsx`

- [ ] **Step 1: Create the login page**

Write file `career-ops-web/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvelopeIcon } from "@heroicons/react/24/outline";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/magic-link/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send link");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
        <div className="w-full max-w-sm px-6">
          <div className="card-surface p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
              <EnvelopeIcon className="h-6 w-6 text-neutral-500" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-800 mb-2">
              Check your email
            </h1>
            <p className="text-sm text-neutral-500 mb-6">
              We sent a sign-in link to{" "}
              <span className="font-medium text-neutral-700">{email}</span>.
              It expires in 15 minutes.
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-sm text-neutral-500 hover:text-neutral-800 underline"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
      <div className="w-full max-w-sm px-6">
        <div className="card-surface p-8">
          <h1 className="text-xl font-semibold text-neutral-800 mb-1">
            Career-Ops
          </h1>
          <p className="text-sm text-neutral-500 mb-8">
            Sign in with your email. No password needed.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || !email}
              className="w-full h-10 bg-neutral-800 hover:bg-neutral-900 text-white"
            >
              {loading ? "Sending..." : "Continue with Email"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the verify page**

Write file `career-ops-web/app/(auth)/verify/page.tsx`:

```tsx
"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setError("No token provided");
      return;
    }

    async function verify() {
      try {
        const res = await fetch("/api/auth/magic-link/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Verification failed");
        }

        router.push(data.redirectTo);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Verification failed",
        );
      }
    }

    verify();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
        <div className="card-surface p-8 max-w-sm text-center">
          <h1 className="text-lg font-semibold text-neutral-800 mb-2">
            Link expired
          </h1>
          <p className="text-sm text-neutral-500 mb-6">{error}</p>
          <a
            href="/login"
            className="text-sm font-medium text-neutral-800 underline"
          >
            Request a new link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
      <div className="card-surface p-8 max-w-sm text-center">
        <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full mx-auto mb-4" />
        <p className="text-sm text-neutral-500">Verifying your link...</p>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FCFCFC]">
          <div className="card-surface p-8 max-w-sm text-center">
            <div className="animate-spin h-6 w-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full mx-auto mb-4" />
            <p className="text-sm text-neutral-500">Loading...</p>
          </div>
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Verify login page renders**

```bash
cd career-ops-web && npm run dev
```

Open http://localhost:3000/login — verify the login form appears with Inter font, neutral colors, card surface styling.

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add app/\(auth\)/
git commit -m "feat: login and verify pages with magic link flow"
```

---

### Task 7: Scoring Utilities

**Files:**
- Create: `career-ops-web/lib/utils/scoring.ts`

- [ ] **Step 1: Create the scoring helpers**

Write file `career-ops-web/lib/utils/scoring.ts`:

```typescript
export function scoreColor(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "text-neutral-400";
  if (n >= 4.5) return "text-emerald-600";
  if (n >= 4.0) return "text-emerald-500";
  if (n >= 3.5) return "text-amber-500";
  return "text-red-500";
}

export function scoreBgColor(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "bg-neutral-100";
  if (n >= 4.5) return "bg-emerald-50";
  if (n >= 4.0) return "bg-emerald-50";
  if (n >= 3.5) return "bg-amber-50";
  return "bg-red-50";
}

export function scoreLabel(score: number | string | null): string {
  const n = typeof score === "string" ? parseFloat(score) : score;
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 4.5) return "Strong match";
  if (n >= 4.0) return "Good match";
  if (n >= 3.5) return "Decent";
  return "Weak fit";
}

export function statusColor(status: string): string {
  switch (status) {
    case "Offer":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Interview":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "Applied":
    case "Responded":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "Evaluated":
      return "bg-neutral-100 text-neutral-700 border-neutral-200";
    case "Rejected":
      return "bg-red-50 text-red-600 border-red-200";
    case "Discarded":
    case "SKIP":
      return "bg-neutral-50 text-neutral-400 border-neutral-200";
    default:
      return "bg-neutral-100 text-neutral-600 border-neutral-200";
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd career-ops-web
git add lib/utils/scoring.ts
git commit -m "feat: scoring color, label, and status helpers"
```

---

### Task 8: App Layout — Top Nav + Command Bar

**Files:**
- Create: `career-ops-web/components/layout/top-nav.tsx`
- Create: `career-ops-web/components/layout/command-bar.tsx`
- Create: `career-ops-web/components/layout/user-menu.tsx`
- Create: `career-ops-web/app/(app)/layout.tsx`

- [ ] **Step 1: Create the user menu component**

Write file `career-ops-web/components/layout/user-menu.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Cog6ToothIcon,
  ArrowRightStartOnRectangleIcon,
} from "@heroicons/react/24/outline";

interface UserMenuProps {
  name: string | null;
  email: string;
}

export function UserMenu({ name, email }: UserMenuProps) {
  const router = useRouter();
  const initials = (name || email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-300 transition-colors">
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1.5">
          <p className="text-sm font-medium text-neutral-800 truncate">
            {name || "User"}
          </p>
          <p className="text-xs text-neutral-500 truncate">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/settings")}>
          <Cog6ToothIcon className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <ArrowRightStartOnRectangleIcon className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Create the command bar**

Write file `career-ops-web/components/layout/command-bar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";

const pages = [
  { name: "Home", path: "/home", keywords: "dashboard overview" },
  { name: "Applications", path: "/applications", keywords: "tracker kanban" },
  { name: "Pipeline", path: "/pipeline", keywords: "inbox urls pending" },
  { name: "Reports", path: "/reports", keywords: "evaluations" },
  { name: "Chat", path: "/chat", keywords: "claude ai conversation" },
  { name: "Profile", path: "/profile", keywords: "cv resume settings" },
  { name: "Scanner", path: "/scanner", keywords: "portals search jobs" },
  { name: "Follow-ups", path: "/follow-ups", keywords: "cadence reminders" },
  {
    name: "Interview Prep",
    path: "/interview-prep",
    keywords: "stories questions",
  },
  { name: "Analytics", path: "/analytics", keywords: "patterns funnel" },
  { name: "Settings", path: "/settings", keywords: "account billing" },
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function navigate(path: string) {
    setOpen(false);
    router.push(path);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setOpen(false)}
      />
      <div className="absolute top-[20%] left-1/2 w-full max-w-lg -translate-x-1/2">
        <Command className="bg-white rounded-xl border border-neutral-200 shadow-2xl overflow-hidden">
          <Command.Input
            placeholder="Search pages, actions..."
            className="w-full px-4 py-3 text-sm border-b border-neutral-200 outline-none placeholder:text-neutral-400"
            autoFocus
          />
          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-neutral-500">
              No results found.
            </Command.Empty>
            <Command.Group heading="Pages">
              {pages.map((page) => (
                <Command.Item
                  key={page.path}
                  value={`${page.name} ${page.keywords}`}
                  onSelect={() => navigate(page.path)}
                  className="flex items-center gap-3 px-3 py-2 text-sm text-neutral-700 rounded-lg cursor-pointer data-[selected=true]:bg-neutral-100"
                >
                  {page.name}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the top nav**

Write file `career-ops-web/components/layout/top-nav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainLinks = [
  { name: "Home", path: "/home" },
  { name: "Applications", path: "/applications" },
  { name: "Pipeline", path: "/pipeline" },
  { name: "Reports", path: "/reports" },
  { name: "Chat", path: "/chat" },
];

const moreLinks = [
  { name: "Scanner", path: "/scanner" },
  { name: "Follow-ups", path: "/follow-ups" },
  { name: "Interview Prep", path: "/interview-prep" },
  { name: "Analytics", path: "/analytics" },
  { name: "Settings", path: "/settings" },
];

interface TopNavProps {
  userName: string | null;
  userEmail: string;
}

export function TopNav({ userName, userEmail }: TopNavProps) {
  const pathname = usePathname();

  function isActive(path: string) {
    return pathname === path || pathname.startsWith(path + "/");
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-neutral-200">
      <div className="flex h-12 items-center justify-between px-6">
        {/* Left: Logo + Nav Links */}
        <div className="flex items-center gap-8">
          <Link
            href="/home"
            className="text-base font-semibold text-neutral-800"
          >
            Career-Ops
          </Link>

          <nav className="flex items-center gap-1">
            {mainLinks.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                  isActive(link.path)
                    ? "text-neutral-800 bg-neutral-100 font-medium"
                    : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50",
                )}
              >
                {link.name}
              </Link>
            ))}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors",
                    moreLinks.some((l) => isActive(l.path))
                      ? "text-neutral-800 bg-neutral-100 font-medium"
                      : "text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50",
                  )}
                >
                  More
                  <ChevronDownIcon className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {moreLinks.map((link) => (
                  <DropdownMenuItem key={link.path} asChild>
                    <Link href={link.path}>{link.name}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        {/* Right: Command bar hint + User menu */}
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true }),
              )
            }
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs text-neutral-400 bg-neutral-100 rounded-md hover:bg-neutral-200 transition-colors"
          >
            <span>&#8984;K</span>
          </button>
          <UserMenu name={userName} email={userEmail} />
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create the authenticated app layout**

Write file `career-ops-web/app/(app)/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { TopNav } from "@/components/layout/top-nav";
import { CommandBar } from "@/components/layout/command-bar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#FCFCFC]">
      <TopNav userName={user.name} userEmail={user.email} />
      <CommandBar />
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Create the logout API route**

Write file `career-ops-web/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 6: Verify the layout renders**

```bash
cd career-ops-web && npm run dev
```

Navigate to http://localhost:3000/home (will redirect to login if not authenticated — that's expected). Verify there are no build errors.

- [ ] **Step 7: Commit**

```bash
cd career-ops-web
git add components/layout/ app/\(app\)/layout.tsx app/api/auth/logout/
git commit -m "feat: app layout with top nav, command bar, user menu"
```

---

### Task 9: Home Page — Stats API Route

**Files:**
- Create: `career-ops-web/app/api/applications/stats/route.ts`

- [ ] **Step 1: Create the stats API route**

Write file `career-ops-web/app/api/applications/stats/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applications, pipelineEntries, followUps } from "@/lib/db/schema";
import { eq, and, count, avg, sql, lt, isNotNull } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.userId;

  // Total applications
  const [totalResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.userId, userId));

  // Applications by status
  const statusCounts = await db
    .select({
      status: applications.status,
      count: count(),
    })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);

  // Average score
  const [avgResult] = await db
    .select({ avg: avg(applications.score) })
    .from(applications)
    .where(eq(applications.userId, userId));

  // Pending pipeline entries
  const [pipelineResult] = await db
    .select({ count: count() })
    .from(pipelineEntries)
    .where(
      and(
        eq(pipelineEntries.userId, userId),
        eq(pipelineEntries.status, "pending"),
      ),
    );

  // Overdue follow-ups
  const [overdueResult] = await db
    .select({ count: count() })
    .from(followUps)
    .innerJoin(applications, eq(followUps.applicationId, applications.id))
    .where(
      and(
        eq(applications.userId, userId),
        lt(followUps.nextDueAt, new Date()),
        isNotNull(followUps.nextDueAt),
      ),
    );

  // Build status map
  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row.count;
  }

  return NextResponse.json({
    total: totalResult.count,
    interviews: statusMap["Interview"] || 0,
    avgScore: avgResult.avg ? parseFloat(avgResult.avg).toFixed(1) : null,
    pipeline: pipelineResult.count,
    overdueFollowUps: overdueResult.count,
    funnel: {
      evaluated: statusMap["Evaluated"] || 0,
      applied: statusMap["Applied"] || 0,
      responded: statusMap["Responded"] || 0,
      interview: statusMap["Interview"] || 0,
      offer: statusMap["Offer"] || 0,
      rejected: statusMap["Rejected"] || 0,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd career-ops-web
git add app/api/applications/stats/
git commit -m "feat: application stats API route for home dashboard"
```

---

### Task 10: Home Page — Dashboard Components

**Files:**
- Create: `career-ops-web/components/home/stat-cards.tsx`
- Create: `career-ops-web/components/home/funnel-chart.tsx`
- Create: `career-ops-web/components/home/needs-attention.tsx`

- [ ] **Step 1: Create the stat cards component**

Write file `career-ops-web/components/home/stat-cards.tsx`:

```tsx
import {
  BriefcaseIcon,
  ChatBubbleLeftRightIcon,
  ChartBarIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";

interface StatCardsProps {
  total: number;
  interviews: number;
  avgScore: string | null;
  pipeline: number;
}

const cards = [
  {
    key: "total" as const,
    label: "Applications",
    icon: BriefcaseIcon,
  },
  {
    key: "interviews" as const,
    label: "Interviews",
    icon: ChatBubbleLeftRightIcon,
  },
  {
    key: "avgScore" as const,
    label: "Avg Score",
    icon: ChartBarIcon,
  },
  {
    key: "pipeline" as const,
    label: "Pipeline",
    icon: InboxStackIcon,
  },
];

export function StatCards({ total, interviews, avgScore, pipeline }: StatCardsProps) {
  const values: Record<string, string | number> = {
    total,
    interviews,
    avgScore: avgScore ?? "—",
    pipeline,
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="card-surface p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {card.label}
            </span>
            <card.icon className="h-4 w-4 text-neutral-400" />
          </div>
          <p className="text-2xl font-semibold text-neutral-800">
            {values[card.key]}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the funnel chart component**

Write file `career-ops-web/components/home/funnel-chart.tsx`:

```tsx
interface FunnelChartProps {
  funnel: {
    evaluated: number;
    applied: number;
    responded: number;
    interview: number;
    offer: number;
  };
}

const stages = [
  { key: "evaluated" as const, label: "Evaluated", color: "bg-neutral-400" },
  { key: "applied" as const, label: "Applied", color: "bg-violet-400" },
  { key: "responded" as const, label: "Responded", color: "bg-blue-400" },
  { key: "interview" as const, label: "Interview", color: "bg-blue-500" },
  { key: "offer" as const, label: "Offer", color: "bg-emerald-500" },
];

export function FunnelChart({ funnel }: FunnelChartProps) {
  const max = Math.max(...Object.values(funnel), 1);

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-medium text-neutral-800 mb-4">Funnel</h3>
      <div className="space-y-3">
        {stages.map((stage) => {
          const value = funnel[stage.key];
          const width = max > 0 ? (value / max) * 100 : 0;

          return (
            <div key={stage.key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-neutral-500">{stage.label}</span>
                <span className="text-xs font-medium text-neutral-700">
                  {value}
                </span>
              </div>
              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${stage.color} transition-all duration-500`}
                  style={{ width: `${Math.max(width, value > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the needs attention component**

Write file `career-ops-web/components/home/needs-attention.tsx`:

```tsx
import Link from "next/link";

interface AttentionItem {
  type: "urgent" | "warning" | "info";
  message: string;
  link: string;
}

interface NeedsAttentionProps {
  overdueFollowUps: number;
  pipeline: number;
}

export function NeedsAttention({
  overdueFollowUps,
  pipeline,
}: NeedsAttentionProps) {
  const items: AttentionItem[] = [];

  if (overdueFollowUps > 0) {
    items.push({
      type: "urgent",
      message: `${overdueFollowUps} follow-up${overdueFollowUps > 1 ? "s" : ""} overdue`,
      link: "/follow-ups",
    });
  }

  if (pipeline > 0) {
    items.push({
      type: "warning",
      message: `${pipeline} offer${pipeline > 1 ? "s" : ""} in pipeline, ready to evaluate`,
      link: "/pipeline",
    });
  }

  if (items.length === 0) {
    items.push({
      type: "info",
      message: "All caught up. Paste a job URL in Chat to evaluate it.",
      link: "/chat",
    });
  }

  const dotColor = {
    urgent: "bg-red-500",
    warning: "bg-amber-400",
    info: "bg-blue-400",
  };

  return (
    <div className="card-surface p-5">
      <h3 className="text-sm font-medium text-neutral-800 mb-4">
        Needs Attention
      </h3>
      <div className="space-y-3">
        {items.map((item, i) => (
          <Link
            key={i}
            href={item.link}
            className="flex items-start gap-3 group"
          >
            <div
              className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dotColor[item.type]}`}
            />
            <span className="text-sm text-neutral-600 group-hover:text-neutral-800 transition-colors">
              {item.message}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add components/home/
git commit -m "feat: home dashboard components (stat cards, funnel, needs attention)"
```

---

### Task 11: Home Page — Page Assembly

**Files:**
- Create: `career-ops-web/app/(app)/home/page.tsx`

- [ ] **Step 1: Create the home page**

Write file `career-ops-web/app/(app)/home/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { applications, pipelineEntries, followUps } from "@/lib/db/schema";
import { eq, and, count, avg, lt, isNotNull } from "drizzle-orm";
import { StatCards } from "@/components/home/stat-cards";
import { FunnelChart } from "@/components/home/funnel-chart";
import { NeedsAttention } from "@/components/home/needs-attention";

async function getStats(userId: string) {
  const [totalResult] = await db
    .select({ count: count() })
    .from(applications)
    .where(eq(applications.userId, userId));

  const statusCounts = await db
    .select({ status: applications.status, count: count() })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);

  const [avgResult] = await db
    .select({ avg: avg(applications.score) })
    .from(applications)
    .where(eq(applications.userId, userId));

  const [pipelineResult] = await db
    .select({ count: count() })
    .from(pipelineEntries)
    .where(
      and(
        eq(pipelineEntries.userId, userId),
        eq(pipelineEntries.status, "pending"),
      ),
    );

  const [overdueResult] = await db
    .select({ count: count() })
    .from(followUps)
    .innerJoin(applications, eq(followUps.applicationId, applications.id))
    .where(
      and(
        eq(applications.userId, userId),
        lt(followUps.nextDueAt, new Date()),
        isNotNull(followUps.nextDueAt),
      ),
    );

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row.count;
  }

  return {
    total: totalResult.count,
    interviews: statusMap["Interview"] || 0,
    avgScore: avgResult.avg ? parseFloat(avgResult.avg).toFixed(1) : null,
    pipeline: pipelineResult.count,
    overdueFollowUps: overdueResult.count,
    funnel: {
      evaluated: statusMap["Evaluated"] || 0,
      applied: statusMap["Applied"] || 0,
      responded: statusMap["Responded"] || 0,
      interview: statusMap["Interview"] || 0,
      offer: statusMap["Offer"] || 0,
    },
  };
}

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stats = await getStats(user.id);

  const greeting = getGreeting();
  const displayName = user.name || user.email.split("@")[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-neutral-800">
          {greeting}, {displayName}
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stat Cards */}
      <StatCards
        total={stats.total}
        interviews={stats.interviews}
        avgScore={stats.avgScore}
        pipeline={stats.pipeline}
      />

      {/* Two Column: Funnel + Needs Attention */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FunnelChart funnel={stats.funnel} />
        <NeedsAttention
          overdueFollowUps={stats.overdueFollowUps}
          pipeline={stats.pipeline}
        />
      </div>
    </div>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
```

- [ ] **Step 2: Verify the home page builds**

```bash
cd career-ops-web && npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add app/\(app\)/home/
git commit -m "feat: home dashboard page with greeting, stats, funnel, action items"
```

---

### Task 12: Landing Page

**Files:**
- Modify: `career-ops-web/app/page.tsx`

- [ ] **Step 1: Create the public landing page**

Write file `career-ops-web/app/page.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FCFCFC]">
      {/* Nav */}
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <span className="text-base font-semibold text-neutral-800">
          Career-Ops
        </span>
        <Link href="/login">
          <Button
            variant="outline"
            size="sm"
            className="text-sm"
          >
            Sign in
          </Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="max-w-2xl mx-auto px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-semibold text-neutral-800 leading-tight mb-4">
          Your AI-powered
          <br />
          job search command center
        </h1>
        <p className="text-lg text-neutral-500 mb-8 max-w-lg mx-auto">
          Evaluate offers, generate tailored CVs, scan portals, track
          applications — all powered by Claude.
        </p>
        <Link href="/login">
          <Button className="h-11 px-8 bg-neutral-800 hover:bg-neutral-900 text-white text-sm">
            Get started for free
          </Button>
        </Link>
        <p className="text-xs text-neutral-400 mt-4">
          No credit card required. 5 free evaluations per month.
        </p>
      </main>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Evaluate",
              desc: "Paste a job URL and get a full A-G evaluation with scoring, CV match analysis, and interview prep.",
            },
            {
              title: "Generate",
              desc: "ATS-optimized PDFs tailored to each role. Keywords extracted from the JD, injected into your experience.",
            },
            {
              title: "Track",
              desc: "Kanban board for your pipeline. Follow-up reminders. Pattern analysis to sharpen your targeting.",
            },
          ].map((feature) => (
            <div key={feature.title} className="card-surface p-6">
              <h3 className="text-sm font-semibold text-neutral-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-neutral-500 leading-relaxed">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify the landing page renders**

```bash
cd career-ops-web && npm run dev
```

Open http://localhost:3000 — verify the landing page with hero section and feature cards renders with proper Inter font and neutral palette styling.

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add app/page.tsx
git commit -m "feat: public landing page with hero and feature cards"
```

---

### Task 13: Placeholder Pages for All Routes

**Files:**
- Create placeholder pages for all 10 remaining app routes so navigation works end-to-end

- [ ] **Step 1: Create all placeholder pages**

For each of these paths, create a minimal page that renders the page title so the navigation works without 404s:

Write file `career-ops-web/app/(app)/applications/page.tsx`:

```tsx
export default function ApplicationsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Applications</h1>
      <p className="text-sm text-neutral-500 mt-1">Kanban board — coming in Phase 2.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/pipeline/page.tsx`:

```tsx
export default function PipelinePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Pipeline</h1>
      <p className="text-sm text-neutral-500 mt-1">URL inbox — coming in Phase 2.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/reports/page.tsx`:

```tsx
export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Reports</h1>
      <p className="text-sm text-neutral-500 mt-1">Evaluation reports — coming in Phase 2.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/chat/page.tsx`:

```tsx
export default function ChatPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Chat</h1>
      <p className="text-sm text-neutral-500 mt-1">AI chat with Claude — coming in Phase 3.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/profile/page.tsx`:

```tsx
export default function ProfilePage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Profile</h1>
      <p className="text-sm text-neutral-500 mt-1">CV & profile editor — coming in Phase 4.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/scanner/page.tsx`:

```tsx
export default function ScannerPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Scanner</h1>
      <p className="text-sm text-neutral-500 mt-1">Portal scanner — coming in Phase 5.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/follow-ups/page.tsx`:

```tsx
export default function FollowUpsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Follow-ups</h1>
      <p className="text-sm text-neutral-500 mt-1">Cadence tracker — coming in Phase 6.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/interview-prep/page.tsx`:

```tsx
export default function InterviewPrepPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Interview Prep</h1>
      <p className="text-sm text-neutral-500 mt-1">Story bank & intel — coming in Phase 6.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/analytics/page.tsx`:

```tsx
export default function AnalyticsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Analytics</h1>
      <p className="text-sm text-neutral-500 mt-1">Patterns & funnel — coming in Phase 6.</p>
    </div>
  );
}
```

Write file `career-ops-web/app/(app)/settings/page.tsx`:

```tsx
export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-800">Settings</h1>
      <p className="text-sm text-neutral-500 mt-1">Account & billing — coming in Phase 7.</p>
    </div>
  );
}
```

- [ ] **Step 2: Verify all routes resolve**

```bash
cd career-ops-web && npm run build
```

Expected: Build succeeds. All routes compile.

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add app/\(app\)/
git commit -m "feat: placeholder pages for all 11 app routes"
```

---

### Task 14: Final Build Verification

- [ ] **Step 1: Run the full production build**

```bash
cd career-ops-web && npm run build
```

Expected: Build succeeds with zero errors. All pages are statically analyzed or server-rendered.

- [ ] **Step 2: Start the production server and verify**

```bash
cd career-ops-web && npm start
```

Verify:
1. http://localhost:3000 — landing page renders
2. http://localhost:3000/login — login form renders
3. http://localhost:3000/home — redirects to /login (no session)
4. All navigation links work (will redirect to login)
5. ⌘K command bar opens

- [ ] **Step 3: Final commit**

```bash
cd career-ops-web
git add -A
git commit -m "feat: Phase 1 complete — foundation with auth, layout, home dashboard"
```
