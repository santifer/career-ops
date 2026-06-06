import { useEffect, useRef } from 'react';
import type { AgentMessage } from '../../types/agent';
import { UpdateCard } from './UpdateCard';

type Props = {
  messages: AgentMessage[];
};

export function MessageList({ messages }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AgentMessage }) {
  switch (message.type) {
    case 'agent-text':
      return (
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm bg-primary-subtle px-4 py-3">
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
        </div>
      );

    case 'user-text':
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3">
            <p className="text-sm leading-relaxed text-white">{message.content}</p>
          </div>
        </div>
      );

    case 'comment-batch':
      return (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm font-medium text-muted">{message.content}</p>
          {message.comments && message.comments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {message.comments.map(c => (
                <div key={c.id} className="text-sm">
                  <span className="font-medium">"{c.selectedText}"</span>
                  <span className="text-muted"> — {c.commentText}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case 'proposed-update':
      return (
        <div className="space-y-3">
          {message.content && (
            <div className="max-w-[85%]">
              <div className="rounded-2xl rounded-tl-sm bg-primary-subtle px-4 py-3">
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            </div>
          )}
          {message.updates?.map(update => (
            <UpdateCard key={update.id} update={update} messageId={message.id} />
          ))}
        </div>
      );

    case 'readiness-nudge':
      return (
        <div className="max-w-[85%]">
          <div className="rounded-2xl rounded-tl-sm bg-primary-subtle px-4 py-3">
            <p className="text-sm leading-relaxed">{message.content}</p>
          </div>
        </div>
      );

    default:
      return null;
  }
}
