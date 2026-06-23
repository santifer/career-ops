// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// JustJoin.it provider
// Fetches from GET https://justjoin.it/api/offers

const ALLOWED_HOSTS = new Set(['justjoin.it', 'api.justjoin.it']);

function assertUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`justjoin: invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`justjoin: URL must use HTTPS: ${url}`);
  if (!ALLOWED_HOSTS.has(parsed.hostname))
    throw new Error(`justjoin: untrusted hostname "${parsed.hostname}" — must be justjoin.it`);
  return url;
}

/** @type {Provider} */
export default {
  id: 'justjoin',

  detect(entry) {
    const url = entry.careers_url || '';
    try {
      const parsed = new URL(url);
      if (ALLOWED_HOSTS.has(parsed.hostname)) return { url };
    } catch {}
    return null;
  },

  async fetch(entry, ctx) {
    const fetchUrl = 'https://justjoin.it/api/offers';
    
    const json = await ctx.fetchJson(fetchUrl, { redirect: 'error' });
    if (!Array.isArray(json)) {
      throw new Error(`justjoin: unexpected API response — expected an array of offers`);
    }

    // Client-side filtering
    const expLevel = entry.experienceLevel ? String(entry.experienceLevel).toLowerCase() : null;
    const reqSkills = Array.isArray(entry.requiredSkills) 
        ? entry.requiredSkills.map(s => String(s).toLowerCase()) 
        : (entry.requiredSkills ? [String(entry.requiredSkills).toLowerCase()] : null);

    return json
      .filter(j => j && typeof j === 'object' && j.id)
      .filter(j => {
          if (expLevel) {
              const jobLevel = (j.experience_level || '').toLowerCase();
              if (jobLevel !== expLevel) return false;
          }
          if (reqSkills) {
              const jobSkills = Array.isArray(j.skills) ? j.skills.map(s => (s.name || '').toLowerCase()) : [];
              if (!reqSkills.some(s => jobSkills.includes(s))) return false;
          }
          return true;
      })
      .map(j => {
        const jobUrl = `https://justjoin.it/job-offer/${j.id}`;
        
        let location = j.city || '';
        if (Array.isArray(j.multilocation)) {
           const cities = j.multilocation.map(l => l.city).filter(Boolean);
           if (cities.length > 0) location = cities.join(', ');
        }
        
        let salaryObj = null;
        if (Array.isArray(j.employment_types) && j.employment_types.length > 0) {
            const emp = j.employment_types[0];
            if (emp && emp.salary) {
                salaryObj = {
                    min: emp.salary.from || 0,
                    max: emp.salary.to || 0,
                    currency: emp.salary.currency || ''
                };
            }
        }

        return {
          title: j.title || '',
          url: jobUrl,
          company: j.company_name || entry.name,
          location: location,
          salary: salaryObj
        };
      });
  },
};
