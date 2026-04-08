/**
 * Career-Ops CLI - Configuration Loader
 * Loads API keys and user profile configuration
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import dotenv from 'dotenv';

export function loadConfig() {
  // Load .env file
  const envPath = join(process.cwd(), '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  
  // Determine API provider and key
  let apiKey = process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY;
  let provider = 'openrouter';
  
  if (process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    provider = 'anthropic';
  }
  
  if (!apiKey) {
    throw new Error(
      'No API key found. Please set one of:\n' +
      '  - OPENROUTER_API_KEY (recommended, get from https://openrouter.ai)\n' +
      '  - ANTHROPIC_API_KEY (alternative)\n' +
      '\nAdd to .env file in your career-ops directory.'
    );
  }
  
  // Load user profile
  let profile = {};
  const profilePath = join(process.cwd(), 'config', 'profile.yml');
  if (existsSync(profilePath)) {
    try {
      profile = yaml.parse(readFileSync(profilePath, 'utf-8'));
    } catch (e) {
      console.warn('Warning: Could not parse profile.yml:', e.message);
    }
  }
  
  // Load portals config
  let portals = {};
  const portalsPath = join(process.cwd(), 'portals.yml');
  if (existsSync(portalsPath)) {
    try {
      portals = yaml.parse(readFileSync(portalsPath, 'utf-8'));
    } catch (e) {
      console.warn('Warning: Could not parse portals.yml:', e.message);
    }
  }
  
  return {
    apiKey,
    provider,
    profile,
    portals,
    model: process.env.DEFAULT_MODEL || 'openrouter/auto',
    rateLimit: parseInt(process.env.RATE_LIMIT) || 10
  };
}

export function loadCV() {
  const cvPath = join(process.cwd(), 'cv.md');
  if (!existsSync(cvPath)) {
    throw new Error('cv.md not found. Please create your CV in the project root.');
  }
  return readFileSync(cvPath, 'utf-8');
}

export function loadMode(modeName) {
  const modePath = join(process.cwd(), 'modes', `${modeName}.md`);
  if (!existsSync(modePath)) {
    // Fallback to English mode
    const fallbackPath = join(process.cwd(), 'modes', 'oferta.md');
    if (existsSync(fallbackPath)) {
      return readFileSync(fallbackPath, 'utf-8');
    }
    throw new Error(`Mode ${modeName}.md not found.`);
  }
  return readFileSync(modePath, 'utf-8');
}
