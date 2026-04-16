#!/usr/bin/env node

// Websearch for Bogotá offers
// Uses Google search to find jobs, adds to pipeline.md

import { readFileSync, appendFileSync } from 'fs';
import yaml from 'js-yaml';

const PORTALS_PATH = 'portals.yml';

async function searchGoogle(query) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const text = await response.text();
  // Simple regex to extract job links (basic, not perfect)
  const links = [...text.matchAll(/https:\/\/[^"]*job[^"]*/g)].map(m => m[0]);
  return [...new Set(links)].slice(0, 5); // Unique, limit 5
}

async function main() {
  const portals = yaml.load(readFileSync(PORTALS_PATH, 'utf-8'));
  const queries = portals.search_queries.filter(q => q.enabled && (q.query.includes('Bogotá') || q.query.includes('Colombia')));

  let newOffers = 0;
  for (const q of queries) {
    console.log(`Searching: ${q.query}`);
    try {
      const links = await searchGoogle(q.query);
      for (const link of links) {
        if (link.includes('linkedin') || link.includes('computrabajo') || link.includes('indeed')) {
          const line = `- [ ] ${link} | ${q.name} | Job from search | Bogotá, Colombia\n`;
          appendFileSync('data/pipeline.md', line);
          newOffers++;
        }
      }
    } catch (e) {
      console.error(`Error searching ${q.name}: ${e.message}`);
    }
  }
  console.log(`Added ${newOffers} offers from websearch.`);
}

main();