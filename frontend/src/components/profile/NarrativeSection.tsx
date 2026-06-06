import type { CandidateProfile } from '../../types/profile';

type Props = {
  narrative: CandidateProfile['narrative'];
};

export function NarrativeSection({ narrative }: Props) {
  return (
    <div className="space-y-4">
      {narrative.headline && (
        <p className="text-base font-medium">{narrative.headline}</p>
      )}

      {narrative.exitStory && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Exit story</h3>
          <p className="text-sm leading-relaxed">{narrative.exitStory}</p>
        </div>
      )}

      {narrative.superpowers.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Superpowers</h3>
          <ul className="space-y-1">
            {narrative.superpowers.map((s, i) => (
              <li key={i} className="text-sm leading-relaxed">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {narrative.proofPoints.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Proof points</h3>
          <div className="space-y-2">
            {narrative.proofPoints.map(p => (
              <div key={p.name} className="rounded-lg border border-border p-3">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="mt-0.5 text-sm text-muted">{p.heroMetric}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
