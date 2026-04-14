# Career-Ops Web — Phase 3: AI Chat Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI chat system — Anthropic API client, prompt context injection, SSE streaming, conversation CRUD, split-view chat UI with message thread, and usage metering. This is the core AI-powered experience.

**Architecture:** Chat messages POST to an API route that builds a prompt from DB context (CV, profile, archetypes), calls Anthropic's streaming API, and returns Server-Sent Events. The frontend renders a split-view: conversation thread on the left, report/detail panel on the right. Conversations and messages are persisted to PostgreSQL.

**Tech Stack:** @anthropic-ai/sdk (streaming), Next.js API routes (SSE), React state for streaming UI, Drizzle ORM for persistence.

**Design Cheatsheet:** Same as Phase 1-2 (Inter font, neutral palette, card-surface class, Heroicons).

**Existing codebase context:**
- Auth: `getSession()` → `{ userId }`, `getCurrentUser()` → full user with profile+subscription
- Schema: `conversations`, `messages`, `aiUsageLogs`, `profiles`, `archetypes`, `compensationTargets`, `subscriptions` tables
- Relations: `conversationsRelations` (user, messages), `messagesRelations` (conversation)
- Scoring utils at `@/lib/utils/scoring`
- shadcn/ui components available: button, input, card, badge, dialog, dropdown-menu, separator, tooltip, sheet, textarea, scroll-area, tabs

---

## File Structure

```
career-ops-web/
├── lib/
│   ├── ai/
│   │   ├── client.ts              # Anthropic SDK client (handles BYOK)
│   │   ├── streaming.ts           # SSE encoder utilities
│   │   └── usage.ts               # Token usage logging
│   ├── prompts/
│   │   ├── shared.ts              # System prompt builder (CV + profile + archetypes)
│   │   └── chat.ts                # Chat mode prompt template
│   └── db/
│       └── queries/
│           └── conversations.ts   # Conversation + message CRUD
├── app/
│   ├── (app)/
│   │   └── chat/
│   │       ├── page.tsx           # New conversation page
│   │       └── [id]/
│   │           └── page.tsx       # Existing conversation
│   └── api/
│       └── chat/
│           ├── conversations/
│           │   └── route.ts       # GET (list) / POST (create)
│           └── conversations/
│               └── [id]/
│                   ├── route.ts   # GET (with messages)
│                   └── messages/
│                       └── route.ts # POST (send message, stream response)
├── components/
│   └── chat/
│       ├── conversation-list.tsx  # Sidebar conversation list
│       ├── message-thread.tsx     # Message display with streaming
│       ├── message-input.tsx      # Text input with submit
│       └── chat-layout.tsx        # Split view orchestration
```

---

## Task 1: Install Anthropic SDK

**Files:**
- Modify: `career-ops-web/package.json`

- [ ] **Step 1: Install the SDK**

```bash
cd career-ops-web && npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Verify install**

```bash
cd career-ops-web && node -e "require('@anthropic-ai/sdk'); console.log('ok')"
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add package.json package-lock.json
git commit -m "chore: add @anthropic-ai/sdk"
```

---

## Task 2: AI Client + Usage Logger

**Files:**
- Create: `career-ops-web/lib/ai/client.ts`
- Create: `career-ops-web/lib/ai/usage.ts`
- Create: `career-ops-web/lib/ai/streaming.ts`

- [ ] **Step 1: Create the Anthropic client wrapper**

Write file `career-ops-web/lib/ai/client.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

let defaultClient: Anthropic | null = null;

export function getAnthropicClient(apiKey?: string): Anthropic {
  if (apiKey) {
    return new Anthropic({ apiKey });
  }

  if (!defaultClient) {
    defaultClient = new Anthropic();
  }

  return defaultClient;
}

export { DEFAULT_MODEL };
```

- [ ] **Step 2: Create the usage logger**

Write file `career-ops-web/lib/ai/usage.ts`:

```typescript
import { db } from "@/lib/db";
import { aiUsageLogs, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function logUsage(
  userId: string,
  data: {
    actionType: string;
    inputTokens: number;
    outputTokens: number;
    model: string;
  },
): Promise<void> {
  const costPer1kInput = 0.003;
  const costPer1kOutput = 0.015;
  const costUsd =
    (data.inputTokens / 1000) * costPer1kInput +
    (data.outputTokens / 1000) * costPer1kOutput;

  await db.insert(aiUsageLogs).values({
    userId,
    actionType: data.actionType,
    inputTokens: data.inputTokens,
    outputTokens: data.outputTokens,
    model: data.model,
    costUsd: costUsd.toFixed(6),
  });

  // Increment credits used
  await db
    .update(subscriptions)
    .set({
      aiCreditsUsed: subscriptions.aiCreditsUsed,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.userId, userId));
}

export async function checkUsageLimit(
  userId: string,
): Promise<{ allowed: boolean; used: number; limit: number; plan: string }> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
  });

  if (!sub) {
    return { allowed: true, used: 0, limit: 20, plan: "free" };
  }

  if (sub.plan === "byok") {
    return { allowed: true, used: sub.aiCreditsUsed, limit: Infinity, plan: "byok" };
  }

  return {
    allowed: sub.aiCreditsUsed < sub.aiCreditsLimit,
    used: sub.aiCreditsUsed,
    limit: sub.aiCreditsLimit,
    plan: sub.plan,
  };
}
```

- [ ] **Step 3: Create SSE streaming utilities**

Write file `career-ops-web/lib/ai/streaming.ts`:

```typescript
export function createSSEStream(): {
  stream: ReadableStream;
  writer: WritableStreamDefaultWriter;
  encoder: TextEncoder;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  const writable = new WritableStream({
    write(chunk) {
      controller.enqueue(encoder.encode(chunk));
    },
    close() {
      controller.close();
    },
  });

  return { stream, writer: writable.getWriter(), encoder };
}

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add lib/ai/
git commit -m "feat: Anthropic API client, usage logger, SSE streaming utils"
```

---

## Task 3: Prompt Templates

**Files:**
- Create: `career-ops-web/lib/prompts/shared.ts`
- Create: `career-ops-web/lib/prompts/chat.ts`

- [ ] **Step 1: Create the shared system prompt builder**

Write file `career-ops-web/lib/prompts/shared.ts`:

```typescript
import { db } from "@/lib/db";
import { profiles, archetypes, compensationTargets, targetRoles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export interface UserContext {
  cvMarkdown: string | null;
  fullName: string | null;
  headline: string | null;
  exitStory: string | null;
  superpowers: string | null;
  dealBreakers: string | null;
  bestAchievement: string | null;
  articleDigest: string | null;
  targetRolesList: string[];
  archetypesList: { name: string; level: string | null; fit: string; framingNotes: string | null }[];
  compensation: { currency: string; targetMin: number | null; targetMax: number | null; minimum: number | null } | null;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.userId, userId),
  });

  const roles = profile
    ? await db.query.targetRoles.findMany({
        where: eq(targetRoles.profileId, profile.id),
      })
    : [];

  const archs = profile
    ? await db.query.archetypes.findMany({
        where: eq(archetypes.profileId, profile.id),
      })
    : [];

  const comp = profile
    ? await db.query.compensationTargets.findFirst({
        where: eq(compensationTargets.profileId, profile.id),
      })
    : null;

  return {
    cvMarkdown: profile?.cvMarkdown ?? null,
    fullName: profile?.fullName ?? null,
    headline: profile?.headline ?? null,
    exitStory: profile?.exitStory ?? null,
    superpowers: profile?.superpowers ?? null,
    dealBreakers: profile?.dealBreakers ?? null,
    bestAchievement: profile?.bestAchievement ?? null,
    articleDigest: profile?.articleDigest ?? null,
    targetRolesList: roles.map((r) => r.title),
    archetypesList: archs.map((a) => ({
      name: a.name,
      level: a.level,
      fit: a.fit,
      framingNotes: a.framingNotes,
    })),
    compensation: comp
      ? {
          currency: comp.currency,
          targetMin: comp.targetMin,
          targetMax: comp.targetMax,
          minimum: comp.minimum,
        }
      : null,
  };
}

export function buildSystemPrompt(ctx: UserContext): string {
  const parts: string[] = [];

  parts.push(`You are Career-Ops, an AI career search assistant. You help the user evaluate job offers, generate tailored CVs, find contacts, prepare for interviews, and track their job search.

## Scoring System
- 4.5-5.0: Strong match — apply immediately
- 4.0-4.4: Good match — worth applying
- 3.5-3.9: Decent — apply if nothing better
- Below 3.5: Weak fit — recommend against applying

## Guidelines
- Be direct and honest. If a role is a poor fit, say so.
- Quality over quantity. Recommend fewer, better applications.
- Never submit an application without user review.
- Reference the user's specific experience when analyzing fit.`);

  if (ctx.cvMarkdown) {
    parts.push(`\n## User's CV\n${ctx.cvMarkdown}`);
  }

  if (ctx.fullName || ctx.headline) {
    parts.push(`\n## User Profile`);
    if (ctx.fullName) parts.push(`Name: ${ctx.fullName}`);
    if (ctx.headline) parts.push(`Headline: ${ctx.headline}`);
    if (ctx.exitStory) parts.push(`Exit Story: ${ctx.exitStory}`);
    if (ctx.superpowers) parts.push(`Superpowers: ${ctx.superpowers}`);
    if (ctx.dealBreakers) parts.push(`Deal Breakers: ${ctx.dealBreakers}`);
    if (ctx.bestAchievement) parts.push(`Best Achievement: ${ctx.bestAchievement}`);
  }

  if (ctx.targetRolesList.length > 0) {
    parts.push(`\n## Target Roles\n${ctx.targetRolesList.join(", ")}`);
  }

  if (ctx.archetypesList.length > 0) {
    parts.push(`\n## Archetypes`);
    for (const a of ctx.archetypesList) {
      let line = `- ${a.name}`;
      if (a.level) line += ` (${a.level})`;
      line += ` [${a.fit}]`;
      if (a.framingNotes) line += `: ${a.framingNotes}`;
      parts.push(line);
    }
  }

  if (ctx.compensation) {
    const c = ctx.compensation;
    parts.push(`\n## Compensation Target`);
    parts.push(`Currency: ${c.currency}`);
    if (c.targetMin && c.targetMax) parts.push(`Range: ${c.targetMin.toLocaleString()} - ${c.targetMax.toLocaleString()}`);
    if (c.minimum) parts.push(`Minimum: ${c.minimum.toLocaleString()}`);
  }

  if (ctx.articleDigest) {
    parts.push(`\n## Proof Points & Portfolio\n${ctx.articleDigest}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 2: Create the chat prompt template**

Write file `career-ops-web/lib/prompts/chat.ts`:

```typescript
import { loadUserContext, buildSystemPrompt } from "./shared";

export async function buildChatPrompt(userId: string): Promise<string> {
  const ctx = await loadUserContext(userId);
  return buildSystemPrompt(ctx);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add lib/prompts/
git commit -m "feat: prompt templates with user context injection"
```

---

## Task 4: Conversation Query Helpers

**Files:**
- Create: `career-ops-web/lib/db/queries/conversations.ts`

- [ ] **Step 1: Create the conversation query module**

Write file `career-ops-web/lib/db/queries/conversations.ts`:

```typescript
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

export type ConversationWithMessages = ConversationRow & {
  messages: MessageRow[];
};

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  return db.query.conversations.findMany({
    where: eq(conversations.userId, userId),
    orderBy: [desc(conversations.updatedAt)],
  });
}

export async function getConversation(
  id: string,
  userId: string,
): Promise<ConversationWithMessages | undefined> {
  const row = await db.query.conversations.findFirst({
    where: and(eq(conversations.id, id), eq(conversations.userId, userId)),
    with: { messages: true },
  });
  return row as ConversationWithMessages | undefined;
}

export async function createConversation(
  userId: string,
  title?: string,
  mode?: string,
): Promise<ConversationRow> {
  const [row] = await db
    .insert(conversations)
    .values({
      userId,
      title: title ?? "New conversation",
      mode: mode ?? "general",
    })
    .returning();
  return row;
}

export async function addMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  richCardType?: string,
  richCardData?: unknown,
): Promise<MessageRow> {
  const [row] = await db
    .insert(messages)
    .values({
      conversationId,
      role,
      content,
      richCardType,
      richCardData,
    })
    .returning();

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return row;
}

export async function updateConversationTitle(
  id: string,
  userId: string,
  title: string,
): Promise<void> {
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd career-ops-web
git add lib/db/queries/conversations.ts
git commit -m "feat: conversation and message query helpers"
```

---

## Task 5: Chat API Routes

**Files:**
- Create: `career-ops-web/app/api/chat/conversations/route.ts`
- Create: `career-ops-web/app/api/chat/conversations/[id]/route.ts`
- Create: `career-ops-web/app/api/chat/conversations/[id]/messages/route.ts`

- [ ] **Step 1: Create list/create conversations route**

Write file `career-ops-web/app/api/chat/conversations/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listConversations, createConversation } from "@/lib/db/queries/conversations";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const convos = await listConversations(session.userId);
  return NextResponse.json(convos);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const convo = await createConversation(
    session.userId,
    body.title,
    body.mode,
  );

  return NextResponse.json(convo, { status: 201 });
}
```

- [ ] **Step 2: Create single conversation route**

Write file `career-ops-web/app/api/chat/conversations/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getConversation } from "@/lib/db/queries/conversations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const convo = await getConversation(id, session.userId);
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(convo);
}
```

- [ ] **Step 3: Create the message route with SSE streaming**

Write file `career-ops-web/app/api/chat/conversations/[id]/messages/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getConversation, addMessage } from "@/lib/db/queries/conversations";
import { getAnthropicClient, DEFAULT_MODEL } from "@/lib/ai/client";
import { buildChatPrompt } from "@/lib/prompts/chat";
import { logUsage, checkUsageLimit } from "@/lib/ai/usage";
import { sseEvent } from "@/lib/ai/streaming";
import { db } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const convo = await getConversation(id, session.userId);
  if (!convo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Check usage limits
  const usage = await checkUsageLimit(session.userId);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Usage limit reached", used: usage.used, limit: usage.limit, plan: usage.plan },
      { status: 429 },
    );
  }

  // Save user message
  await addMessage(id, "user", content);

  // Build prompt context
  const systemPrompt = await buildChatPrompt(session.userId);

  // Build message history
  const messageHistory = convo.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  messageHistory.push({ role: "user", content });

  // Get API key (BYOK or default)
  let apiKey: string | undefined;
  if (usage.plan === "byok") {
    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, session.userId),
    });
    if (sub?.apiKeyEncrypted) {
      apiKey = sub.apiKeyEncrypted; // TODO: decrypt in production
    }
  }

  const client = getAnthropicClient(apiKey);

  // Create streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let fullResponse = "";

        const anthropicStream = await client.messages.stream({
          model: DEFAULT_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: messageHistory,
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            const text = event.delta.text;
            fullResponse += text;
            controller.enqueue(
              encoder.encode(sseEvent("delta", { text })),
            );
          }
        }

        const finalMessage = await anthropicStream.finalMessage();

        // Save assistant message
        const saved = await addMessage(id, "assistant", fullResponse);

        // Log usage
        await logUsage(session.userId, {
          actionType: "chat",
          inputTokens: finalMessage.usage.input_tokens,
          outputTokens: finalMessage.usage.output_tokens,
          model: DEFAULT_MODEL,
        });

        // Increment credits
        await db
          .update(subscriptions)
          .set({
            aiCreditsUsed: usage.used + 1,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.userId, session.userId));

        controller.enqueue(
          encoder.encode(
            sseEvent("done", {
              messageId: saved.id,
              usage: finalMessage.usage,
            }),
          ),
        );
        controller.close();
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(
          encoder.encode(sseEvent("error", { error: errMessage })),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd career-ops-web
git add app/api/chat/
git commit -m "feat: chat API routes with SSE streaming via Anthropic SDK"
```

---

## Task 6: Chat UI Components

**Files:**
- Create: `career-ops-web/components/chat/conversation-list.tsx`
- Create: `career-ops-web/components/chat/message-thread.tsx`
- Create: `career-ops-web/components/chat/message-input.tsx`
- Create: `career-ops-web/components/chat/chat-layout.tsx`

- [ ] **Step 1: Create the conversation list sidebar**

Write file `career-ops-web/components/chat/conversation-list.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PlusIcon, ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import type { ConversationRow } from "@/lib/db/queries/conversations";

interface ConversationListProps {
  conversations: ConversationRow[];
}

export function ConversationList({ conversations }: ConversationListProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-neutral-200">
        <Link
          href="/chat"
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors w-full"
        >
          <PlusIcon className="h-4 w-4" />
          New conversation
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {conversations.length === 0 ? (
          <p className="text-xs text-neutral-400 text-center py-6">
            No conversations yet
          </p>
        ) : (
          conversations.map((convo) => {
            const isActive = pathname === `/chat/${convo.id}`;
            return (
              <Link
                key={convo.id}
                href={`/chat/${convo.id}`}
                className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-neutral-100 text-neutral-800"
                    : "text-neutral-600 hover:bg-neutral-50",
                )}
              >
                <ChatBubbleLeftIcon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span className="truncate">{convo.title || "Untitled"}</span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the message thread**

Write file `career-ops-web/components/chat/message-thread.tsx`:

```tsx
"use client";

import { useRef, useEffect } from "react";
import type { MessageRow } from "@/lib/db/queries/conversations";

interface MessageThreadProps {
  messages: MessageRow[];
  streamingContent: string | null;
}

export function MessageThread({ messages, streamingContent }: MessageThreadProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.length === 0 && !streamingContent && (
        <div className="text-center py-16">
          <h2 className="text-lg font-semibold text-neutral-800 mb-2">
            Career-Ops Chat
          </h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Paste a job URL to evaluate it, ask for a tailored CV, or just chat about your job search.
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={cn(
              "max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
              msg.role === "user"
                ? "bg-neutral-800 text-white rounded-br-md"
                : "bg-white border border-neutral-200 text-neutral-700 rounded-bl-md",
            )}
          >
            {msg.content}
          </div>
        </div>
      ))}

      {streamingContent !== null && (
        <div className="flex justify-start">
          <div className="max-w-[75%] px-4 py-3 rounded-2xl rounded-bl-md bg-white border border-neutral-200 text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
            {streamingContent}
            <span className="inline-block w-1.5 h-4 bg-neutral-400 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
```

- [ ] **Step 3: Create the message input**

Write file `career-ops-web/components/chat/message-input.tsx`:

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [input]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-neutral-200 bg-white px-4 py-3"
    >
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Career-Ops..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none px-4 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-neutral-400 placeholder:text-neutral-400 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !input.trim()}
          className="flex items-center justify-center h-10 w-10 rounded-xl bg-neutral-800 text-white hover:bg-neutral-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Create the chat layout orchestrator**

Write file `career-ops-web/components/chat/chat-layout.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { MessageInput } from "./message-input";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { ConversationRow, MessageRow } from "@/lib/db/queries/conversations";

interface ChatLayoutProps {
  conversations: ConversationRow[];
  currentConversation: (ConversationRow & { messages: MessageRow[] }) | null;
}

export function ChatLayout({ conversations, currentConversation }: ChatLayoutProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageRow[]>(
    currentConversation?.messages ?? [],
  );
  const [streamingContent, setStreamingContent] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSend = useCallback(
    async (content: string) => {
      let convoId = currentConversation?.id;

      // Create conversation if needed
      if (!convoId) {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: content.slice(0, 60) }),
        });
        const newConvo = await res.json();
        convoId = newConvo.id;
        router.push(`/chat/${convoId}`);
      }

      // Optimistic user message
      const userMsg: MessageRow = {
        id: crypto.randomUUID(),
        conversationId: convoId!,
        role: "user",
        content,
        richCardType: null,
        richCardData: null,
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent("");

      // Stream response
      try {
        const res = await fetch(
          `/api/chat/conversations/${convoId}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          },
        );

        if (!res.ok) {
          const err = await res.json();
          setStreamingContent(null);
          const errMsg: MessageRow = {
            id: crypto.randomUUID(),
            conversationId: convoId!,
            role: "assistant",
            content: `Error: ${err.error ?? "Something went wrong"}`,
            richCardType: null,
            richCardData: null,
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, errMsg]);
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if ("text" in data) {
                    accumulated += data.text;
                    setStreamingContent(accumulated);
                  }
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }
        }

        // Finalize
        setStreamingContent(null);
        const assistantMsg: MessageRow = {
          id: crypto.randomUUID(),
          conversationId: convoId!,
          role: "assistant",
          content: accumulated,
          richCardType: null,
          richCardData: null,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        router.refresh();
      } catch {
        setStreamingContent(null);
      }
    },
    [currentConversation?.id, router],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-6 -mt-6">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "block" : "hidden"
        } lg:block w-64 border-r border-neutral-200 bg-white flex-shrink-0`}
      >
        <ConversationList conversations={conversations} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile sidebar toggle */}
        <div className="lg:hidden flex items-center px-4 py-2 border-b border-neutral-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1 text-neutral-500 hover:text-neutral-800"
          >
            {sidebarOpen ? (
              <XMarkIcon className="h-5 w-5" />
            ) : (
              <Bars3Icon className="h-5 w-5" />
            )}
          </button>
          <span className="ml-2 text-sm font-medium text-neutral-800">
            {currentConversation?.title ?? "New conversation"}
          </span>
        </div>

        <MessageThread
          messages={messages}
          streamingContent={streamingContent}
        />
        <MessageInput
          onSend={handleSend}
          disabled={streamingContent !== null}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd career-ops-web
git add components/chat/
git commit -m "feat: chat UI components (conversation list, message thread, input, layout)"
```

---

## Task 7: Chat Pages

**Files:**
- Modify: `career-ops-web/app/(app)/chat/page.tsx`
- Create: `career-ops-web/app/(app)/chat/[id]/page.tsx`

- [ ] **Step 1: Replace the chat placeholder with new conversation page**

Write file `career-ops-web/app/(app)/chat/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listConversations } from "@/lib/db/queries/conversations";
import { ChatLayout } from "@/components/chat/chat-layout";

export default async function ChatPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const conversations = await listConversations(user.id);

  return <ChatLayout conversations={conversations} currentConversation={null} />;
}
```

- [ ] **Step 2: Create the existing conversation page**

Write file `career-ops-web/app/(app)/chat/[id]/page.tsx`:

```tsx
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { listConversations, getConversation } from "@/lib/db/queries/conversations";
import { ChatLayout } from "@/components/chat/chat-layout";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const [conversations, conversation] = await Promise.all([
    listConversations(user.id),
    getConversation(id, user.id),
  ]);

  if (!conversation) notFound();

  return (
    <ChatLayout
      conversations={conversations}
      currentConversation={conversation}
    />
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd career-ops-web
git add app/\(app\)/chat/
git commit -m "feat: chat pages (new conversation + existing conversation)"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run TypeScript check**

```bash
cd career-ops-web && npx tsc --noEmit
```

- [ ] **Step 2: Verify all Phase 3 files exist**

```bash
cd career-ops-web && find lib/ai lib/prompts lib/db/queries/conversations.ts components/chat app/api/chat -type f | sort
```

- [ ] **Step 3: Check git log**

```bash
cd career-ops-web && git log --oneline -10
```
