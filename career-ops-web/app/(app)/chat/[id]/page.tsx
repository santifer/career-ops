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

  return <ChatLayout conversations={conversations} currentConversation={conversation} />;
}
