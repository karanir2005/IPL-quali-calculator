import express from 'express';
import cors from 'cors';
import { fetchLiveStandings } from './backend/scraper.js';
import { normalizeTeam, sortStandings } from './backend/calculations.js';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
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
