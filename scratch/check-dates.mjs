async function checkGreenhouse() {
  console.log('--- Testing Greenhouse API (Airtable) ---');
  try {
    const res = await fetch('https://boards-api.greenhouse.io/v1/boards/airtable/jobs');
    const data = await res.json();
    if (data && data.jobs && data.jobs[0]) {
      console.log('Greenhouse job sample:', {
        title: data.jobs[0].title,
        updated_at: data.jobs[0].updated_at,
        first_published: data.jobs[0].first_published,
      });
    }
  } catch (e) {
    console.error('Greenhouse error:', e.message);
  }
}

async function checkLever() {
  console.log('--- Testing Lever API (Mistral) ---');
  try {
    const res = await fetch('https://api.lever.co/v0/postings/mistral');
    const data = await res.json();
    if (data && data[0]) {
      console.log('Lever job sample:', {
        title: data[0].text,
        createdAt: data[0].createdAt, // epoch ms
        createdAtDate: new Date(data[0].createdAt).toISOString(),
      });
    }
  } catch (e) {
    console.error('Lever error:', e.message);
  }
}

async function checkAshby() {
  console.log('--- Testing Ashby API (n8n) ---');
  try {
    const res = await fetch('https://api.ashbyhq.com/posting-api/job-board/n8n');
    const data = await res.json();
    if (data && data.jobs && data.jobs[0]) {
      console.log('Ashby job sample:', {
        title: data.jobs[0].title,
        publishedAt: data.jobs[0].publishedAt,
      });
    }
  } catch (e) {
    console.error('Ashby error:', e.message);
  }
}

async function main() {
  await checkGreenhouse();
  await checkLever();
  await checkAshby();
}

main();
