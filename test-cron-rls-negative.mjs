import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const URL = process.env.SUPABASE_URL;
const DASH = process.env.SUPABASE_DASHBOARD_KEY;
const CRON_APIKEY = process.env.SUPABASE_CRON_PUBLISHABLE_KEY;
const CRON_JWT = process.env.SUPABASE_CRON_JWT;
if (!URL || !DASH || !CRON_APIKEY || !CRON_JWT) {
  console.error("Missing a required SUPABASE_* var in .env"); process.exit(1);
}

const REST = `${URL}/rest/v1`;
const TAG = `rls-neg-${Date.now()}`;

const dashHeaders = (e={}) => ({ apikey: DASH, Authorization: `Bearer ${DASH}`, "Content-Type": "application/json", ...e });
const cronHeaders = (e={}) => ({ apikey: CRON_APIKEY, Authorization: `Bearer ${CRON_JWT}`, "Content-Type": "application/json", ...e });

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`PASS: ${m}`); };
const bad = (m) => { fail++; console.log(`FAIL: ${m}`); };

async function req(headers, method, path, body) {
  const res = await fetch(`${REST}${path}`, {
    method, headers: { ...headers, Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, rows: Array.isArray(json) ? json.length : null, json };
}

function stub(status) {
  return {
    id: randomUUID(),
    company: "RLS Negative Test Co",
    title: TAG,
    url: `https://example.com/${TAG}-${status}-${randomUUID().slice(0,8)}`,
    ats: "manual",
    status,
    source: "manual",
  };
}

try {
  const seed = await req(dashHeaders(), "POST", "/active_roles", stub("scored"));
  if (seed.status >= 200 && seed.status < 300) ok("seed: dashboard inserted a status='scored' row");
  else { bad(`seed failed (status ${seed.status}): ${JSON.stringify(seed.json)}`); throw new Error("seed"); }

  {
    const r = await req(cronHeaders(), "POST", "/active_roles", stub("scored"));
    if (r.status === 401 || r.status === 403 || r.rows === 0) ok("cron INSERT status='scored' blocked");
    else bad(`cron INSERT status='scored' ALLOWED (status ${r.status}) — boundary broken`);
  }
  {
    const r = await req(cronHeaders(), "PATCH", `/active_roles?title=eq.${TAG}&status=eq.scored`, { company: "HIJACKED" });
    if (r.status === 401 || r.status === 403 || r.rows === 0) ok("cron UPDATE of status='scored' row blocked");
    else bad(`cron UPDATE of status='scored' row ALLOWED (status ${r.status}) — boundary broken`);
  }
  {
    const r = await req(cronHeaders(), "DELETE", `/active_roles?title=eq.${TAG}&status=eq.scored`);
    if (r.status === 401 || r.status === 403 || r.rows === 0) ok("cron DELETE of status='scored' row blocked");
    else bad(`cron DELETE of status='scored' row ALLOWED (status ${r.status}) — boundary broken`);
  }

  let cronNewInserted = false;
  {
    const r = await req(cronHeaders(), "POST", "/active_roles", stub("new"));
    if (r.status >= 200 && r.status < 300 && r.rows > 0) { ok("cron INSERT status='new' allowed"); cronNewInserted = true; }
    else bad(`cron INSERT status='new' BLOCKED (status ${r.status}): ${JSON.stringify(r.json)} — cron cannot do its job`);
  }
  if (cronNewInserted) {
    const r = await req(cronHeaders(), "DELETE", `/active_roles?title=eq.${TAG}&status=eq.new`);
    if (r.status >= 200 && r.status < 300 && r.rows > 0) ok("cron DELETE status='new' allowed");
    else bad(`cron DELETE status='new' BLOCKED (status ${r.status}) — cron cannot evict stale stubs`);
  }
} finally {
  const c = await req(dashHeaders(), "DELETE", `/active_roles?title=eq.${TAG}`);
  console.log(`cleanup: removed ${c.rows ?? "?"} test row(s)`);
}

console.log(`\n${fail === 0 ? "BOUNDARY PROVEN" : "BOUNDARY BROKEN"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
