const url = 'https://html.duckduckgo.com/html/?q=site:instahyre.com/job+software+engineer';
fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
  .then(res => res.text())
  .then(html => {
    const urls = [];
    const urlRegex = /class="result__url" href="([^"]+)"/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      // url decode DDG wrappers
      let finalUrl = match[1];
      if (finalUrl.includes('?q=')) {
        finalUrl = decodeURIComponent(finalUrl.split('?q=')[1].split('&')[0]);
      } else if (finalUrl.startsWith('//')) {
        finalUrl = 'https:' + finalUrl;
      }
      urls.push(finalUrl);
    }
    
    const titles = [];
    const titleRegex = /class="result__title"[^>]*>([\s\S]*?)<\/h2>/g;
    while ((match = titleRegex.exec(html)) !== null) {
      titles.push(match[1].replace(/<[^>]+>/g, '').trim());
    }

    console.log('URLs:', urls);
    console.log('Titles:', titles);
  })
  .catch(console.error);
