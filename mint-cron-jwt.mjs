import { readFileSync } from "node:fs";
import { importJWK, SignJWT } from "jose";

const keyPath = process.argv[2];
const kidArg = process.argv[3];

if (!keyPath) {
  console.error("Usage: node mint-cron-jwt.mjs <path-to-signing-key.json> [kid-from-supabase]");
  process.exit(1);
}

const file = JSON.parse(readFileSync(keyPath, "utf8"));
const raw = Array.isArray(file.keys) ? file.keys[0] : file;

if (!raw || raw.kty !== "EC") {
  console.error("Could not find an EC private JWK in the file.");
  process.exit(1);
}

const kid = raw.kid || kidArg;
if (!kid) {
  console.error("No kid in the file and none passed as 2nd argument.");
  process.exit(1);
}

// Strip key_ops/use/ext: Web Crypto rejects an ECDSA private key import that
// carries verify in key_ops. jose only needs the core EC fields + the ES256 alg.
const { key_ops, use, ext, ...jwk } = raw;

const privateKey = await importJWK(jwk, "ES256");

const now = Math.floor(Date.now() / 1000);
const exp = now + 60 * 60 * 24 * 30;

const jwt = await new SignJWT({ role: "career_ops_cron" })
  .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
  .setIssuedAt(now)
  .setExpirationTime(exp)
  .sign(privateKey);

console.log(jwt);
