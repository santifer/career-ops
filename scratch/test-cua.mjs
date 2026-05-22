// scratch/test-cua.mjs
async function testCua() {
  console.log('--- Testing Tesla CUA Careers API ---');
  try {
    const res = await fetch('https://www.tesla.com/cua-api/apps/careers/state');
    console.log('Status:', res.status);
    if (res.status === 200) {
      const data = await res.json();
      console.log('Successfully fetched CUA careers data!');
      console.log('Data keys:', Object.keys(data));
      if (data.jobs) {
        console.log('Total jobs in data:', data.jobs.length);
        console.log('First job sample:', data.jobs[0]);
        // Filter jobs located in Berlin or Brandenburg
        const berlinJobs = data.jobs.filter(j => 
          j.l && (j.l.toLowerCase().includes('berlin') || j.l.toLowerCase().includes('brandenburg') || j.l.toLowerCase().includes('gruenheide') || j.l.toLowerCase().includes('grünheide'))
        );
        console.log('Total Berlin jobs:', berlinJobs.length);
        if (berlinJobs.length > 0) {
          console.log('Sample Berlin jobs:', berlinJobs.slice(0, 5));
        }
      }
    } else {
      const body = await res.text();
      console.log('Response body:', body.substring(0, 500));
    }
  } catch (e) {
    console.error('Error fetching CUA API:', e.message);
  }
}

testCua();
