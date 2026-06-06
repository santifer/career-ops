import type { Comment } from '../../types/comments';
import { highlightText } from '../comments/highlightText';

type Props = {
  dealBreakers: string[];
  comments: Comment[];
};

export function DealbreakersSection({ dealBreakers, comments }: Props) {
  if (dealBreakers.length === 0) {
    return (
      <p className="text-sm italic text-muted">
        No deal-breakers set yet. Tell the agent what you won't accept in a role.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {dealBreakers.map((d, i) => (
        <li key={i} className="text-sm leading-relaxed">{highlightText(d, comments)}</li>
      ))}
    </ul>
  );
}
