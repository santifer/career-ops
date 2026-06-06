import { useEffect, useRef } from 'react';
import type { AgentMessage, JobRecommendation } from '../../types/agent';
import { UpdateCard } from './UpdateCard';

type Props = {
  messages: AgentMessage[];
  isThinking: boolean;
};

export function MessageList({ messages, isThinking }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({
      top: list.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [messages.length, isThinking]);

  return (
    <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
      <div className="space-y-4">
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isThinking && <TypingIndicator />}
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
          <p className="text-sm font-semibold text-ink">{message.content}</p>
          {message.comments && message.comments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {message.comments.map(c => (
                <div key={c.id} className="text-sm leading-relaxed">
                  <span className="font-medium">"{c.selectedText}"</span>
                  <span className="text-muted">, {c.commentText}</span>
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

    case 'job-recommendation':
      return message.jobRecommendation ? (
        <JobRecommendationCard recommendation={message.jobRecommendation} />
      ) : null;

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

function JobRecommendationCard({ recommendation }: { recommendation: JobRecommendation }) {
  const tone = recommendation.recommendation === 'Worth applying'
    ? 'bg-success-subtle text-success'
    : recommendation.recommendation === 'Skip'
      ? 'bg-error-subtle text-error'
      : 'bg-accent-subtle text-accent';

  return (
    <div className="rounded-lg border border-primary/30 bg-bg p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">Demo evaluation</div>
          <div className="mt-1 break-all text-sm font-medium text-primary">
            {recommendation.url}
          </div>
        </div>
        <div className="shrink-0 rounded-md bg-primary-subtle px-2.5 py-1 text-sm font-bold text-primary">
          {recommendation.score}
        </div>
      </div>

      <div className={`mb-4 inline-flex rounded-md px-2.5 py-1 text-sm font-bold ${tone}`}>
        {recommendation.recommendation}
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-medium">Why it matches</div>
          <ul className="space-y-1">
            {recommendation.matchReasons.map(reason => (
              <li key={reason} className="text-sm leading-relaxed text-muted">
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Risks to check</div>
          <ul className="space-y-1">
            {recommendation.risks.map(risk => (
              <li key={risk} className="text-sm leading-relaxed text-muted">
                {risk}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 rounded-md bg-surface px-3 py-2 text-sm font-semibold">
        {recommendation.cta}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="max-w-[85%]">
      <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-primary-subtle px-4 py-3 text-primary">
        <span className="sr-only">Agent is thinking</span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
      </div>
    </div>
  );
}
