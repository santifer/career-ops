import type { CandidateProfile } from '../../types/profile';

type Props = {
  cv: CandidateProfile['cv'];
};

export function CvSection({ cv }: Props) {
  return (
    <div className="space-y-4">
      {cv.summary && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Summary</h3>
          <p className="text-sm leading-relaxed">{cv.summary}</p>
        </div>
      )}

      {cv.experience.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">Experience</h3>
          <div className="space-y-4">
            {cv.experience.map((exp, i) => (
              <div key={i}>
                <div className="text-sm font-medium">
                  {exp.title}{exp.company ? ` at ${exp.company}` : ''}
                </div>
                {exp.dates && (
                  <div className="mt-0.5 text-sm text-muted">{exp.dates}</div>
                )}
                {exp.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className="text-sm leading-relaxed text-muted">{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cv.education.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Education</h3>
          {cv.education.map((e, i) => (
            <p key={i} className="text-sm">{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}
