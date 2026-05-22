// scratch/check-api-dates.mjs
async function test() {
  console.log('--- Testing Greenhouse API (Airtable) ---');
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/airtable/jobs');
    const data = await res.json();
    if (data && data.jobs && data.jobs[0]) {
      console.log('Greenhouse job sample:', {
        title: data.jobs[0].title,
        updated_at: data.jobs[0].updated_at,
        first_published: data.jobs[0].first_published,
        absolute_url: data.jobs[0].absolute_url,
      });
    }
  } catch (e) {
    console.error('Greenhouse error:', e.message);
  }
}

test();
