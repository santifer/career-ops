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
            controller.enqueue(encoder.encode(sseEvent("delta", { text })));
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
          .set({ aiCreditsUsed: usage.used + 1, updatedAt: new Date() })
          .where(eq(subscriptions.userId, session.userId));

        controller.enqueue(
          encoder.encode(sseEvent("done", { messageId: saved.id, usage: finalMessage.usage })),
        );
        controller.close();
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : "Unknown error";
        controller.enqueue(encoder.encode(sseEvent("error", { error: errMessage })));
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
