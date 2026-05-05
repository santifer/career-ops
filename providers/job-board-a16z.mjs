/**
 * job-board-a16z.mjs — a16z public jobs API provider
 *
 * Exposes search + filter metadata + autocomplete helpers for the
 * Andreessen Horowitz public jobs API.
 */

const A16Z_API_BASE_URL = 'https://jobs.a16z.com/api-boards';
const A16Z_FETCH_TIMEOUT_MS = 10_000;

export const A16Z_PROVIDER_ID = 'a16z';
export const A16Z_DEFAULT_PAGE_SIZE = 15;
export const A16Z_BOARD = Object.freeze({
  id: 'andreessen-horowitz',
  isParent: true,
});

const A16Z_FILTER_GROUPS = Object.freeze([
  'jobTypes',
  'jobSeniority',
  'skills',
  'locations',
  'companies',
  'stages',
  'markets',
  'departments',
  'currencies',
  'salaryPeriods',
]);

/**
 * @typedef {{ label: string, value: string }} A16ZFacetOption
 * @typedef {{
 *   size?: number,
 *   sequence?: string,
 *   promoteFeatured?: boolean,
 *   remoteOnly?: boolean,
 *   internshipsOnly?: boolean,
 *   query?: Record<string, unknown>,
 *   jobTypes?: Array<string|A16ZFacetOption>,
 *   jobSeniority?: Array<string|A16ZFacetOption>,
 *   skills?: Array<string|A16ZFacetOption>,
 *   locations?: Array<string|A16ZFacetOption>,
 *   companies?: Array<string|A16ZFacetOption>,
 *   stages?: Array<string|A16ZFacetOption>,
 *   markets?: Array<string|A16ZFacetOption>,
 *   departments?: Array<string|A16ZFacetOption>,
 *   currencies?: Array<string|A16ZFacetOption>,
 *   salaryPeriods?: Array<string|A16ZFacetOption>
 * }} A16ZSearchFilters
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function buildBoardConfig() {
  return { ...A16Z_BOARD };
}

function normalizeSize(size) {
  if (Number.isInteger(size) && size > 0) return size;
  return A16Z_DEFAULT_PAGE_SIZE;
}

function normalizeFilterInput(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return safeString(value.value) || safeString(value.id) || safeString(value.label);
}

function pickFilterValues(values) {
  return asArray(values)
    .map((value) => normalizeFilterInput(value))
    .filter(Boolean);
}

function normalizeFacetOption(option, fallbackValue = '') {
  if (typeof option === 'string') {
    const value = option.trim();
    if (!value) return null;
    return { label: value, value };
  }

  if (!option || typeof option !== 'object' || Array.isArray(option)) return null;

  const label = safeString(option.label) || safeString(option.name) || safeString(option.value) || fallbackValue;
  const value = safeString(option.value) || safeString(option.id) || fallbackValue || label;
  if (!label && !value) return null;

  return { label: label || value, value: value || label };
}

function normalizeFacetOptions(values) {
  return asArray(values)
    .map((value) => normalizeFacetOption(value))
    .filter(Boolean);
}

function normalizeTextOptions(values) {
  return asArray(values)
    .map((value) => safeString(value))
    .filter(Boolean);
}

function normalizeAutocompleteNode(node) {
  if (!node || typeof node !== 'object') return null;

  const self = normalizeFacetOption(node.self);
  if (!self) return null;

  return {
    ...self,
    bolding: safeString(node.self?.bolding),
    count: safeNumber(node.self?.count),
    score: safeNumber(node.self?.score ?? node.score),
    children: asArray(node.children)
      .map((child) => normalizeAutocompleteNode({ self: child.self ?? child, children: child.children }))
      .filter(Boolean),
  };
}

function normalizeAutocompleteResults(values) {
  return asArray(values)
    .map((value) => normalizeAutocompleteNode(value))
    .filter(Boolean);
}

async function fetchAutocomplete(path, query) {
  if (!safeString(query)) return [];

  const response = await postJson(`autocomplete/${path}`, {
    q: query.trim(),
    board: buildBoardConfig(),
    skipCompanyExcludes: false,
  });

  return normalizeAutocompleteResults(response.results);
}

function normalizeSalary(salary) {
  if (!salary || typeof salary !== 'object' || Array.isArray(salary)) return null;

  const min = Number.isFinite(salary.minValue) ? salary.minValue : null;
  const max = Number.isFinite(salary.maxValue) ? salary.maxValue : null;
  const currency = normalizeFacetOption(salary.currency);
  const period = normalizeFacetOption(salary.period);

  if (min === null && max === null && !currency && !period) return null;

  return {
    minValue: min,
    maxValue: max,
    currency,
    period,
    isOriginal: safeBoolean(salary.isOriginal),
  };
}

function normalizeAvailableFilters(values) {
  return asArray(values)
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      return {
        param: safeString(value.param),
        value: safeString(value.value),
        total: safeNumber(value.total),
      };
    })
    .filter((value) => value && (value.param || value.value));
}

function normalizeMessages(values) {
  return asArray(values).map((value) => safeString(value)).filter(Boolean);
}

async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), A16Z_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${A16Z_API_BASE_URL}/${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let json = {};

    if (text.trim()) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error(`A16Z ${path} returned malformed JSON: ${error.message}`);
      }
    }

    if (!response.ok) {
      const errors = normalizeMessages(json.errors);
      const detail = errors.length > 0 ? ` (${errors.join('; ')})` : '';
      throw new Error(`A16Z ${path} failed with HTTP ${response.status}${detail}`);
    }

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return {};
    }

    return json;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`A16Z ${path} timed out after ${A16Z_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {A16ZSearchFilters} filters
 */
export function buildA16zSearchPayload(filters = {}) {
  const meta = {
    size: normalizeSize(filters.size),
  };

  if (safeString(filters.sequence)) {
    meta.sequence = filters.sequence.trim();
  }

  const query = {
    promoteFeatured: filters.promoteFeatured !== false,
  };

  for (const group of A16Z_FILTER_GROUPS) {
    const values = pickFilterValues(filters[group]);
    if (values.length > 0) {
      query[group] = values;
    }
  }

  if (filters.remoteOnly === true) query.remoteOnly = true;
  if (filters.internshipsOnly === true) query.internshipsOnly = true;

  if (filters.query && typeof filters.query === 'object' && !Array.isArray(filters.query)) {
    Object.assign(query, filters.query);
  }

  return {
    meta,
    board: buildBoardConfig(),
    query,
  };
}

async function resolveFilterValue(autocompletePath, input, cache) {
  const normalized = normalizeFacetOption(input);
  if (!normalized) return null;

  const existingValue = safeString(normalized.value);
  const lookup = safeString(normalized.label) || existingValue;
  if (!lookup) return null;

  const cacheKey = `${autocompletePath}:${lookup.toLowerCase()}`;
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, fetchAutocomplete(autocompletePath, lookup).catch(() => []));
  }

  const options = await cache.get(cacheKey);
  const lowerLookup = lookup.toLowerCase();
  const exact = options.find((option) =>
    option.label.toLowerCase() === lowerLookup || option.value.toLowerCase() === lowerLookup
  );
  const match = exact || options[0] || null;

  if (!match) {
    return { label: normalized.label || lookup, value: existingValue || lookup };
  }

  return { label: match.label, value: match.value };
}

async function resolveSearchFilters(filters = {}) {
  const resolved = { ...filters };
  const skills = asArray(filters.skills);
  const locations = asArray(filters.locations);
  const markets = asArray(filters.markets);

  if (skills.length === 0 && locations.length === 0 && markets.length === 0) {
    return resolved;
  }

  const cache = new Map();

  const [resolvedSkills, resolvedLocations, resolvedMarkets] = await Promise.all([
    Promise.all(skills.map((s) => resolveFilterValue('skills', s, cache))),
    Promise.all(locations.map((l) => resolveFilterValue('locations', l, cache))),
    Promise.all(markets.map((m) => resolveFilterValue('markets', m, cache))),
  ]);

  if (skills.length > 0) resolved.skills = resolvedSkills.filter(Boolean);
  if (locations.length > 0) resolved.locations = resolvedLocations.filter(Boolean);
  if (markets.length > 0) resolved.markets = resolvedMarkets.filter(Boolean);

  return resolved;
}

export function normalizeA16zJob(job) {
  if (!job || typeof job !== 'object') return null;

  const locations = normalizeTextOptions(job.locations);
  const normalizedLocations = normalizeFacetOptions(job.normalizedLocations);
  const jobTypes = normalizeFacetOptions(job.jobTypes);
  const jobFunctions = normalizeFacetOptions(job.jobFunctions);
  const jobSeniorities = normalizeFacetOptions(job.jobSeniorities);
  const markets = normalizeFacetOptions(job.markets);
  const stages = normalizeFacetOptions(job.stages);
  const skills = normalizeFacetOptions(job.skills);
  const requiredSkills = normalizeFacetOptions(job.requiredSkills);
  const preferredSkills = normalizeFacetOptions(job.preferredSkills);

  const url = safeString(job.url) || safeString(job.applyUrl);
  const title = safeString(job.title);
  const company = safeString(job.companyName);

  if (!url || !title || !company) return null;

  return {
    id: safeString(job.jobId),
    title,
    url,
    applyUrl: safeString(job.applyUrl) || url,
    company,
    companyId: safeString(job.companyId),
    companySlug: safeString(job.companySlug),
    companyDomain: safeString(job.companyDomain),
    location: normalizedLocations[0]?.label || locations[0] || '',
    locations,
    normalizedLocations,
    departments: normalizeTextOptions(job.departments),
    jobTypes,
    jobFunctions,
    jobSeniorities,
    jobSeniorityIds: normalizeTextOptions(job.jobSeniorityIds),
    markets,
    stages,
    skills,
    requiredSkills,
    preferredSkills,
    salary: normalizeSalary(job.salary),
    remote: safeBoolean(job.remote),
    hybrid: safeBoolean(job.hybrid),
    featured: safeBoolean(job.isFeatured),
    manager: safeBoolean(job.manager),
    consultant: safeBoolean(job.consultant),
    contractor: safeBoolean(job.contractor),
    postedAt: safeString(job.timeStamp),
    source: 'a16z-api',
  };
}

export function mapA16zJobToScanOffer(job) {
  const normalized = normalizeA16zJob(job);
  if (!normalized) return null;

  return {
    title: normalized.title,
    url: normalized.url,
    company: normalized.company,
    location: normalized.location,
  };
}

export function normalizeA16zNameMapping(response = {}) {
  const groups = {};

  for (const group of A16Z_FILTER_GROUPS) {
    const bucket = response[group];

    if (Array.isArray(bucket)) {
      groups[group] = normalizeFacetOptions(bucket);
      continue;
    }

    if (!bucket || typeof bucket !== 'object') {
      groups[group] = [];
      continue;
    }

    groups[group] = Object.entries(bucket)
      .map(([key, value]) => normalizeFacetOption(value, key))
      .filter(Boolean);
  }

  return {
    groups,
    errors: normalizeMessages(response.errors),
    debug: normalizeMessages(response.debug),
    version: response.version && typeof response.version === 'object' ? response.version : null,
  };
}

/**
 * @param {A16ZSearchFilters} filters
 */
export async function searchJobs(filters = {}) {
  const resolvedFilters = await resolveSearchFilters(filters);
  const payload = buildA16zSearchPayload(resolvedFilters);
  const response = await postJson('search-jobs', payload);
  const jobs = asArray(response.jobs)
    .map((job) => normalizeA16zJob(job))
    .filter(Boolean);

  return {
    jobs,
    total: safeNumber(response.total, jobs.length),
    meta: response.meta && typeof response.meta === 'object'
      ? { ...response.meta, size: normalizeSize(response.meta.size ?? payload.meta.size) }
      : { ...payload.meta },
    availableFilters: normalizeAvailableFilters(response.availableFilters),
    errors: normalizeMessages(response.errors),
    debug: normalizeMessages(response.debug),
    version: response.version && typeof response.version === 'object' ? response.version : null,
  };
}

export async function fetchNameMapping() {
  const response = await postJson('name-mapping', {
    board: buildBoardConfig(),
  });

  return normalizeA16zNameMapping(response);
}

export async function autocompleteLocations(query) {
  return fetchAutocomplete('locations', query);
}

export async function autocompleteMarkets(query) {
  return fetchAutocomplete('markets', query);
}

export async function autocompleteSkills(query) {
  return fetchAutocomplete('skills', query);
}

export const a16zProvider = Object.freeze({
  id: A16Z_PROVIDER_ID,
  board: A16Z_BOARD,
  searchJobs,
  mapToScanOffer: mapA16zJobToScanOffer,
  fetchNameMapping,
  autocompleteLocations,
  autocompleteMarkets,
  autocompleteSkills,
});
