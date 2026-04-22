type AgentRunEvent = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type AgentRunArtifact = {
  id: string;
  kind: string;
  label: string;
  previewText: string | null;
};

export function AgentRunTimeline(props: {
  events: AgentRunEvent[];
  artifacts: AgentRunArtifact[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Timeline</h3>
        {props.events.length === 0 ? (
          <p className="text-sm text-neutral-500">No events yet.</p>
        ) : (
          props.events.map((event) => (
            <div
              key={event.id}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <p className="text-sm text-neutral-800">{event.message}</p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {new Date(event.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-800">Artifacts</h3>
        {props.artifacts.length === 0 ? (
          <p className="text-sm text-neutral-500">No artifacts yet.</p>
        ) : (
          props.artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2"
            >
              <p className="text-sm font-medium text-neutral-800">
                {artifact.label}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">
                {artifact.kind}
              </p>
              {artifact.previewText ? (
                <pre className="mt-2 overflow-x-auto rounded bg-neutral-50 p-2 text-xs text-neutral-700">
                  {artifact.previewText}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
