#!/usr/bin/env node
/**
 * credentials-store.mjs — Per-portal credential manager.
 *
 * Stores a unique auto-generated password per portal host in a gitignored
 * JSON file (data/portal-credentials.json). The user never sees or types
 * these passwords — they are used only by the automated login/registration
 * flow. The email and real PII come from config/profile.yml.
 *
 * The file is NEVER committed (gitignored). If deleted, the next login
 * attempt to that portal will register a new account (same email, new
 * password — the portal will likely say "email already in use", requiring
 * a password reset from the user's inbox).
 *
 * Exports:
 *   generatePassword()                  → string (24 char, URL-safe)
 *   getCredentials(host)                → { email, password, created_at } | null
 *   upsertCredentials(host, email, pw)  → void
 *   getOrCreateCredentials(host)        → { email, password, isNew }
 *   listPortals()                       → string[]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID, randomBytes } from 'crypto';
import yaml from 'js-yaml';

const ROOT         = dirname(fileURLToPath(import.meta.url));
const DATA_DIR     = join(ROOT, 'data');
const CREDS_PATH   = join(DATA_DIR, 'portal-credentials.json');
const PROFILE_PATH = join(ROOT, 'config', 'profile.yml');

// ── I/O ───────────────────────────────────────────────────────────────────────

function loadStore() {
  if (!existsSync(CREDS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CREDS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveStore(store) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = join(DATA_DIR, `.portal-credentials-${randomUUID()}.tmp`);
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
  renameSync(tmp, CREDS_PATH); // atomic on same filesystem
}

// ── Password generation ───────────────────────────────────────────────────────

// 24 URL-safe chars (uppercase + lowercase + digits). Unique per portal.
export function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(36); // oversample — mod 62 has slight bias; 36 bytes gives 24 good chars
  let out = '';
  for (let i = 0; out.length < 24 && i < bytes.length; i++) {
    const b = bytes[i];
    if (b < chars.length * Math.floor(256 / chars.length)) { // rejection-sample to remove bias
      out += chars[b % chars.length];
    }
  }
  // Pad if rejection sampling left us short (extremely rare)
  while (out.length < 24) out += chars[randomBytes(1)[0] % chars.length];
  return out;
}

// ── Profile helper ────────────────────────────────────────────────────────────

function loadCandidateEmail() {
  if (!existsSync(PROFILE_PATH)) return null;
  try {
    // js-yaml v4: yaml.load() is safe by default (no custom type constructors).
    const profile = yaml.load(readFileSync(PROFILE_PATH, 'utf-8'));
    return profile?.candidate?.email ?? null;
  } catch {
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get stored credentials for a portal host.
 * @param {string} host  — e.g. 'jobs.careers.vic.gov.au'
 * @returns {{ email: string, password: string, created_at: string } | null}
 */
export function getCredentials(host) {
  return loadStore()[host] ?? null;
}

/**
 * Save (or overwrite) credentials for a portal host. Writes atomically.
 * @param {string} host
 * @param {string} email
 * @param {string} password
 */
export function upsertCredentials(host, email, password) {
  const store = loadStore();
  const now   = new Date().toISOString();
  store[host] = {
    email,
    password,
    created_at: store[host]?.created_at ?? now,
    updated_at: now,
  };
  saveStore(store);
}

/**
 * Get or create credentials for a portal host.
 * If none exist, generates a new password, saves with the profile email,
 * and returns isNew: true (so the caller knows to drive the registration flow).
 * @param {string} host
 * @returns {{ email: string, password: string, isNew: boolean }}
 */
export function getOrCreateCredentials(host) {
  const existing = getCredentials(host);
  if (existing) return { email: existing.email, password: existing.password, isNew: false };

  const email = loadCandidateEmail();
  if (!email) throw new Error('No email found in config/profile.yml — cannot create portal account');

  const password = generatePassword();
  upsertCredentials(host, email, password);
  console.log(`🔑 New credentials stored for ${host} in data/portal-credentials.json`);
  return { email, password, isNew: true };
}

/**
 * List all portal hosts with stored credentials.
 * @returns {string[]}
 */
export function listPortals() {
  return Object.keys(loadStore());
}
