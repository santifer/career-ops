export interface FollowupCardData {
  num: number;
  date: string;
  company: string;
  role: string;
  status: string;
  statusDisplay: string;
  score: string | null;
  notes: string;
  appliedDate: string | null;
  daysSinceApplication: number | null;
  daysUntilNext: number | null;
  followupCount: number;
  urgency: string;
  contacts: string[];
}

const STATUS_DISPLAY: Record<string, string> = {
  evaluated: 'Evaluated',
  applied: 'Applied',
  responded: 'Responded',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  discarded: 'Discarded',
  skip: 'SKIP',
};

export function normalizeStatus(s: string): string {
  const lower = s.toLowerCase();
  return STATUS_DISPLAY[lower] ?? s;
}

function urgencyRank(u: string): number {
  switch (u) {
    case 'urgent': return 0;
    case 'overdue': return 1;
    case 'waiting': return 2;
    case 'cold': return 3;
    default: return 4;
  }
}

export function sortFollowups(entries: FollowupCardData[]): FollowupCardData[] {
  return [...entries].sort((a, b) => {
    const ao = urgencyRank(a.urgency);
    const bo = urgencyRank(b.urgency);
    if (ao !== bo) return ao - bo;
    const ad = a.daysUntilNext ?? 0;
    const bd = b.daysUntilNext ?? 0;
    return ad - bd;
  });
}
