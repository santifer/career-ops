import { useState } from 'react';
import { useAppDispatch } from '../../state/useAppContext';
import type { ProposedUpdate } from '../../types/agent';

type Props = {
  update: ProposedUpdate;
  messageId: string;
};

export function UpdateCard({ update, messageId }: Props) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(update.proposedValue);

  const isResolved = update.status !== 'pending';
  const displayValue = update.status === 'edited' ? editValue : update.proposedValue;
  const statusLabel = update.status === 'accepted'
    ? 'Applied'
    : update.status === 'ignored'
      ? 'Ignored'
      : update.status === 'edited'
        ? 'Edited'
        : 'Needs review';
  const statusClass = update.status === 'accepted'
    ? 'bg-success-subtle text-success'
    : update.status === 'ignored'
      ? 'bg-surface text-muted'
      : 'bg-primary-subtle text-primary';
  const shouldShowCurrentValue = Boolean(update.currentValue)
    && (Boolean(update.sourceBatchId) || update.operation !== 'append');

  function handleAccept() {
    dispatch({ type: 'ACCEPT_UPDATE', messageId, updateId: update.id });
  }

  function handleIgnore() {
    dispatch({ type: 'IGNORE_UPDATE', messageId, updateId: update.id });
  }

  function handleEdit() {
    if (editing) {
      dispatch({ type: 'EDIT_UPDATE', messageId, updateId: update.id, proposedValue: editValue });
      setEditing(false);
    } else {
      setEditing(true);
    }
  }

  function handleAcceptEdited() {
    dispatch({ type: 'EDIT_UPDATE', messageId, updateId: update.id, proposedValue: editValue });
    setTimeout(() => {
      dispatch({ type: 'ACCEPT_UPDATE', messageId, updateId: update.id });
    }, 0);
  }

  return (
    <div
      className={`rounded-lg border p-4 transition-colors duration-200 ${
        update.status === 'ignored'
          ? 'border-border bg-surface'
          : update.status === 'accepted'
            ? 'border-success/30 bg-success-subtle'
            : 'border-border bg-bg'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-ink">Proposed profile update</div>
          <div className="mt-0.5 text-sm text-muted">
            {formatSection(update.section)} · {formatOperation(update.operation)} {update.field}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {shouldShowCurrentValue && (
        <div className="mb-3 rounded-md bg-surface px-3 py-2">
          <div className="mb-1 text-xs font-semibold text-muted">
            {update.sourceBatchId ? 'Selected text' : 'Current value'}
          </div>
          <p className="text-sm leading-relaxed text-ink">"{update.currentValue}"</p>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1 text-xs font-semibold text-muted">Agent wants to store</div>
        {editing ? (
          <textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors duration-150 placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary/20"
            rows={3}
            autoFocus
          />
        ) : (
          <p className="text-sm leading-relaxed">{displayValue || 'Remove this from the profile.'}</p>
        )}
      </div>

      {update.reason && (
        <p className="mb-3 text-sm leading-relaxed text-muted">{update.reason}</p>
      )}

      {!isResolved && (
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleAcceptEdited}
                className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-success/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
              >
                Accept edit
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditValue(update.proposedValue); }}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleAccept}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Accept update
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={handleIgnore}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:border-error hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
              >
                Ignore
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatSection(section: string): string {
  return section
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, letter => letter.toUpperCase());
}

function formatOperation(operation: string): string {
  if (operation === 'replace') return 'replace';
  if (operation === 'remove') return 'remove from';
  return 'add to';
}
