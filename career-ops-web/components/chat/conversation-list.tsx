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
          <p className="text-xs text-neutral-400 text-center py-6">No conversations yet</p>
        ) : (
          conversations.map((convo) => {
            const isActive = pathname === `/chat/${convo.id}`;
            return (
              <Link
                key={convo.id}
                href={`/chat/${convo.id}`}
                className={cn(
                  "flex items-start gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive ? "bg-neutral-100 text-neutral-800" : "text-neutral-600 hover:bg-neutral-50",
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
