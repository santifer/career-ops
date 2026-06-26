'use client';

import { useState } from 'react';

interface Props {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = 'copy', className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* */ }
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs mono border border-ink-800 hover:border-accent-500 rounded px-2 py-0.5 transition-colors ${
        copied ? 'text-emerald-300 border-emerald-700' : 'text-slate-500 hover:text-accent-300'
      } ${className}`}
      title={text}
    >
      {copied ? 'copied' : label}
    </button>
  );
}
