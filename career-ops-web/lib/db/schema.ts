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
  titleFiltersPositive: text("title_filters_positive").array().default([]).notNull(),
  titleFiltersNegative: text("title_filters_negative").array().default([]).notNull(),
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

export const portalConfigsRelations = relations(portalConfigs, ({ many }) => ({
  companies: many(trackedCompanies),
}));

export const trackedCompaniesRelations = relations(trackedCompanies, ({ one }) => ({
  portalConfig: one(portalConfigs, {
    fields: [trackedCompanies.portalConfigId],
    references: [portalConfigs.id],
  }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  application: one(applications, {
    fields: [followUps.applicationId],
    references: [applications.id],
  }),
}));

export const storyBankEntriesRelations = relations(storyBankEntries, ({ one }) => ({
  user: one(users, {
    fields: [storyBankEntries.userId],
    references: [users.id],
  }),
}));

export const interviewIntelRelations = relations(interviewIntel, ({ one }) => ({
  application: one(applications, {
    fields: [interviewIntel.applicationId],
    references: [applications.id],
  }),
}));

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
  targetRoles: many(targetRoles),
  archetypes: many(archetypes),
  compensationTarget: one(compensationTargets),
}));

export const compensationTargetsRelations = relations(compensationTargets, ({ one }) => ({
  profile: one(profiles, {
    fields: [compensationTargets.profileId],
    references: [profiles.id],
  }),
}));
