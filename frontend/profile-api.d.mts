import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ProfileApiMiddleware = (req: IncomingMessage, res: ServerResponse) => void;

export function createProfileApiMiddleware(options?: {
  profileBuilder?: () => unknown;
}): ProfileApiMiddleware;

export function profileApiPlugin(): Plugin;
