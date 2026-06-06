#!/usr/bin/env node
/**
 * supabase-client.mjs -- tiny synchronous Supabase REST client.
 *
 * Credentials are read from environment variables or .env via dotenv/config.
 * No Supabase URL or key is ever hardcoded in this repo.
 *
 * Expected env:
 *   SUPABASE_URL=https://<project-ref>.supabase.co
 *   SUPABASE_DASHBOARD_KEY=<JWT/API key for career_ops_dashboard>
 *   SUPABASE_CRON_KEY=<JWT/API key for career_ops_cron>
 *
 * The cron key is deliberately separate from the dashboard key. Do not use
 * service_role for the cron path: service_role bypasses RLS.
 */

import 'dotenv/config';
import { execFileSync } from 'child_process';

const ROLE_KEY_ENVS = {
  dashboard: ['SUPABASE_DASHBOARD_KEY', 'CAREER_OPS_DASHBOARD_KEY'],
  cron: ['SUPABASE_CRON_KEY', 'CAREER_OPS_CRON_KEY'],
};

function firstEnv(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return { name, value: value.trim() };
  }
  return null;
}

export function getSupabaseEnv(role = 'dashboard') {
  const url = process.env.SUPABASE_URL?.trim();
  if (!url) {
    throw new Error('SUPABASE_URL is required; add it to .env or the process environment');
  }

  const keyEnv = firstEnv(ROLE_KEY_ENVS[role] ?? []);
  if (!keyEnv) {
    const names = (ROLE_KEY_ENVS[role] ?? []).join(' or ');
    throw new Error(`${names} is required for Supabase ${role} access`);
  }

  return {
    role,
    url: url.replace(/\/+$/, ''),
    key: keyEnv.value,
    keyEnvName: keyEnv.name,
  };
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
    this.key = env.key;
    this.keyEnvName = env.keyEnvName;
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
      `apikey: ${this.key}`,
      '--header',
      `Authorization: Bearer ${this.key}`,
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
