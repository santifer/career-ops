import { useState } from 'react';
import type { SearchSources } from '../../types/profile';
import type { Comment } from '../../types/comments';
import { highlightText } from '../comments/highlightText';

type Props = {
  sources: SearchSources;
  comments: Comment[];
};

export function SearchSourcesSection({ sources, comments }: Props) {
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const visibleKeywords = showAllKeywords
    ? sources.positiveKeywords
    : sources.positiveKeywords.slice(0, 15);
  const hiddenKeywordCount = sources.positiveKeywords.length - visibleKeywords.length;

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
                {highlightText(name, comments)}
              </span>
            ))}
          </div>
        </div>
      )}

      {sources.positiveKeywords.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Search keywords</h3>
          <div className="flex flex-wrap gap-1.5" id="search-keywords-list">
            {visibleKeywords.map(kw => (
              <span key={kw} className="rounded-md bg-primary/5 px-2 py-0.5 text-sm text-primary">
                {highlightText(kw, comments)}
              </span>
            ))}
            {hiddenKeywordCount > 0 && (
              <button
                type="button"
                aria-expanded={showAllKeywords}
                aria-controls="search-keywords-list"
                onClick={() => setShowAllKeywords(true)}
                className="rounded px-2 py-0.5 text-sm text-primary transition-colors duration-150 hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                +{hiddenKeywordCount} more
              </button>
            )}
            {showAllKeywords && sources.positiveKeywords.length > 15 && (
              <button
                type="button"
                aria-expanded={showAllKeywords}
                aria-controls="search-keywords-list"
                onClick={() => setShowAllKeywords(false)}
                className="rounded px-2 py-0.5 text-sm text-muted transition-colors duration-150 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Show less
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
