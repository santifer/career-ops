import { useRef } from 'react';
import { useAppState, useAppDispatch } from '../../state/AppContext';
import { ProfileView } from '../profile/ProfileView';
import { ReadinessMeter } from '../profile/ReadinessMeter';
import { useTextSelection } from '../comments/useTextSelection';
import { SelectionPopover } from '../comments/SelectionPopover';

export function LeftPane() {
  const { comments, readiness } = useAppState();
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const { selection, clearSelection } = useTextSelection(containerRef);

  const pendingCount = comments.filter(c => c.status === 'pending').length;

  function handleSendComments() {
    if (pendingCount === 0) return;
    const batchId = crypto.randomUUID();

    // Gather the pending comments BEFORE dispatching (dispatch changes status)
    const pending = comments.filter(c => c.status === 'pending');

    dispatch({ type: 'SEND_COMMENTS', batchId });
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: crypto.randomUUID(),
        type: 'comment-batch',
        content: `${pending.length} comment${pending.length > 1 ? 's' : ''} sent from profile`,
        timestamp: Date.now(),
        comments: pending.map(c => ({ ...c, status: 'sent' as const, batchId })),
      },
    });
  }

  function handleSaveComment(commentText: string) {
    if (!selection) return;
    dispatch({
      type: 'ADD_COMMENT',
      comment: {
        id: crypto.randomUUID(),
        sectionId: selection.sectionId,
        selectedText: selection.selectedText,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        commentText,
        status: 'pending',
      },
    });
    clearSelection();
  }

  return (
    <div className="flex w-[45%] flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold leading-[1.1]">Your Profile</h1>
          <p className="mt-1 text-sm text-muted">What the agent knows about you</p>
        </div>
        <button
          onClick={handleSendComments}
          disabled={pendingCount === 0}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send comments
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Readiness */}
      <div className="border-b border-border px-6 py-4">
        <ReadinessMeter readiness={readiness} />
      </div>

      {/* Profile content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4">
        <ProfileView />
      </div>

      {/* Selection popover */}
      {selection && (
        <SelectionPopover
          selection={selection}
          onSave={handleSaveComment}
          onCancel={clearSelection}
        />
      )}
    </div>
  );
}
