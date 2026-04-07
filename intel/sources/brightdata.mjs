/**
 * Bright Data source module
 * API: https://api.brightdata.com/datasets/v3
 */

const BASE_URL = 'https://api.brightdata.com/datasets/v3';

const DATASET_IDS = {
  linkedin_profile: 'gd_l1viktl72bvl7bjuj0',
  linkedin_jobs: 'gd_l7q7dkf244hwjntr0',
};

const COSTS = {
  linkedin_profile: 0.05,
  linkedin_jobs: 0.03,
  scrape: 0.01,
};

export function isAvailable() {
  return Boolean(process.env.BRIGHTDATA_API_KEY);
}

export function estimateCost(queryType) {
  return COSTS[queryType] ?? 0;
}

export async function execute(query) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) throw new Error('BRIGHTDATA_API_KEY is not set');

  const { type, url } = query;

  try {
    const datasetId = DATASET_IDS[type];
    if (!datasetId) return [];

    const endpoint = `/trigger?dataset_id=${datasetId}&format=json`;
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ url }]),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const items = Array.isArray(data) ? data : [];

    if (type === 'linkedin_profile') {
      return items.map((r) => ({
        title: r.name,
        url: r.url,
        snippet: r.about || '',
        metadata: {
          jobTitle: r.title,
          company: r.company,
          location: r.location,
          connections: r.connections,
        },
        source: 'brightdata',
      }));
    }

    if (type === 'linkedin_jobs') {
      return items.map((r) => ({
        title: r.title || r.job_title,
        url: r.url,
        snippet: r.description || '',
        metadata: {
          company: r.company_name,
          location: r.location,
          salary: r.salary,
          postedDate: r.postedDate,
        },
        source: 'brightdata',
      }));
    }

    return [];
  } catch {
    return [];
  }
}
