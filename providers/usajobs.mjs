// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// USAJOBS provider — hits the official Search API.
// Docs: https://developer.usajobs.gov/APIs/Search
//
// Supported portals.yml fields:
//   api_type: usajobs
//   usajobs_keywords: string[]
//   usajobs_remote_only: boolean
//   usajobs_public_only: boolean
//   usajobs_contact_email: string
//   usajobs_api_key: string

function detectUsajobs(entry) {
  const url = entry.careers_url || '';
  if (entry.provider === 'usajobs') return true;
  if (entry.api_type === 'usajobs') return true;
  return url.includes('usajobs.gov');
}

function buildSearchUrl(entry) {
  const keywords = Array.isArray(entry.usajobs_keywords)
    ? entry.usajobs_keywords.filter(Boolean).join(' OR ')
    : '';

  if (!keywords) {
    throw new Error('usajobs: missing usajobs_keywords');
  }

  const params = new URLSearchParams({
    Keyword: keywords,
    ResultsPerPage: '50',
    PositionStatus: 'active',
  });

  if (entry.usajobs_public_only !== false) {
    params.set('WhoMayApply', 'public');
  }

  if (entry.usajobs_remote_only) {
    params.set('RemoteIndicator', 'True');
  }

  return `https://data.usajobs.gov/api/search?${params}`;
}

function buildHeaders(entry) {
  const headers = {
    'user-agent': entry.usajobs_contact_email || 'career-ops-scanner',
  };

  if (entry.usajobs_api_key) {
    headers['authorization-key'] = entry.usajobs_api_key;
  }

  return headers;
}

function isPublicPosting(details) {
  const whoMayApply = details?.WhoMayApply?.Name || '';
  const lower = whoMayApply.toLowerCase();
  return (
    !whoMayApply ||
    lower.includes('public') ||
    lower.includes('all u.s. citizens')
  );
}

/** @type {Provider} */
export default {
  id: 'usajobs',

  detect(entry) {
    return detectUsajobs(entry) ? { url: 'https://data.usajobs.gov/api/search' } : null;
  },

  async fetch(entry, ctx) {
    const apiUrl = buildSearchUrl(entry);

    let json;
    try {
      json = await ctx.fetchJson(apiUrl, { headers: buildHeaders(entry) });
    } catch (err) {
      if (err?.status === 401) {
        throw new Error(
          'usajobs: API key required or invalid. Register at https://developer.usajobs.gov/APIRequest/Index, then add usajobs_api_key to this portals.yml entry.',
        );
      }
      throw err;
    }

    if (json?.status === 401) {
      throw new Error(
        'usajobs: API key required or invalid. Register at https://developer.usajobs.gov/APIRequest/Index, then add usajobs_api_key to this portals.yml entry.',
      );
    }

    const items = Array.isArray(json?.SearchResult?.SearchResultItems)
      ? json.SearchResult.SearchResultItems
      : [];

    const jobs = [];
    for (const item of items) {
      const descriptor = item?.MatchedObjectDescriptor;
      if (!descriptor) continue;

      const details = descriptor.UserArea?.Details || {};
      if (entry.usajobs_public_only !== false && !isPublicPosting(details)) continue;

      const title = descriptor.PositionTitle || '';
      const positionId = descriptor.PositionID;
      if (!title || !positionId) continue;

      const agency = descriptor.OrganizationName || descriptor.DepartmentName || entry.name || 'Federal';
      const remote = details.RemoteIndicator === true;
      const location = remote
        ? 'Remote'
        : descriptor.PositionLocation?.[0]?.LocationName || details.Telework || '';

      jobs.push({
        title,
        url: `https://www.usajobs.gov/job/${positionId}`,
        company: agency,
        location,
      });
    }

    return jobs;
  },
};
