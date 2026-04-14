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
