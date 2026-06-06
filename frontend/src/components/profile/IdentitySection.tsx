import type { CandidateProfile } from '../../types/profile';
import type { Comment } from '../../types/comments';
import { highlightText } from '../comments/highlightText';

type Props = {
  identity: CandidateProfile['identity'];
  location: CandidateProfile['location'];
  comments: Comment[];
};

function Field({ label, value, comments }: { label: string; value: string; comments: Comment[] }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-1">
      <span className="w-28 shrink-0 text-sm font-medium text-muted">{label}</span>
      <span className="min-w-0 break-words text-sm">{highlightText(value, comments)}</span>
    </div>
  );
}

function EmptyField({ label }: { label: string }) {
  return (
    <div className="flex gap-2 py-1">
      <span className="w-28 shrink-0 text-sm font-medium text-muted">{label}</span>
      <span className="text-sm italic text-muted">Not set</span>
    </div>
  );
}

export function IdentitySection({ identity, location, comments }: Props) {
  return (
    <div className="space-y-0">
      <Field label="Name" value={identity.name} comments={comments} />
      <Field label="Email" value={identity.email} comments={comments} />
      {identity.phone ? <Field label="Phone" value={identity.phone} comments={comments} /> : <EmptyField label="Phone" />}
      <Field label="Location" value={identity.location} comments={comments} />
      <Field label="Timezone" value={identity.timezone || location.timezone} comments={comments} />
      <Field label="Languages" value={identity.languages.join(', ')} comments={comments} />
      {identity.linkedin ? <Field label="LinkedIn" value={identity.linkedin} comments={comments} /> : <EmptyField label="LinkedIn" />}
      {identity.portfolio ? <Field label="Portfolio" value={identity.portfolio} comments={comments} /> : <EmptyField label="Portfolio" />}
      {identity.substack ? <Field label="Substack" value={identity.substack} comments={comments} /> : <EmptyField label="Substack" />}
      {identity.github ? <Field label="GitHub" value={identity.github} comments={comments} /> : <EmptyField label="GitHub" />}
      {location.visaStatus && <Field label="Visa" value={location.visaStatus} comments={comments} />}
    </div>
  );
}
