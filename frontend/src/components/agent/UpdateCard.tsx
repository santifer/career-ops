import { useState } from 'react';
import { useAppDispatch } from '../../state/AppContext';
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
      className={`rounded-lg border p-4 transition-opacity duration-200 ${
        update.status === 'ignored'
          ? 'border-border bg-surface opacity-50'
          : update.status === 'accepted'
            ? 'border-success/30 bg-success-subtle'
            : 'border-border bg-bg'
      }`}
    >
      <div className="mb-1 text-xs font-medium text-muted">
        {update.status === 'accepted' ? 'Applied' : update.status === 'ignored' ? 'Dismissed' : 'Proposed update'}
      </div>

      <div className="mb-1 text-sm">
        <span className="font-medium">Section:</span>{' '}
        <span className="capitalize">{update.section}</span>
      </div>

      <div className="mb-1 text-sm">
        <span className="font-medium">Change:</span>{' '}
        {editing ? (
          <textarea
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none transition-colors duration-150 focus:border-primary"
            rows={2}
            autoFocus
          />
        ) : (
          <span>{update.status === 'edited' ? editValue : update.proposedValue}</span>
        )}
      </div>

      {update.reason && (
        <div className="mb-3 text-sm text-muted">
          <span className="font-medium text-ink">Reason:</span> {update.reason}
        </div>
      )}

      {!isResolved && (
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={handleAcceptEdited}
                className="rounded-md bg-success px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-success/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
              >
                Accept edit
              </button>
              <button
                onClick={() => { setEditing(false); setEditValue(update.proposedValue); }}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted transition-colors duration-150 hover:bg-surface"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleAccept}
                className="rounded-md border border-success px-3 py-1.5 text-sm font-medium text-success transition-colors duration-150 hover:bg-success hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success"
              >
                Accept
              </button>
              <button
                onClick={handleEdit}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors duration-150 hover:bg-primary-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Edit
              </button>
              <button
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
