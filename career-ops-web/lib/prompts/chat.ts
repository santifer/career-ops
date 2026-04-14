import { loadUserContext, buildSystemPrompt } from "./shared";

export async function buildChatPrompt(userId: string): Promise<string> {
  const ctx = await loadUserContext(userId);
  return buildSystemPrompt(ctx);
}
