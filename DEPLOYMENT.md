# Deployment Policy

This repository uses a single production deployment path:

- Push to `main`
- Vercel Git integration auto-deploys `dashboard-v2`
- Verify status in Vercel

Do not use manual `vercel deploy` for normal releases.

## Source of Truth

- **Deploy trigger:** Git push to `main`
- **Deployment platform:** Vercel (Git integration)
- **Build validation:** GitHub Actions (`Dashboard v2 Build Check`)
- **Production app root:** `dashboard-v2`

## Required Vercel Configuration

Keep these fixed in Vercel project settings:

- Connected repository is this repo
- Production branch is `main`
- Root directory is `dashboard-v2`
- Framework preset is Next.js
- Build command is `pnpm run build`

## Required Production Environment Variables

Set these in Vercel Production (and Preview if needed):

- `AUTH_SECRET`
- `DATABASE_URL`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `BREVO_API_KEY` (if signup/verification email is enabled)

## Release Flow

1. Merge or push code to `main`
2. Wait for:
   - GitHub Action: `Dashboard v2 Build Check` (build validation only)
   - Vercel deployment: Ready
3. Smoke-test:
   - `/login`
   - `/signup`
   - `/api/auth/providers`

## Troubleshooting

If GitHub build passes but Vercel fails:

- Check Vercel environment variables for the target environment
- Confirm Vercel root directory is still `dashboard-v2`
- Confirm the failed deployment corresponds to the latest commit

If Vercel is ready but GitHub deployment badge shows failed:

- This is usually an older failed deployment event
- Open Vercel project Deployments and verify latest deployment is Ready
