import { redirect } from "next/navigation";
import { CommandCenterClient } from "@/components/command-center/command-center-client";
import { getCurrentUser } from "@/lib/auth/session";
import { listAgentRuns } from "@/lib/db/queries/agent-runs";

export default async function CommandCenterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const runs = await listAgentRuns(user.id, 40);

  const initialRuns = runs.map((run) => ({
    id: run.id,
    mode: run.mode,
    status: run.status,
    cliLine: run.cliLine,
    promptBundle: run.promptBundle,
    subagentInstruction: run.subagentInstruction,
    userNotes: run.userNotes,
    errorMessage: run.errorMessage,
    createdAt: run.createdAt.toISOString(),
    events: [],
    artifacts: [],
  }));

  return <CommandCenterClient initialRuns={initialRuns} />;
}
