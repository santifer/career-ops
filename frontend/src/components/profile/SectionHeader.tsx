type Props = {
  title: string;
  source?: string;
  commentCount?: number;
};

export function SectionHeader({ title, source, commentCount = 0 }: Props) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {source && (
          <span className="text-sm font-medium text-muted">{source}</span>
        )}
      </div>
      {commentCount > 0 && (
        <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-bold text-accent">
          {commentCount} comment{commentCount > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
