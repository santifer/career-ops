import type { SearchSources } from '../../types/profile';

type Props = {
  sources: SearchSources;
};

export function SearchSourcesSection({ sources }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex gap-6">
        <div>
          <div className="text-2xl font-bold">{sources.enabledCompanies}</div>
          <div className="text-sm text-muted">Active companies</div>
        </div>
        <div>
          <div className="text-2xl font-bold">{sources.totalCompanies}</div>
          <div className="text-sm text-muted">Total tracked</div>
        </div>
      </div>

      {sources.companyNames.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Top companies</h3>
          <div className="flex flex-wrap gap-1.5">
            {sources.companyNames.map(name => (
              <span key={name} className="rounded-md border border-border px-2 py-0.5 text-sm">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {sources.positiveKeywords.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Search keywords</h3>
          <div className="flex flex-wrap gap-1.5">
            {sources.positiveKeywords.slice(0, 15).map(kw => (
              <span key={kw} className="rounded-md bg-primary/5 px-2 py-0.5 text-sm text-primary">
                {kw}
              </span>
            ))}
            {sources.positiveKeywords.length > 15 && (
              <span className="px-2 py-0.5 text-sm text-muted">
                +{sources.positiveKeywords.length - 15} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
