import { AgentWorkspace } from '../agent/AgentWorkspace';

export function RightPane() {
  return (
    <section aria-label="Agent chat" className="flex min-h-[82svh] flex-col bg-bg lg:h-full lg:min-h-0">
      <div className="border-b border-border px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Onboarding agent</p>
            <h2 className="mt-1 text-2xl font-bold leading-[1.1]">Teach, review, approve</h2>
            <p className="mt-1 max-w-none text-sm text-muted">
              The agent proposes structured changes and waits for your approval.
            </p>
          </div>
          <span className="w-fit rounded-full bg-surface px-3 py-1 text-sm font-medium text-muted">
            Part 1 prototype
          </span>
        </div>
      </div>

      <AgentWorkspace />
    </section>
  );
}
