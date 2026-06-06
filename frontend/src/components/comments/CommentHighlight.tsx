import { useEffect, useRef, useState } from 'react';
import type { Comment } from '../../types/comments';
import { CommentPopover } from './CommentPopover';

type Props = {
  text: string;
  comments: Comment[];
};

export function CommentHighlight({ text, comments }: Props) {
  const [showPopover, setShowPopover] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setAnchorEl(spanRef.current);
    timeoutRef.current = setTimeout(() => setShowPopover(true), 200);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
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
      </span>

      {showPopover && anchorEl && (
        <CommentPopover
          comments={comments}
          anchorEl={anchorEl}
          onMouseEnter={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setShowPopover(true);
          }}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </span>
  );
}
