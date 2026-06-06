import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppDispatch } from '../../state/AppContext';
import type { Comment } from '../../types/comments';

type Props = {
  comments: Comment[];
  anchorEl: HTMLElement;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
};

export function CommentPopover({ comments, anchorEl, onMouseEnter, onMouseLeave }: Props) {
  const dispatch = useAppDispatch();
  const rect = anchorEl.getBoundingClientRect();

  const top = rect.bottom + window.scrollY + 4;
  const left = rect.left + rect.width / 2;

  return createPortal(
    <div
      data-popover
      className="z-popover fixed -translate-x-1/2"
      style={{ top: `${top}px`, left: `${left}px` }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="w-64 rounded-lg border border-border bg-bg p-3 shadow-sm">
        {comments.map(comment => (
          <CommentEntry key={comment.id} comment={comment} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function CommentEntry({ comment }: { comment: Comment }) {
  const dispatch = useAppDispatch();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(comment.commentText);

  function handleSave() {
    dispatch({ type: 'UPDATE_COMMENT', id: comment.id, commentText: text });
    setEditing(false);
  }

  function handleDelete() {
    dispatch({ type: 'DELETE_COMMENT', id: comment.id });
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted">
        {comment.status === 'sent' ? 'Sent to agent' : 'Draft comment'}
      </div>

      {editing ? (
        <div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={2}
            autoFocus
            className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              onClick={() => { setEditing(false); setText(comment.commentText); }}
              className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-hover"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm leading-relaxed">{comment.commentText}</p>
          {comment.status === 'pending' && (
            <div className="mt-1.5 flex gap-1.5">
              <button
                onClick={() => setEditing(true)}
                className="rounded px-2 py-1 text-xs font-medium text-primary hover:bg-primary-subtle"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="rounded px-2 py-1 text-xs font-medium text-muted hover:text-error"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
