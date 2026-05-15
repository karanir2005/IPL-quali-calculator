import axios from 'axios';
import * as cheerio from 'cheerio';

export async function fetchLiveStandings() {
  const source = {
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
    }
  };

  try {
    console.log(`[${new Date().toLocaleTimeString()}] Scraping ${source.name}: ${source.url}`);
    const response = await axios.get(source.url, {
      headers: source.headers,
      timeout: 12000,
      maxRedirects: 5
    });

    console.log(`✓ ${source.name} responded with ${response.status}`);

    if (typeof response.data === 'string') {
      console.log(`Parsing HTML from ${source.name}...`);
      const teams = parseEspnCricinfoHtml(response.data);
      if (teams && teams.length > 0) {
        console.log(`✓ Successfully extracted ${teams.length} teams from HTML`);
        return { teams, source: source.name };
      }
    }
  } catch (error) {
    console.error(`✗ ${source.name} failed: ${error.message}`);
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

        // ESPN column positions: Rank+Team | Pld | W | L | T | N/R | Pts | NRR | ...
        let name = cellTexts[0].replace(/^\d+/, '').trim();
        const played = parseInt(cellTexts[1]) || 0;
        const wins = parseInt(cellTexts[2]) || 0;
        const losses = parseInt(cellTexts[3]) || 0;
        const noResults = parseInt(cellTexts[5]) || 0;
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
