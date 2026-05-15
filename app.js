const teamSelect = document.getElementById('teamSelect');
const refreshButton = document.getElementById('refreshData');
const standingsBody = document.getElementById('standingsBody');
const selectedTeamName = document.getElementById('selectedTeamName');
const statusPill = document.getElementById('statusPill');
const currentPoints = document.getElementById('currentPoints');
const matchesPlayed = document.getElementById('matchesPlayed');
const remainingMatches = document.getElementById('remainingMatches');
const winsNeeded = document.getElementById('winsNeeded');
const summaryCopy = document.getElementById('summaryCopy');
const refreshState = document.getElementById('refreshState');
const liveMeta = document.getElementById('liveMeta');

const TEAM_COUNT = 10;
const CACHE_KEY = 'ipl-quali-live-cache-v1';
const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;
const QUALIFYING_SPOTS = 4;
const DEFAULT_MATCHES_PER_TEAM = 14;
const IPL_EVENT_NAME = 'Indian Premier League';

let teams = [];
let seasonLabel = '';
let lastUpdated = '';
let selectedTeamIndex = 0;
let refreshTimer = null;
let refreshInFlight = false;

function parseNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function parseSeasonValue(value) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 0;
  }

  const base = Number.parseInt(text, 10);
  if (!Number.isFinite(base)) {
    return 0;
  }

  if (text.includes('/')) {
    return base + 0.5;
  }

  return base;
}

function formatSeasonLabel(season) {
  return season || 'Latest IPL season';
}

function getSeasonKey(match) {
  return parseSeasonValue(match.info?.season);
}

function getTeamStats(team, matchesPerTeam) {
  const played = team.wins + team.losses + team.noResults;
  const remaining = Math.max(matchesPerTeam - played, 0);
  const points = team.wins * 2 + team.noResults;
  const maxPoints = points + remaining * 2;

  return {
    ...team,
    played,
    remaining,
    points,
    maxPoints,
  };
}

function sortStandings(stats) {
  return [...stats].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if ((b.nrr || 0) !== (a.nrr || 0)) return (b.nrr || 0) - (a.nrr || 0);
    if (b.maxPoints !== a.maxPoints) return b.maxPoints - a.maxPoints;
    return a.name.localeCompare(b.name);
  });
}

function getThreshold(stats, selectedIndex) {
  const opponentCeilings = stats
    .filter((_, index) => index !== selectedIndex)
    .map((team) => team.maxPoints)
    .sort((a, b) => b - a);

  return opponentCeilings[QUALIFYING_SPOTS - 1] ?? 0;
}

function buildTeamSelect() {
  const currentValue = teamSelect.value;
  teamSelect.innerHTML = '';

  teams.forEach((team, index) => {
    const option = document.createElement('option');
    option.value = String(index);
    option.textContent = team.name;
    teamSelect.appendChild(option);
  });

  const candidateValue = currentValue && teams[Number(currentValue)] ? currentValue : String(selectedTeamIndex);
  teamSelect.value = teams[Number(candidateValue)] ? candidateValue : '0';
  selectedTeamIndex = Number(teamSelect.value) || 0;
}

function renderStandings() {
  const matchesPerTeam = DEFAULT_MATCHES_PER_TEAM;
  const stats = teams.map((team) => getTeamStats(team, matchesPerTeam));
  const sorted = sortStandings(stats);
  const selectedStats = stats[selectedTeamIndex] || stats[0];

  if (!selectedStats) {
    return;
  }

  const threshold = getThreshold(stats, selectedTeamIndex);
  const winsToGuarantee = Math.max(0, Math.floor((threshold - selectedStats.points) / 2) + 1);
  const qualified = selectedStats.points > threshold;
  const impossible = !qualified && winsToGuarantee > selectedStats.remaining;

  selectedTeamName.textContent = selectedStats.name;
  currentPoints.textContent = String(selectedStats.points);
  matchesPlayed.textContent = String(selectedStats.played);
  remainingMatches.textContent = String(selectedStats.remaining);
  winsNeeded.textContent = qualified ? '0' : String(winsToGuarantee);

  statusPill.className = 'pill';
  if (qualified) {
    statusPill.textContent = 'Qualified';
    statusPill.classList.add('clinched');
  } else if (impossible) {
    statusPill.textContent = 'Not yet possible';
    statusPill.classList.add('impossible');
  } else {
    statusPill.textContent = 'Still open';
    statusPill.classList.add('pending');
  }

  if (qualified) {
    summaryCopy.textContent = `${selectedStats.name} has already qualified for the playoffs on points alone. Even a worst-case finish still leaves them above the fifth-place ceiling.`;
  } else if (impossible) {
    summaryCopy.textContent = `${selectedStats.name} cannot guarantee qualification yet. Even winning all remaining matches would leave them short of the conservative playoff threshold.`;
  } else {
    summaryCopy.textContent = `${selectedStats.name} needs ${winsToGuarantee} more win${winsToGuarantee === 1 ? '' : 's'} to guarantee qualification under the conservative points-only check.`;
  }

  renderTable(sorted, selectedStats.name);
  liveMeta.textContent = `${stats.length} teams loaded from ${formatSeasonLabel(seasonLabel)}. Last refreshed ${lastUpdated || 'just now'}.`;
}

function renderTable(sortedStats, selectedName) {
  standingsBody.innerHTML = '';
  sortedStats.forEach((team) => {
    const row = document.createElement('tr');
    if (team.name === selectedName) {
      row.classList.add('row-target');
    }

    const nrr = typeof team.nrr === 'number' ? team.nrr : 0;
    const nrrText = (nrr >= 0 ? '+' : '') + nrr.toFixed(2);

    row.innerHTML = `
      <td class="team-name">${escapeHtml(team.name)}</td>
      <td>${team.played}</td>
      <td>${team.wins}</td>
      <td>${team.losses}</td>
      <td>${team.noResults}</td>
      <td class="nrr">${nrrText}</td>
      <td>${team.points}</td>
      <td>${team.maxPoints}</td>
    `;

    standingsBody.appendChild(row);
  });

  // add golden separator under the QUALIFYING_SPOTS-th row
  const rows = Array.from(standingsBody.querySelectorAll('tr'));
  rows.forEach((r) => r.classList.remove('qualifier-separator'));
  if (rows.length >= QUALIFYING_SPOTS) {
    rows[QUALIFYING_SPOTS - 1].classList.add('qualifier-separator');
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function updateRefreshState(message, loading = false) {
  refreshState.textContent = message;
  refreshButton.disabled = loading;
  refreshButton.textContent = loading ? 'Refreshing...' : 'Refresh live data';
}

// Caching disabled - all data is fresh from backend API

function setStateFromPayload(payload) {
  teams = payload.teams || [];
  seasonLabel = payload.seasonLabel || '';
  lastUpdated = payload.lastUpdated || '';
  selectedTeamIndex = Math.min(selectedTeamIndex, Math.max(teams.length - 1, 0));

  if (!teams.length) {
    teams = Array.from({ length: TEAM_COUNT }, (_, index) => ({
      name: `Team ${index + 1}`,
      wins: 0,
      losses: 0,
      noResults: 0,
    }));
  }

  buildTeamSelect();
  renderStandings();
}

async function fetchLiveIPLStandings() {
  // Fetch from local backend server that scrapes ESPN Cricinfo for 2026 season
  try {
    const response = await fetch('http://localhost:5000/api/standings', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Backend returned status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Backend returned error status');
    }
    
    if (data?.teams?.length > 0) {
      // Ensure all required fields exist
      const teams = data.teams.map(t => ({
        name: t.name || `Team ${t.name}`,
        wins: parseInt(t.wins) || 0,
        losses: parseInt(t.losses) || 0,
        noResults: parseInt(t.noResults) || 0,
        played: parseInt(t.played) || 0,
        nrr: parseFloat(t.nrr) || 0,
        points: parseInt(t.points) || 0
      }));
      
      return {
        teams: teams.slice(0, 10),
        seasonLabel: '2026',
        lastUpdated: new Date().toLocaleString(),
        source: data.source || 'ESPN Cricinfo'
      };
    }
    
    throw new Error('Backend returned no teams data');
  } catch (error) {
    throw new Error(`Failed to fetch standings from backend: ${error.message}. Make sure the backend server is running on port 5000.`);
  }
}

async function refreshLiveData({ force = false } = {}) {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  updateRefreshState('Fetching fresh data from ESPN Cricinfo...', true);

  try {
    // Always fetch fresh data - no caching
    const payload = await fetchLiveIPLStandings();
    setStateFromPayload(payload);
    updateRefreshState(`✓ Live data updated at ${payload.lastUpdated}`);
  } catch (error) {
    updateRefreshState('❌ Failed to load live data.');
    summaryCopy.textContent = `Could not load live IPL data. ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    refreshInFlight = false;
  }
}

teamSelect.addEventListener('change', (event) => {
  selectedTeamIndex = Number(event.target.value) || 0;
  renderStandings();
});
refreshButton.addEventListener('click', () => refreshLiveData({ force: true }));

// Initialize with blank teams
teams = Array.from({ length: TEAM_COUNT }, (_, index) => ({
  name: `Team ${index + 1}`,
  wins: 0,
  losses: 0,
  noResults: 0,
  points: 0,
  nrr: 0,
}));
buildTeamSelect();
renderStandings();
updateRefreshState('Click "Refresh live data" to fetch current standings', false);

// Fetch data immediately on page load
refreshLiveData();
