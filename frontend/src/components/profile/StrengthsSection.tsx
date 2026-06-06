import type { CandidateProfile, ProofPointSection } from '../../types/profile';

type Props = {
  strengths: CandidateProfile['strengths'];
  proofPoints: ProofPointSection[];
};

export function StrengthsSection({ strengths, proofPoints }: Props) {
  return (
    <div className="space-y-4">
      {/* Skills by category */}
      {Object.entries(strengths.skills).length > 0 && (
        <div className="space-y-3">
          {Object.entries(strengths.skills).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-1.5 text-sm font-semibold text-muted">{category}</h3>
              <div className="flex flex-wrap gap-1.5">
                {items.map(skill => (
                  <span key={skill} className="rounded-md border border-border px-2 py-0.5 text-sm">
                    {skill}
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
              <li key={i} className="text-sm leading-relaxed">{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Proof point sections */}
      {proofPoints.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Proof points</h3>
          <div className="space-y-3">
            {proofPoints.slice(0, 3).map(section => (
              <div key={section.section}>
                <div className="mb-1 text-sm font-medium">{section.section}</div>
                <ul className="space-y-0.5">
                  {section.bullets.slice(0, 4).map((b, i) => (
                    <li key={i} className="text-sm leading-relaxed text-muted">{b}</li>
                  ))}
                  {section.bullets.length > 4 && (
                    <li className="text-sm italic text-muted">
                      +{section.bullets.length - 4} more
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
