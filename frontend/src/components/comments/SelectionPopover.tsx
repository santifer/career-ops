import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { TextSelectionResult } from './useTextSelection';

type Props = {
  selection: TextSelectionResult;
  onSave: (commentText: string) => void;
  onCancel: () => void;
};

export function SelectionPopover({ selection, onSave, onCancel }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [expanded]);

  // Position the popover above the selection
  const top = selection.rect.top + window.scrollY - 8;
  const left = selection.rect.left + selection.rect.width / 2;

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setText('');
    setExpanded(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  }

  return createPortal(
    <div
      ref={popoverRef}
      data-popover
      className="z-popover fixed -translate-x-1/2 -translate-y-full"
      style={{ top: `${top}px`, left: `${left}px` }}
    >
      <div className="rounded-lg border border-border bg-bg shadow-md">
        {!expanded ? (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-subtle"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
              <path d="M14 1H2C1.45 1 1 1.45 1 2V11C1 11.55 1.45 12 2 12H5L8 15L11 12H14C14.55 12 15 11.55 15 11V2C15 1.45 14.55 1 14 1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            Add Comment
          </button>
        ) : (
          <div className="w-72 p-3">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="How should the agent use this?"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none transition-colors duration-150 placeholder:text-muted/60 focus:border-primary"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!text.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
