export type Status =
  | 'Evaluated'
  | 'Applied'
  | 'Responded'
  | 'Interview'
  | 'Offer'
  | 'Rejected'
  | 'Discarded'
  | 'SKIP';

export interface Application {
  number: number;
  numberRaw: string;
  date: string;
  company: string;
  role: string;
  scoreRaw: string;
  score: number | null;
  status: Status | string;
  hasPdf: boolean;
  reportPath: string | null;
  reportLink: string | null;
  notes: string;
}

export interface ReportSummary {
  number: number;
  company: string;
  role: string;
  date: string;
  score: number | null;
  archetype: string | null;
  tldr: string | null;
  remote: string | null;
  comp: string | null;
  legitimacy: string | null;
  url: string | null;
  body: string;
}

export interface PipelineFilters {
  status?: string | null;
  search?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  sort?: 'date' | 'score' | 'company' | 'status';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface PipelineResponse {
  total: number;
  rows: Application[];
  stats: {
    byStatus: Record<string, number>;
    byScoreBucket: Record<string, number>;
  };
}
