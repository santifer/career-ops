# Career-Ops Frontend

This Vite app renders the local career-ops profile UI.

## Runtime Profile API

`npm run dev` starts Vite and serves a read-only local endpoint:

```text
GET /api/profile
```

The endpoint reads the current career-ops files on each request, parses them server-side, and returns the normalized `CandidateProfile` JSON shape that the React app already uses.

Runtime sources:

- `cv.md`
- `config/profile.yml`
- `modes/_profile.md`
- `portals.yml`
- `article-digest.md`

The frontend initializes from `src/data/seed.ts` so the UI can render immediately, then fetches `/api/profile` and replaces the fallback state with live data when the local API is available.

## Fallback Seed

`prebuild.mjs` is a thin fallback generator. It calls the shared parser in `profile-data.mjs` and writes `src/data/seed.ts`.

Static builds still use the bundled seed unless a backend serving `/api/profile` is available. During local development, reload the browser after editing source career-ops files to see the latest parsed profile.

## Verification

```bash
npm run test
npm run lint
npm run build
```
