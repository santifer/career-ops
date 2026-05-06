import { ArrowRight, X, MapPin, ExternalLink } from "lucide-react";
import type { DiscoveredJob } from "@/lib/types";

export function JobCard({ job, onSendToPipeline, onDismiss }: {
  job: DiscoveredJob;
  onSendToPipeline: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const postedAgo = job.postedAt
    ? `${Math.floor((Date.now() - new Date(job.postedAt).getTime()) / (1000 * 60 * 60 * 24))}d ago` : "";

  return (
    <div className="p-4 rounded-lg border bg-card flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate">{job.title}</h3>
          <p className="text-sm text-muted-foreground">{job.company}</p>
        </div>
        <a href={job.url} target="_blank" rel="noopener noreferrer" aria-label="Open job posting" className="shrink-0 ml-2">
          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
        </a>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {job.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {job.location}</span>}
        {postedAgo && <span>{postedAgo}</span>}
      </div>
      <div className="flex items-center justify-end gap-2 mt-auto pt-2">
        <button onClick={() => onDismiss(job.id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent transition-colors">
          <X className="h-4 w-4" /> Dismiss
        </button>
        <button onClick={() => onSendToPipeline(job.id)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <ArrowRight className="h-4 w-4" /> Evaluate
        </button>
      </div>
    </div>
  );
}
