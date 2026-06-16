#!/usr/bin/env node
/**
 * supabase-client.mjs -- tiny synchronous Supabase REST client.
 *
 * Credentials are read from environment variables or .env via dotenv/config.
 * No Supabase URL or key is ever hardcoded in this repo.
 *
 * Expected env:
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_DASHBOARD_KEY=<sb_secret_ key — bypasses RLS, local-only high-privilege client>
 *   SUPABASE_CRON_PUBLISHABLE_KEY=<publishable/anon key — goes on apikey header>
 *   SUPABASE_CRON_JWT=<minted JWT with role=career_ops_cron — goes on Authorization header>
 *
 * The cron path uses a minted JWT so RLS sees role=career_ops_cron.
 * Do not send a secret key on the cron path: sb_secret_ keys bypass RLS.
 */

import 'dotenv/config';
import { execFileSync } from 'child_process';

function envRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required; add it to .env or the process environment`);
  }
  return value;
}

export function getSupabaseEnv(role = 'dashboard') {
  const url = envRequired('SUPABASE_URL').replace(/\/+$/, '');

  if (role === 'dashboard') {
    // Dashboard: single sb_secret_ key → intentionally bypasses RLS (trusted local client).
    const key = envRequired('SUPABASE_DASHBOARD_KEY');
    return { role, url, apikey: key, authToken: key };
  }

  if (role === 'cron') {
    // Cron: publishable key on apikey header, minted JWT on Authorization header.
    const apikey = envRequired('SUPABASE_CRON_PUBLISHABLE_KEY');
    const authToken = envRequired('SUPABASE_CRON_JWT');
    // sb_secret_ keys bypass RLS — never allow them on the cron path.
    for (const [label, val] of [['SUPABASE_CRON_PUBLISHABLE_KEY', apikey], ['SUPABASE_CRON_JWT', authToken]]) {
      if (val.startsWith('sb_secret_')) {
        throw new Error(`${label} must not be an sb_secret_ key (bypasses RLS). Use a publishable key or minted JWT.`);
      }
    }
    return { role, url, apikey, authToken };
  }

  throw new Error(`Unknown Supabase role: ${role}`);
}

export function isSupabaseConfigured(role = 'dashboard') {
  try {
    getSupabaseEnv(role);
    return true;
  } catch {
    return false;
  }
}

function appendQuery(url, query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

export class SupabaseRestClient {
  constructor(role = 'dashboard', options = {}) {
    const env = getSupabaseEnv(role);
    this.role = env.role;
    this.baseUrl = env.url;
    this.apikey = env.apikey;
    this.authToken = env.authToken;
    this.timeoutSeconds = options.timeoutSeconds ?? 20;
  }

  requestSync(method, path, { query = {}, body = undefined, headers = {} } = {}) {
    const cleanPath = String(path).replace(/^\/+/, '');
    const url = appendQuery(new URL(`${this.baseUrl}/rest/v1/${cleanPath}`), query);

    const args = [
      '--silent',
      '--show-error',
      '--fail-with-body',
      '--max-time',
      String(this.timeoutSeconds),
      '--request',
      method,
      '--header',
      `apikey: ${this.apikey}`,
      '--header',
      `Authorization: Bearer ${this.authToken}`,
      '--header',
      'Accept: application/json',
    ];

    const requestBody = body == null ? null : JSON.stringify(body);
    if (requestBody != null) {
      args.push('--header', 'Content-Type: application/json');
    }
    for (const [name, value] of Object.entries(headers)) {
      args.push('--header', `${name}: ${value}`);
    }
    if (requestBody != null) {
      args.push('--data-binary', '@-');
    }
    args.push(url.toString());

    try {
      const out = execFileSync('curl', args, {
        encoding: 'utf-8',
        input: requestBody ?? undefined,
        maxBuffer: 20 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!out.trim()) return null;
      return JSON.parse(out);
    } catch (err) {
      const stderr = err.stderr ? String(err.stderr).trim() : '';
      const stdout = err.stdout ? String(err.stdout).trim() : '';
      const detail = stdout || stderr || err.message;
      throw new Error(`Supabase ${method} ${path} failed: ${detail}`);
    }
  }

  selectSync(table, { select = '*', query = {} } = {}) {
    return this.requestSync('GET', table, {
      query: { select, ...query },
    });
  }

  rpcSync(functionName, params = {}) {
    return this.requestSync('POST', `rpc/${functionName}`, {
      body: params,
      headers: { Prefer: 'return=representation' },
    });
  }
}

export function createSupabaseClient(role = 'dashboard', options = {}) {
  return new SupabaseRestClient(role, options);
}
