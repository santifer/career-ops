import type { CandidateProfile } from '../../types/profile';

type Props = {
  targeting: CandidateProfile['targeting'];
  profileMd: CandidateProfile['profileMd'];
};

const fitColors: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-accent/10 text-accent',
};

export function TargetRolesSection({ targeting, profileMd }: Props) {
  return (
    <div className="space-y-4">
      {/* Primary roles */}
      <div className="flex flex-wrap gap-2">
        {targeting.primaryRoles.map(role => (
          <span key={role} className="rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
            {role}
          </span>
        ))}
      </div>

      {/* Archetypes table */}
      {targeting.archetypes.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg/50">
                <th className="px-3 py-2 text-left font-medium text-muted">Archetype</th>
                <th className="px-3 py-2 text-left font-medium text-muted">Level</th>
                <th className="px-3 py-2 text-left font-medium text-muted">Fit</th>
              </tr>
            </thead>
            <tbody>
              {targeting.archetypes.map(a => (
                <tr key={a.name} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{a.name}</td>
                  <td className="px-3 py-2 text-muted">{a.level}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${fitColors[a.fit] || 'bg-border text-muted'}`}>
                      {a.fit}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Profile archetypes with context */}
      {profileMd.archetypes.length > 0 && (
        <div className="space-y-2">
          {profileMd.archetypes.map(a => (
            <div key={a.name} className="rounded-lg border border-border p-3">
              <div className="font-medium">{a.name}</div>
              <div className="mt-1 text-sm text-muted">{a.whatTheyBuy}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
