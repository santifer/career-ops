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
