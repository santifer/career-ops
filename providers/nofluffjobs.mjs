// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// NoFluffJobs provider
// POST to https://nofluffjobs.com/api/search/posting

const ALLOWED_HOSTS = new Set(['nofluffjobs.com']);

/** @type {Provider} */
export default {
  id: 'nofluffjobs',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const parsed = new URL(url);
      if (ALLOWED_HOSTS.has(parsed.hostname)) return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const fetchUrl = 'https://nofluffjobs.com/api/search/posting';
    
    const criteria = {};
    if (entry.requiredSkills) {
        criteria.requirement = Array.isArray(entry.requiredSkills) ? entry.requiredSkills : [entry.requiredSkills];
    }
    if (entry.experienceLevel) {
        criteria.seniority = Array.isArray(entry.experienceLevel) ? entry.experienceLevel : [entry.experienceLevel];
    }
    
    const payload = {
       criteriaSearch: criteria,
       page: 1
    };

    const json = await ctx.fetchJson(fetchUrl, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(payload)
    });

    if (!json || !Array.isArray(json.postings)) {
      throw new Error(`nofluffjobs: unexpected API response — expected { postings: [...] }`);
    }

    return json.postings
      .filter(p => p && typeof p === 'object' && p.url)
      .map(p => {
        const jobUrl = `https://nofluffjobs.com/job/${p.url}`;
        
        let location = '';
        if (p.location && Array.isArray(p.location.places)) {
            location = p.location.places.map(place => place.city).filter(Boolean).join(', ');
        }

        let salaryObj = null;
        if (p.salary) {
            salaryObj = {
                min: p.salary.from || 0,
                max: p.salary.to || 0,
                currency: p.salary.currency || ''
            };
        }

        return {
          title: p.title || '',
          url: jobUrl,
          company: p.name || entry.name,
          location: location,
          salary: salaryObj
        };
      });
  },
};
