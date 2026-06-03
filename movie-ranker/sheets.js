import { google } from 'googleapis';
import fs from 'fs';

const SPREADSHEET_ID = '1-FK_oPTXrTBxdug5crbgIVAvFYppjMhY1oCgUaGzHlg';

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not set in .env — see setup instructions');
  if (!fs.existsSync(keyPath)) throw new Error(`Service account key file not found: ${keyPath}`);
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(fs.readFileSync(keyPath, 'utf8')),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

export async function readMovies() {
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  const [h, t] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Hindi Movies'!A:B" }),
    sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'Telugu Movies'!A:B" }),
  ]);

  const parse = (rows, lang) =>
    (rows ?? []).slice(1)
      .filter(r => r[0]?.trim())
      .map((r, i) => ({
        id: `${lang[0].toLowerCase()}_${i}`,
        name: r[0].trim(),
        year: parseInt(r[1]) || null,
        language: lang,
        score: 0,
        wins: 0,
        losses: 0,
        buchholz: 0,
        opponents: [],
        streak: 0,
      }));

  return [...parse(h.data.values, 'Hindi'), ...parse(t.data.values, 'Telugu')];
}

export async function writeRankings(rankings) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const hasTab = meta.data.sheets?.some(s => s.properties.title === 'Rankings');

  if (!hasTab) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: 'Rankings' } } }] },
    });
  } else {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SPREADSHEET_ID, range: 'Rankings' });
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Rankings!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        ['Rank', 'Movie', 'Language', 'Year', 'Score', 'Wins', 'Losses', 'Games Played', 'Streak'],
        ...rankings.map(m => [
          m.rank, m.name, m.language, m.year ?? '', m.score, m.wins, m.losses, m.wins + m.losses, m.streak ?? 0,
        ]),
      ],
    },
  });
}
