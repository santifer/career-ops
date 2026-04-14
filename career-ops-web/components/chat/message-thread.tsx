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
          <h2 className="text-lg font-semibold text-neutral-800 mb-2">Career-Ops Chat</h2>
          <p className="text-sm text-neutral-500 max-w-md mx-auto">
            Paste a job URL to evaluate it, ask for a tailored CV, or just chat about your job search.
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          <div
            className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-neutral-800 text-white rounded-br-md"
                : "bg-white border border-neutral-200 text-neutral-700 rounded-bl-md"
            }`}
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
