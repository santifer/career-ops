import { useState } from 'react';
import type { CandidateProfile, ProofPointSection } from '../../types/profile';
import type { Comment } from '../../types/comments';
import { highlightText } from '../comments/highlightText';

type Props = {
  strengths: CandidateProfile['strengths'];
  proofPoints: ProofPointSection[];
  comments: Comment[];
};

export function StrengthsSection({ strengths, proofPoints, comments }: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set());

  function toggleSection(section: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Skills by category */}
      {Object.entries(strengths.skills).length > 0 && (
        <div className="space-y-3">
          {Object.entries(strengths.skills).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-1.5 text-sm font-semibold text-muted">{highlightText(category, comments)}</h3>
              <div className="flex flex-wrap gap-1.5">
                {items.map(skill => (
                  <span key={skill} className="rounded-md border border-border px-2 py-0.5 text-sm">
                    {highlightText(skill, comments)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Key strengths */}
      {strengths.keyStrengths.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Key strengths</h3>
          <ul className="space-y-1">
            {strengths.keyStrengths.map((s, i) => (
              <li key={i} className="text-sm leading-relaxed">{highlightText(s, comments)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proof point sections */}
      {proofPoints.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Proof points</h3>
          <div className="space-y-3">
            {proofPoints.slice(0, 3).map(section => {
              const isExpanded = expandedSections.has(section.section);
              const visibleBullets = isExpanded ? section.bullets : section.bullets.slice(0, 4);
              const hiddenCount = section.bullets.length - visibleBullets.length;
              const listId = `proof-points-${section.section.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;

              return (
                <div key={section.section}>
                  <div className="mb-1 text-sm font-medium" id={`${listId}-title`}>
                    {highlightText(section.section, comments)}
                  </div>
                  <ul className="space-y-0.5" id={listId}>
                    {visibleBullets.map((b, i) => (
                      <li key={i} className="text-sm leading-relaxed text-muted">{highlightText(b, comments)}</li>
                    ))}
                    {hiddenCount > 0 && (
                      <li>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={listId}
                          aria-labelledby={`${listId}-title ${listId}-toggle`}
                          id={`${listId}-toggle`}
                          onClick={() => toggleSection(section.section)}
                          className="rounded text-sm italic text-primary underline-offset-2 transition-colors duration-150 hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          +{hiddenCount} more
                        </button>
                      </li>
                    )}
                    {isExpanded && section.bullets.length > 4 && (
                      <li>
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={listId}
                          onClick={() => toggleSection(section.section)}
                          className="rounded text-sm italic text-muted underline-offset-2 transition-colors duration-150 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          Show less
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
