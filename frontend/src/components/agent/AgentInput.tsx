import { useState, useRef, useEffect } from 'react';

type Props = {
  onSend: (text: string) => void;
};

const quickActions = [
  {
    label: 'Add deal-breaker',
    value: 'No roles where the main success metric is pure outbound quota.',
  },
  {
    label: 'Paste sample job URL',
    value: 'https://jobs.ashbyhq.com/sample-company/growth-product-manager',
  },
];

export function AgentInput({ onSend }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
  }

  return (
    <div className="border-t border-border bg-bg px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap gap-2">
        {quickActions.map(action => (
          <button
            key={action.label}
            type="button"
            onClick={() => onSend(action.value)}
            className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-ink transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Answer the agent or paste a job URL..."
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-bg px-4 py-2.5 text-sm outline-none transition-colors duration-150 placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim()}
          className="min-h-11 shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
        >
          Send
        </button>
      </div>
    </div>
  );
}
