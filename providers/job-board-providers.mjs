import { a16zProvider } from './job-board-a16z.mjs';

export const JOB_BOARD_PROVIDERS = Object.freeze({
  [a16zProvider.id]: a16zProvider,
});

export function getJobBoardProvider(providerId) {
  if (typeof providerId !== 'string') return null;
  return JOB_BOARD_PROVIDERS[providerId.trim()] || null;
}
