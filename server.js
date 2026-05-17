import express from 'express';
import cors from 'cors';
import url from 'url';
import path from 'path';
import { fetchLiveStandings, fetchUpcomingFixtures } from './backend/scraper.js';
import { normalizeTeam, sortStandings } from './backend/calculations.js';
import { computeQualification } from './backend/qualification.js';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
// Serve static frontend files so the app can be opened via http://localhost:5000
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
app.use(express.static(__dirname));
// scraper and calculation helpers moved to backend modules

app.get('/api/standings', async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('Scrape request: /api/standings');
    console.log('Time:', new Date().toLocaleTimeString());
    console.log('Attempting to scrape live 2026 IPL data...');
    console.log('========================================');
    
    // Scrape ESPN HTML directly
    let liveData = await fetchLiveStandings();
    
    let teams = [];
    let source = '';
    
    if (liveData) {
      // Check if liveData has teams array
      if (Array.isArray(liveData.teams)) {
        teams = liveData.teams;
        source = liveData.source || 'Live API Data';
      } else if (Array.isArray(liveData)) {
        teams = liveData;
        source = 'Live API Data';
      }
    }
    
    // If no live teams were found, return an empty response
    if (!teams || teams.length === 0) {
      console.log('\n⚠ No live standings found; returning empty result');
      return res.json({
        success: false,
        teams: [],
        lastUpdated: new Date().toLocaleString(),
        source: source || null
      });
    }

    // Normalize and sort teams using shared helpers
    const normalized = teams.slice(0, 10).map(normalizeTeam);
    const sorted = sortStandings(normalized);

    console.log('✓ Returning standings:');
    sorted.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name}: ${t.points} pts (${t.wins}W-${t.losses}L-${t.noResults}NR) NRR: ${t.nrr.toFixed(2)}`);
    });

    return res.json({
      success: true,
      teams: sorted,
      lastUpdated: new Date().toLocaleString(),
      source: source || 'ESPN Cricinfo'
    });

  } catch (error) {
    console.error('\n❌ Unexpected error in /api/standings:');
    console.error(error.message);
    
    // On error, return empty result (no fallback data)
    return res.json({
      success: false,
      teams: [],
      lastUpdated: new Date().toLocaleString(),
      source: null
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'Backend server is running on port 5000', timestamp: new Date().toISOString() });
});

app.get('/api/fixtures', async (req, res) => {
  try {
    console.log('Scrape request: /api/fixtures');
    const data = await fetchBestLiveFixtures();
    if (!data || !Array.isArray(data.fixtures) || data.fixtures.length === 0) {
      return res.json({ success: false, fixtures: [], lastUpdated: new Date().toLocaleString(), source: null });
    }
    return res.json({ success: true, fixtures: data.fixtures, lastCompleted: data.lastCompleted || 0, lastUpdated: new Date().toLocaleString(), source: data.source || 'ESPN Cricinfo' });
  } catch (error) {
    console.error('Error in /api/fixtures', error.message);
    return res.json({ success: false, fixtures: [], lastUpdated: new Date().toLocaleString(), source: null });
  }
});

// Qualification endpoint: runs scenario enumeration with safeguards
app.get('/api/qualification', async (req, res) => {
  try {
    console.log('Scrape request: /api/qualification');
    const live = await fetchLiveStandings();
    const fdata = await fetchBestLiveFixtures();
    const teams = (live && Array.isArray(live.teams)) ? live.teams.map(normalizeTeam) : [];
    const fixtures = (fdata && Array.isArray(fdata.fixtures)) ? fdata.fixtures : [];

    if (!teams || teams.length === 0) return res.json({ success: false, reason: 'no_standings' });
    if (!fixtures || fixtures.length === 0) return res.json({ success: false, reason: 'no_fixtures' });

    // Only pass remaining (unplayed) fixtures to the engine
    const lastCompleted = fdata && (typeof fdata.lastCompleted === 'number') ? fdata.lastCompleted : 0;
    const remainingFixtures = fixtures.filter(f => Number(f.matchNumber) > lastCompleted);
    const result = await computeQualification(teams, remainingFixtures);

    // If engine refused due to too many matches, return informative response
    if (!result || result.success === false) {
      return res.json({ success: false, message: result && result.reason ? result.reason : 'engine_error', details: result || null });
    }

    return res.json({ success: true, ...result, lastUpdated: new Date().toLocaleString() });
  } catch (err) {
    console.error('Error in /api/qualification', err.message);
    return res.json({ success: false, reason: 'unexpected_error', message: err.message });
  }
});

async function fetchBestLiveFixtures() {
  const first = await fetchUpcomingFixtures();
  if (first && typeof first.lastCompleted === 'number' && first.lastCompleted > 0) {
    return first;
  }

  const second = await fetchUpcomingFixtures();
  if (!first) return second;
  if (!second) return first;

  const firstCompleted = Number(first.lastCompleted) || 0;
  const secondCompleted = Number(second.lastCompleted) || 0;
  return secondCompleted >= firstCompleted ? second : first;
}

app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`IPL Standings Backend Server Running`);
  console.log(`Port: ${PORT}`);
  console.log(`API Endpoint: http://localhost:${PORT}/api/standings`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
  console.log(`Data Source: 2026 IPL Season (ESPN HTML scrape)`);
  console.log(`${'='.repeat(60)}\n`);
  console.log('Server ready! Waiting for API requests...\n');
});
