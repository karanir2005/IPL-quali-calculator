import axios from 'axios';
import * as cheerio from 'cheerio';

export const DEFAULT_STANDINGS_2026 = [
  { name: 'Mumbai Indians', played: 10, wins: 7, losses: 2, noResults: 1, nrr: 0.52, points: 15 },
  { name: 'Kolkata Knight Riders', played: 10, wins: 6, losses: 3, noResults: 1, nrr: 0.45, points: 13 },
  { name: 'Royal Challengers Bangalore', played: 10, wins: 6, losses: 4, noResults: 0, nrr: 1.05, points: 12 },
  { name: 'Delhi Capitals', played: 10, wins: 5, losses: 5, noResults: 0, nrr: -0.99, points: 10 },
  { name: 'Punjab Kings', played: 10, wins: 5, losses: 5, noResults: 0, nrr: 0.35, points: 10 },
  { name: 'Rajasthan Royals', played: 10, wins: 4, losses: 6, noResults: 0, nrr: 0.08, points: 8 },
  { name: 'Chennai Super Kings', played: 10, wins: 4, losses: 5, noResults: 1, nrr: 0.18, points: 9 },
  { name: 'Gujarat Titans', played: 10, wins: 4, losses: 6, noResults: 0, nrr: 0.55, points: 8 },
  { name: 'Sunrisers Hyderabad', played: 10, wins: 3, losses: 7, noResults: 0, nrr: 0.33, points: 6 },
  { name: 'Lucknow Super Giants', played: 10, wins: 2, losses: 8, noResults: 0, nrr: -0.91, points: 4 }
];

// Try multiple data sources for IPL 2026 standings
export async function fetchLiveStandings() {
  const sources = [
    {
      name: 'ESPN Cricinfo Official',
      url: 'https://www.espncricinfo.com/series/ipl-2026-1510719/points-table-standings',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      parseHtml: true
    },
    {
      name: 'CricketAPI',
      url: 'https://api.cricketapi.com/v1/series/ipl2026/standings',
      headers: { 'User-Agent': 'Mozilla/5.0' }
    },
    {
      name: 'RapidAPI Cricket',
      url: 'https://cricketdata.p.rapidapi.com/standings',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  ];

  for (const source of sources) {
    try {
      console.log(`[${new Date().toLocaleTimeString()}] Trying ${source.name}: ${source.url}`);
      const response = await axios.get(source.url, {
        headers: source.headers,
        timeout: 12000,
        maxRedirects: 5
      });

      console.log(`✓ ${source.name} responded with ${response.status}`);

      if (source.parseHtml && typeof response.data === 'string') {
        console.log(`Parsing HTML from ${source.name}...`);
        const teams = parseEspnCricinfoHtml(response.data);
        if (teams && teams.length > 0) {
          console.log(`✓ Successfully extracted ${teams.length} teams from HTML`);
          return { teams, source: source.name };
        }
      }

      if (typeof response.data === 'object') {
        console.log(`✓ Received JSON data from ${source.name}`);
        return response.data;
      }
    } catch (error) {
      console.error(`✗ ${source.name} failed: ${error.message}`);
    }
  }

  return null;
}

// Parse HTML from ESPN Cricinfo standings page
export function parseEspnCricinfoHtml(html) {
  try {
    const $ = cheerio.load(html);
    const teams = [];

    // Look for all table rows in standings tables (skip header rows)
    $('table tbody tr').each((index, element) => {
      try {
        const row = $(element);
        let cells = row.find('td');
        if (cells.length === 0) cells = row.find('[role="cell"]');
        if (cells.length < 8) return;

        const cellTexts = [];
        cells.each((i, cell) => {
          cellTexts.push($(cell).text().trim());
        });

        console.log(`  Row ${index}: ${cellTexts.join(' | ')}`);

        // ESPN column positions (observed): Rank+Team | Pld | W | L | NR | <maybe> | Pts | NRR | ...
        let name = cellTexts[0].replace(/^\d+/, '').trim();
        const played = parseInt(cellTexts[1]) || 0;
        const wins = parseInt(cellTexts[2]) || 0;
        const losses = parseInt(cellTexts[3]) || 0;
        const noResults = parseInt(cellTexts[4]) || 0;
        const points = parseInt(cellTexts[6]) || (wins * 2 + noResults);
        let nrr = 0;
        if (cellTexts[7]) {
          const n = parseFloat(cellTexts[7]);
          if (!isNaN(n)) nrr = n;
        }

        if (name && played > 0) {
          teams.push({ name, played, wins, losses, noResults, nrr, points });
        }
      } catch (e) {
        console.error(`  Error parsing row ${index}: ${e.message}`);
      }
    });

    if (teams.length >= 8) return teams;
  } catch (error) {
    console.error(`Error parsing HTML: ${error.message}`);
  }
  return null;
}
