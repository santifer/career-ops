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
        const res = await fetch(`/api/chat/conversations/${convoId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

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
      <div className={`${sidebarOpen ? "block" : "hidden"} lg:block w-64 border-r border-neutral-200 bg-white flex-shrink-0`}>
        <ConversationList conversations={conversations} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile sidebar toggle */}
        <div className="lg:hidden flex items-center px-4 py-2 border-b border-neutral-200">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 text-neutral-500 hover:text-neutral-800">
            {sidebarOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
          </button>
          <span className="ml-2 text-sm font-medium text-neutral-800">
            {currentConversation?.title ?? "New conversation"}
          </span>
        </div>

        <MessageThread messages={messages} streamingContent={streamingContent} />
        <MessageInput onSend={handleSend} disabled={streamingContent !== null} />
      </div>
    </div>
  );
}
