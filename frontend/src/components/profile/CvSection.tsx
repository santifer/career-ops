import type { CandidateProfile } from '../../types/profile';
import type { Comment } from '../../types/comments';
import { highlightText } from '../comments/highlightText';

type Props = {
  cv: CandidateProfile['cv'];
  comments: Comment[];
};

export function CvSection({ cv, comments }: Props) {
  return (
    <div className="space-y-4">
      {cv.summary && (
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-muted">Summary</h3>
          <p className="text-sm leading-relaxed">{highlightText(cv.summary, comments)}</p>
        </div>
      )}

      {cv.experience.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-muted">Experience</h3>
          <div className="space-y-4">
            {cv.experience.map((exp, i) => (
              <div key={i}>
                <div className="text-sm font-medium">
                  {highlightText(`${exp.title}${exp.company ? ` at ${exp.company}` : ''}`, comments)}
                </div>
                {exp.dates && (
                  <div className="mt-0.5 text-sm text-muted">{highlightText(exp.dates, comments)}</div>
                )}
                {exp.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className="text-sm leading-relaxed text-muted">{highlightText(b, comments)}</li>
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
            <p key={i} className="text-sm">{highlightText(e, comments)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
