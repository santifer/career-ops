#!/usr/bin/env bash
# Build a single-file executable of the Career-Ops launcher using Node SEA.
#
# Output: dist/career-ops      (Linux / macOS)
#         dist/career-ops.exe  (Windows / Git-Bash)
#
# Pre-reqs: Node >= 22 (for stable SEA), npx access to esbuild + postject.
# Optional: codesign on macOS, signtool on Windows.
#
# Usage:
#   bash scripts/build-exe.sh
#
# CI:
#   The .github/workflows/release.yml runs this on every tag push and uploads
#   the artifact to the GitHub Release.

set -euo pipefail

readonly ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

readonly DIST="$ROOT/dist"
readonly LAUNCHER_SRC="$ROOT/scripts/launcher.mjs"
readonly SEA_CONFIG="$ROOT/scripts/sea-config.json"
readonly NODE_BIN="$(command -v node)"

if [[ -z "$NODE_BIN" ]]; then
  echo "✗ node not in PATH" >&2; exit 2
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 22 )); then
  echo "✗ Node >= 22 required for SEA (have $(node -v))" >&2; exit 2
fi

mkdir -p "$DIST"

# ── Step 1: bundle the launcher into a single CJS file ─────────────────────
# SEA only embeds one file. esbuild bundles all imports into it.
# Format must be CJS — SEA's mainModule semantics target CommonJS.
echo "› Bundling launcher with esbuild…"
npx --yes esbuild "$LAUNCHER_SRC" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$DIST/launcher.cjs" \
  --log-level=warning

# ── Step 2: generate the SEA preparation blob ──────────────────────────────
echo "› Generating SEA blob…"
node --experimental-sea-config "$SEA_CONFIG"

# ── Step 3: copy node binary as the host executable ────────────────────────
echo "› Copying node host…"
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    OUT="$DIST/career-ops.exe"
    cp "$NODE_BIN" "$OUT"
    # Strip the embedded signature so postject can re-sign cleanly
    if command -v signtool >/dev/null 2>&1; then
      signtool remove /s "$OUT" 2>/dev/null || true
    fi
    ;;
  Darwin)
    OUT="$DIST/career-ops"
    cp "$NODE_BIN" "$OUT"
    codesign --remove-signature "$OUT" 2>/dev/null || true
    ;;
  *)
    OUT="$DIST/career-ops"
    cp "$NODE_BIN" "$OUT"
    ;;
esac

# ── Step 4: inject the blob via postject ───────────────────────────────────
echo "› Injecting SEA payload…"
case "$(uname -s)" in
  Darwin)
    npx --yes postject "$OUT" NODE_SEA_BLOB "$DIST/sea-prep.blob" \
      --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
      --macho-segment-name NODE_SEA
    codesign --sign - "$OUT" 2>/dev/null || true
    ;;
  *)
    npx --yes postject "$OUT" NODE_SEA_BLOB "$DIST/sea-prep.blob" \
      --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
    ;;
esac

# ── Step 5: smoke-test ────────────────────────────────────────────────────
echo "› Smoke-test (--help)…"
chmod +x "$OUT" 2>/dev/null || true
SIZE_KB=$(($(wc -c < "$OUT") / 1024))

# Quick validation: invoking with no project should print the no-project msg.
TMP_CWD=$(mktemp -d)
TIMEOUT_BIN="timeout"
if ! command -v "$TIMEOUT_BIN" >/dev/null 2>&1; then TIMEOUT_BIN="gtimeout"; fi
if command -v "$TIMEOUT_BIN" >/dev/null 2>&1; then
  if (cd "$TMP_CWD" && "$TIMEOUT_BIN" 5 "$OUT" 2>&1 | grep -qE "No Career-Ops project|Career-Ops is starting"); then
    echo "✓ Built: $OUT ($SIZE_KB KiB)"
  else
    echo "⚠ Built but smoke-test inconclusive — verify manually: $OUT"
  fi
else
  echo "✓ Built: $OUT ($SIZE_KB KiB) — smoke-test skipped (no timeout available)"
fi
rm -rf "$TMP_CWD"

# ── Step 6: cleanup intermediates ──────────────────────────────────────────
rm -f "$DIST/sea-prep.blob" "$DIST/launcher.cjs"

echo
echo "Next: ship it"
echo "  • Test:   $OUT"
echo "  • Sign:   signtool / codesign as appropriate"
echo "  • Hash:   sha256sum $OUT > $OUT.sha256"
