import { useRef } from 'react';
import { useAppState, useAppDispatch } from '../../state/useAppContext';
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
  const sentCount = comments.filter(c => c.status === 'sent').length;

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
    <section
      aria-label="Candidate profile"
      className="flex min-h-[78svh] flex-col border-b border-border bg-surface lg:h-full lg:min-h-0 lg:border-b-0 lg:border-r"
    >
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Living candidate profile</p>
            <h2 className="mt-1 text-2xl font-bold leading-[1.1]">What the agent knows about me</h2>
            <p className="mt-1 max-w-none text-sm text-muted">
              Loaded from your CV, profile, personalization notes, and scanner sources.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSendComments}
            disabled={pendingCount === 0}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
          >
            Send comments
            {pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        <div
          className="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-muted"
          aria-live="polite"
        >
          {pendingCount > 0 ? (
            <span>
              {pendingCount} draft comment{pendingCount > 1 ? 's' : ''} ready to send
              {sentCount > 0 ? `, ${sentCount} waiting for proposed updates` : ''}.
            </span>
          ) : (
            <span>Highlight any phrase in the profile, then add a comment to teach the agent how to frame it.</span>
          )}
        </div>
      </div>

      <div className="border-b border-border px-4 py-4 sm:px-6">
        <ReadinessMeter readiness={readiness} />
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <ProfileView />
      </div>

      {selection && (
        <SelectionPopover
          selection={selection}
          onSave={handleSaveComment}
          onCancel={clearSelection}
        />
      )}
    </section>
  );
}
