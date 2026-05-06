export interface Application {
  id: string;
  number: number;
  company: string;
  role: string;
  score: string | null;
  status: string;
  url: string | null;
  reportPath: string | null;
  pdfGenerated: boolean;
  notes: string | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  applicationId: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  source: string;
}

export interface ApplicationDetail extends Application {
  statusHistory: StatusHistoryEntry[];
}

export interface DiscoveredJob {
  id: string;
  title: string;
  company: string;
  url: string;
  sourceId: string | null;
  location: string | null;
  postedAt: string | null;
  rawData: unknown;
  status: string;
  createdAt: string;
}

export interface Source {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
  jobCount: number;
}

export interface PipelineColumn {
  status: string;
  applications: Application[];
}

export interface PipelineData {
  columns: PipelineColumn[];
  archive: Application[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AppStats {
  byStatus: Record<string, number>;
  avgScore: number | null;
  totalCount: number;
}
