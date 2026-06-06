import { buildProfile } from './profile-data.mjs';

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export function createProfileApiMiddleware({ profileBuilder = buildProfile } = {}) {
  return (req, res) => {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: 'method_not_allowed', message: 'Only GET is supported.' });
      return;
    }

    try {
      sendJson(res, 200, profileBuilder());
    } catch (error) {
      sendJson(res, 500, {
        error: 'profile_read_failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

export function profileApiPlugin() {
  return {
    name: 'career-ops-profile-api',
    configureServer(server) {
      server.middlewares.use('/api/profile', createProfileApiMiddleware());
    },
  };
}
