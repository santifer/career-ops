import { AgentWorkspace } from '../agent/AgentWorkspace';

export function RightPane() {
  return (
    <div className="flex w-[55%] flex-col bg-bg">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-2xl font-bold leading-[1.1]">Agent</h1>
        <p className="mt-1 text-sm text-muted">Your onboarding assistant</p>
      </div>

      {/* Agent workspace */}
      <AgentWorkspace />
    </div>
  );
}
