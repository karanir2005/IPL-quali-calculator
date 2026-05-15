import express from 'express';
import cors from 'cors';
import { fetchLiveStandings, DEFAULT_STANDINGS_2026 } from './backend/scraper.js';
import { normalizeTeam, sortStandings } from './backend/calculations.js';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
// scraper and calculation helpers moved to backend modules

app.get('/api/standings', async (req, res) => {
  try {
    console.log('\n========================================');
    console.log('API request: /api/standings');
    console.log('Time:', new Date().toLocaleTimeString());
    console.log('Attempting to fetch live 2026 IPL data...');
    console.log('========================================');
    
    // Try to fetch from any available live source
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
    
    // Fallback to default 2026 standings if live data not available
    if (teams.length === 0) {
      console.log('\n⚠ Using default 2026 IPL standings');
      teams = DEFAULT_STANDINGS_2026;
      source = 'ESPN Cricinfo (2026 Season - Default)';
    } else {
      console.log(`\n✓ Successfully retrieved live data from: ${source}`);
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
      source: source
    });

  } catch (error) {
    console.error('\n❌ Unexpected error in /api/standings:');
    console.error(error.message);
    
    // Return default data even on error
    return res.json({
      success: true,
      teams: DEFAULT_STANDINGS_2026.slice(0, 10),
      lastUpdated: new Date().toLocaleString(),
      source: 'ESPN Cricinfo (2026 Season - Default Fallback)'
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
  console.log(`Data Source: 2026 IPL Season (Live + Default Fallback)`);
  console.log(`${'='.repeat(60)}\n`);
  console.log('Server ready! Waiting for API requests...\n');
});
