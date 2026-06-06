import { useState, useRef } from 'react';
import type { Comment } from '../../types/comments';
import { CommentPopover } from './CommentPopover';

type Props = {
  text: string;
  comments: Comment[];
};

export function CommentHighlight({ text, comments }: Props) {
  const [showPopover, setShowPopover] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  function handleMouseEnter() {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(true), 200);
  }

  function handleMouseLeave() {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(false), 300);
  }

  return (
    <span className="relative inline">
      <span
        ref={spanRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="cursor-pointer bg-accent-subtle underline decoration-accent decoration-1 underline-offset-2 transition-colors duration-150 hover:bg-accent-subtle/80"
      >
        {text}
        <span className="ml-0.5 inline-block translate-y-[-2px] text-xs text-accent">
          &#x1F4DD;
        </span>
      </span>

      {showPopover && spanRef.current && (
        <CommentPopover
          comments={comments}
          anchorEl={spanRef.current}
          onMouseEnter={() => {
            clearTimeout(timeoutRef.current);
            setShowPopover(true);
          }}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </span>
  );
}
