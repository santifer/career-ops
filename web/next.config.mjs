/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to THIS dir. Otherwise, if a package-lock.json exists
  // one level up (e.g. after `npm install` at the repo root, needed by the core
  // CLI/scanner), Turbopack infers the PARENT as the workspace root and tries to
  // watch/compile the entire tree (its node_modules, .git, output/) — a runaway
  // multi-GB memory blowup. Pinning here keeps dev scoped to web/.
  turbopack: { root: import.meta.dirname },
  // Allow a throwaway build dir (e.g. BUILD_DIST=.next-prod) so a production
  // `next build` can run without clobbering a live `next dev` .next.
  ...(process.env.BUILD_DIST ? { distDir: process.env.BUILD_DIST } : {}),
};

export default nextConfig;
