import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { importJWK, SignJWT } from "jose";

// ── Core minting function (importable) ───────────────────────────────────────
//
// Mints a career_ops_cron JWT signed with the given ES256 private JWK.
//
// @param {object} opts
//   jwk        — EC private JWK object (key_ops/use/ext will be stripped)
//   kid        — key ID; defaults to jwk.kid (required if jwk has no kid)
//   expSeconds — token lifetime in seconds; default 30 days
// @returns {Promise<string>} signed JWT
//
export async function mintCronJwt({ jwk, kid, expSeconds = 60 * 60 * 24 * 30 } = {}) {
  if (!jwk || jwk.kty !== "EC") {
    throw new Error("mintCronJwt: expected an EC private JWK");
  }

  const resolvedKid = kid ?? jwk.kid;
  if (!resolvedKid) {
    throw new Error("mintCronJwt: no kid in JWK and none provided");
  }

  // Strip key_ops/use/ext: Web Crypto rejects an ECDSA private key import that
  // carries verify in key_ops. jose only needs the core EC fields + the ES256 alg.
  const { key_ops, use, ext, ...cleanJwk } = jwk;

  const privateKey = await importJWK(cleanJwk, "ES256");

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expSeconds;

  return new SignJWT({ role: "career_ops_cron" })
    .setProtectedHeader({ alg: "ES256", kid: resolvedKid, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(privateKey);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
//
// Usage (file path — classic local path):
//   node mint-cron-jwt.mjs <path-to-signing-key.json> [kid] [--exp-seconds N] [--exp-minutes N]
//
// Usage (env var — CI/Actions path, key never written to disk):
//   CAREER_OPS_SIGNING_KEY='<full JWK JSON>' node mint-cron-jwt.mjs --exp-seconds 600
//
// Flags:
//   --exp-seconds <n>  Override token lifetime in seconds.
//   --exp-minutes <n>  Override token lifetime in minutes.
//
// Only the JWT goes to stdout; all other output goes to stderr.
//

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = process.argv.slice(2);

  // Parse --exp-seconds / --exp-minutes flags
  let expSeconds = 60 * 60 * 24 * 30; // 30-day default
  const expSecondsIdx = args.indexOf("--exp-seconds");
  const expMinutesIdx = args.indexOf("--exp-minutes");
  if (expSecondsIdx !== -1) {
    const n = Number(args[expSecondsIdx + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      console.error("--exp-seconds requires a positive number");
      process.exit(1);
    }
    expSeconds = n;
    args.splice(expSecondsIdx, 2);
  } else if (expMinutesIdx !== -1) {
    const n = Number(args[expMinutesIdx + 1]);
    if (!Number.isFinite(n) || n <= 0) {
      console.error("--exp-minutes requires a positive number");
      process.exit(1);
    }
    expSeconds = n * 60;
    args.splice(expMinutesIdx, 2);
  }

  // Remaining args: [keyPath] [kid]
  const keyPath = args[0];
  const kidArg  = args[1];

  let raw;

  if (process.env.CAREER_OPS_SIGNING_KEY) {
    // Env-key path (used by GitHub Actions: key stays in memory, never on disk)
    try {
      const file = JSON.parse(process.env.CAREER_OPS_SIGNING_KEY);
      raw = Array.isArray(file.keys) ? file.keys[0] : file;
    } catch (e) {
      console.error(`CAREER_OPS_SIGNING_KEY is not valid JSON: ${e.message}`);
      process.exit(1);
    }
  } else if (keyPath) {
    // File-path path (classic local use)
    try {
      const file = JSON.parse(readFileSync(keyPath, "utf8"));
      raw = Array.isArray(file.keys) ? file.keys[0] : file;
    } catch (e) {
      console.error(`Could not read key from ${keyPath}: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(
      "Usage: node mint-cron-jwt.mjs <path-to-signing-key.json> [kid] [--exp-seconds N] [--exp-minutes N]\n" +
      "   or: CAREER_OPS_SIGNING_KEY='...' node mint-cron-jwt.mjs [--exp-seconds N]"
    );
    process.exit(1);
  }

  if (!raw || raw.kty !== "EC") {
    console.error("Could not find an EC private JWK in the provided source.");
    process.exit(1);
  }

  const kid = kidArg || raw.kid;
  if (!kid) {
    console.error("No kid found in the JWK and none passed as argument.");
    process.exit(1);
  }

  try {
    const jwt = await mintCronJwt({ jwk: raw, kid, expSeconds });
    console.log(jwt);
  } catch (err) {
    console.error(`Minting failed: ${err.message}`);
    process.exit(1);
  }
}
