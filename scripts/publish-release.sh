#!/usr/bin/env bash
# Publish a public GitHub repo + tagged release with the EXE attached.
#
# Idempotent — safe to re-run. Checks for existing repo / tag and updates
# instead of duplicating.
#
# Usage:
#   bash scripts/publish-release.sh                  # repo: career-ops, tag: package.json version
#   bash scripts/publish-release.sh -r my-repo       # custom repo name
#   bash scripts/publish-release.sh -t v1.4.0        # custom tag
#   bash scripts/publish-release.sh --private        # create as private (default: public)
#   bash scripts/publish-release.sh --skip-exe       # skip EXE build (faster)
#
# Pre-flight:
#   gh auth login        # required, runs gh repo create + release create
#   git config user.*    # required for the initial commit if needed

set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── Args ────────────────────────────────────────────────────────────────────
REPO_NAME="career-ops"
TAG=""
VISIBILITY="--public"
BUILD_EXE=1
DESCRIPTION="JobSeeker · Career-Ops — AI-powered senior-level job-search pipeline. Drop your resume, the AI handles the boring parts."

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r|--repo)     REPO_NAME="$2"; shift 2 ;;
    -t|--tag)      TAG="$2"; shift 2 ;;
    --private)     VISIBILITY="--private"; shift ;;
    --public)      VISIBILITY="--public"; shift ;;
    --skip-exe)    BUILD_EXE=0; shift ;;
    -h|--help)     sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "✗ Unknown flag: $1" >&2; exit 2 ;;
  esac
done

# ── Pre-flight ──────────────────────────────────────────────────────────────
echo "› Pre-flight checks…"

command -v gh >/dev/null   || { echo "✗ gh CLI required. Install: https://cli.github.com" >&2; exit 2; }
command -v git >/dev/null  || { echo "✗ git required" >&2; exit 2; }
command -v node >/dev/null || { echo "✗ node required" >&2; exit 2; }

if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh not authenticated. Run: gh auth login" >&2
  exit 2
fi

OWNER="$(gh api user --jq .login)"
echo "  Owner:    $OWNER"
echo "  Repo:     $OWNER/$REPO_NAME"

# Resolve tag from package.json if not provided
if [[ -z "$TAG" ]]; then
  TAG="v$(node -p "require('./package.json').version")"
fi
echo "  Tag:      $TAG"
echo "  Public:   $([[ "$VISIBILITY" == "--public" ]] && echo yes || echo no)"

# ── Secret scan — refuse to publish if anything looks like an API key ──────
echo "› Scanning tracked files for secrets…"
SECRET_HITS=$(git ls-files | xargs grep -lEn \
  'sk-ant-[a-zA-Z0-9_-]{40,}|sk-or-v1-[a-zA-Z0-9_-]{40,}|sk-kimi-[a-zA-Z0-9_-]{40,}|AIza[0-9A-Za-z_-]{30,}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}' \
  2>/dev/null || true)
if [[ -n "$SECRET_HITS" ]]; then
  echo "✗ Possible secrets detected in tracked files:" >&2
  echo "$SECRET_HITS" >&2
  echo "  Move them to .env (gitignored) before publishing." >&2
  exit 3
fi
echo "  ✓ Clean"

# ── .env safety ─────────────────────────────────────────────────────────────
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "✗ .env is tracked! Remove it: git rm --cached .env" >&2
  exit 3
fi

# ── Initial commit if repo is fresh ────────────────────────────────────────
if [[ ! -d .git ]]; then
  echo "› Initializing git repo…"
  git init -b main
fi
if ! git rev-parse HEAD >/dev/null 2>&1; then
  echo "› Creating initial commit…"
  git add -A
  git commit -m "chore: initial public release of Career-Ops"
fi

# ── Build EXE ───────────────────────────────────────────────────────────────
if (( BUILD_EXE )); then
  echo "› Building career-ops.exe…"
  bash scripts/build-exe.sh
fi

# ── Create or update GitHub repo ───────────────────────────────────────────
if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "› Repo exists at $OWNER/$REPO_NAME — updating remote"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/$OWNER/$REPO_NAME.git"
else
  echo "› Creating $VISIBILITY repo $OWNER/$REPO_NAME…"
  gh repo create "$REPO_NAME" $VISIBILITY \
    --description "$DESCRIPTION" \
    --homepage "https://santifer.io" \
    --source=. \
    --push \
    --remote=origin
  # Repo is created + pushed in one step; skip the explicit push below
  PUSHED=1
fi

# ── Push (if not already pushed by gh repo create) ─────────────────────────
if [[ -z "${PUSHED:-}" ]]; then
  echo "› Pushing main…"
  git push -u origin main
fi

# ── Tag + release ──────────────────────────────────────────────────────────
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "› Tag $TAG already exists locally"
else
  echo "› Creating tag $TAG…"
  git tag -a "$TAG" -m "Release $TAG"
fi

if git ls-remote --tags origin "$TAG" 2>/dev/null | grep -q "$TAG"; then
  echo "› Tag $TAG already exists on remote"
else
  git push origin "$TAG"
fi

# Compose release notes from CHANGELOG.md if present
NOTES_FILE=""
if [[ -f CHANGELOG.md ]]; then
  NOTES_FILE="CHANGELOG.md"
fi

# Create or update the release
if gh release view "$TAG" --repo "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  echo "› Release $TAG exists — updating assets"
else
  echo "› Creating release $TAG…"
  if [[ -n "$NOTES_FILE" ]]; then
    gh release create "$TAG" --repo "$OWNER/$REPO_NAME" \
      --title "JobSeeker $TAG" \
      --notes-file "$NOTES_FILE"
  else
    gh release create "$TAG" --repo "$OWNER/$REPO_NAME" \
      --title "JobSeeker $TAG" \
      --generate-notes
  fi
fi

# ── Upload assets ──────────────────────────────────────────────────────────
if (( BUILD_EXE )) && [[ -f dist/career-ops.exe ]]; then
  echo "› Uploading career-ops.exe…"
  sha256sum dist/career-ops.exe | awk '{print $1}' > dist/career-ops.exe.sha256 2>/dev/null \
    || shasum -a 256 dist/career-ops.exe | awk '{print $1}' > dist/career-ops.exe.sha256
  gh release upload "$TAG" dist/career-ops.exe dist/career-ops.exe.sha256 \
    --clobber --repo "$OWNER/$REPO_NAME"
fi

# Source bundle (zip + tar)
echo "› Bundling source archive…"
git archive --format=tar.gz --prefix="career-ops-${TAG#v}/" -o "dist/career-ops-${TAG}.tar.gz" "$TAG"
gh release upload "$TAG" "dist/career-ops-${TAG}.tar.gz" --clobber --repo "$OWNER/$REPO_NAME"

URL="https://github.com/$OWNER/$REPO_NAME/releases/tag/$TAG"
echo
echo "✓ Released: $URL"
echo "  Repo:    https://github.com/$OWNER/$REPO_NAME"
echo "  Clone:   git clone https://github.com/$OWNER/$REPO_NAME.git"
echo "  Install: bash install.sh"
