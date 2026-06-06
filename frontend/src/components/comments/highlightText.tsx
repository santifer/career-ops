import type { ReactNode } from 'react';
import type { Comment } from '../../types/comments';
import { CommentHighlight } from './CommentHighlight';

/**
 * Takes a plain text string and an array of comments for this section,
 * returns JSX with highlighted spans for commented text.
 */
export function highlightText(
  text: string,
  comments: Comment[],
): ReactNode {
  const active = comments
    .filter(c => c.status !== 'resolved')
    .map(c => toLocalComment(c, text))
    .filter(c => c !== null)
    .sort((a, b) => a.startOffset - b.startOffset);

  if (active.length === 0) {
    return text;
  }

  // Merge overlapping ranges
  const merged = mergeRanges(active);

  const parts: ReactNode[] = [];
  let lastEnd = 0;

  for (const group of merged) {
    // Text before this highlight
    if (group.start > lastEnd) {
      parts.push(text.slice(lastEnd, group.start));
    }

    // Highlighted text
    const highlightedText = text.slice(group.start, group.end);
    parts.push(
      <CommentHighlight
        key={group.comments[0].id}
        text={highlightedText}
        comments={group.comments}
      />,
    );

    lastEnd = group.end;
  }

  // Remaining text
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return <>{parts}</>;
}

function toLocalComment(comment: Comment, text: string): Comment | null {
  const selectedText = comment.selectedText.trim();
  if (!selectedText) return null;

  const selectedIndex = text.indexOf(selectedText);
  if (selectedIndex >= 0) {
    return {
      ...comment,
      startOffset: selectedIndex,
      endOffset: selectedIndex + selectedText.length,
    };
  }

  if (comment.startOffset >= 0 && comment.endOffset <= text.length && comment.startOffset < comment.endOffset) {
    return comment;
  }

  return null;
}

interface MergedRange {
  start: number;
  end: number;
  comments: Comment[];
}

function mergeRanges(comments: Comment[]): MergedRange[] {
  if (comments.length === 0) return [];

  const ranges: MergedRange[] = [{
    start: comments[0].startOffset,
    end: comments[0].endOffset,
    comments: [comments[0]],
  }];

  for (let i = 1; i < comments.length; i++) {
    const c = comments[i];
    const last = ranges[ranges.length - 1];

    if (c.startOffset <= last.end) {
      // Merge overlapping ranges.
      last.end = Math.max(last.end, c.endOffset);
      last.comments.push(c);
    } else {
      ranges.push({
        start: c.startOffset,
        end: c.endOffset,
        comments: [c],
      });
    }
  }

  return ranges;
}
