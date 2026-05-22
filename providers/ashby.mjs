/**
 * ashby.mjs — Ashby ATS provider for career-ops scanner.
 *
 * Detects from entry.careers_url containing jobs.ashbyhq.com.
 *
 * API: POST https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams
 * Response: { data: { jobBoard: { jobPostings: [{ id, title, locationName }] } } }
 * Job URL: https://jobs.ashbyhq.com/{slug}/{id}
 */

const ASHBY_RE = /jobs\.ashbyhq\.com\/([^/?#\s]+)/;

const GQL_QUERY = `query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
  jobBoard: publishedJobBoard(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
    jobPostings {
      id
      title
      locationName
      employmentType
    }
  }
}`;

const API_URL = 'https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams';

function slugFrom(entry) {
  if (entry.careers_url) {
    const m = entry.careers_url.match(ASHBY_RE);
    if (m) return m[1];
  }
  return null;
}

export default {
  id: 'ashby',

  detect(entry) {
    return slugFrom(entry) ? {} : null;
  },

  async fetch(entry, ctx) {
    const slug = slugFrom(entry);
    if (!slug) throw new Error(`ashby: cannot determine slug for "${entry.name}"`);

    const data = await ctx.post(API_URL, {
      operationName: 'ApiJobBoardWithTeams',
      variables: { organizationHostedJobsPageName: slug },
      query: GQL_QUERY,
    });

    const postings = data?.data?.jobBoard?.jobPostings || [];

    return postings.map(p => ({
      title: p.title || '',
      url: `https://jobs.ashbyhq.com/${slug}/${p.id}`,
      company: entry.name,
      location: p.locationName || '',
    })).filter(p => p.title);
  },
};
