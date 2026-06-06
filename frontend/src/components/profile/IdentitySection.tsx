import type { CandidateProfile } from '../../types/profile';

type Props = {
  identity: CandidateProfile['identity'];
  location: CandidateProfile['location'];
};

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-1">
      <span className="w-28 shrink-0 text-sm font-medium text-muted">{label}</span>
      <span className="text-sm">{value}</span>
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

export function IdentitySection({ identity, location }: Props) {
  return (
    <div className="space-y-0">
      <Field label="Name" value={identity.name} />
      <Field label="Email" value={identity.email} />
      {identity.phone ? <Field label="Phone" value={identity.phone} /> : <EmptyField label="Phone" />}
      <Field label="Location" value={identity.location} />
      <Field label="Timezone" value={identity.timezone || location.timezone} />
      <Field label="Languages" value={identity.languages.join(', ')} />
      {identity.linkedin ? <Field label="LinkedIn" value={identity.linkedin} /> : <EmptyField label="LinkedIn" />}
      {identity.portfolio ? <Field label="Portfolio" value={identity.portfolio} /> : <EmptyField label="Portfolio" />}
      {identity.github ? <Field label="GitHub" value={identity.github} /> : <EmptyField label="GitHub" />}
      {location.visaStatus && <Field label="Visa" value={location.visaStatus} />}
    </div>
  );
}
