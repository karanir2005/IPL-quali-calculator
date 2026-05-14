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
const CRICSHEET_URL = 'https://cricsheet.org/downloads/ipl_json.zip';
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

  // elimination check: if even winning all remaining matches can't reach the current 4th place points
  const opponentCurrentPoints = stats
    .filter((_, i) => i !== selectedTeamIndex)
    .map((t) => t.points)
    .sort((a, b) => b - a)[QUALIFYING_SPOTS - 1] ?? 0;
  const eliminated = selectedStats.maxPoints <= opponentCurrentPoints;

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
  } else if (eliminated) {
    statusPill.textContent = 'Eliminated';
    statusPill.classList.add('eliminated');
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

    const nrrRaw = typeof team.nrrText === 'string' && team.nrrText ? team.nrrText : null;
    const nrr = typeof team.nrr === 'number' ? team.nrr : 0;
    const nrrText = nrrRaw || ((nrr >= 0 ? '+' : '') + nrr.toFixed(3));

    row.innerHTML = `
      <td class="team-name">${escapeHtml(team.name)}</td>
      <td>${team.played}</td>
      <td>${team.wins}</td>
      <td>${team.losses}</td>
      <td>${team.noResults}</td>
      <td class="nrr">${escapeHtml(nrrText)}</td>
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

function loadCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    return JSON.parse(cached);
  } catch {
    return null;
  }
}

function saveCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures.
  }
}

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

async function fetchZipData() {
  const response = await fetch(CRICSHEET_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load IPL data: ${response.status}`);
  }

  const zipBuffer = await response.arrayBuffer();
  const archive = await JSZip.loadAsync(zipBuffer);
  const matches = [];

  for (const [fileName, file] of Object.entries(archive.files)) {
    if (!fileName.endsWith('.json') || file.dir) {
      continue;
    }

    const text = await file.async('text');
    const match = JSON.parse(text);
    if (match.info?.event?.name === IPL_EVENT_NAME) {
      matches.push(match);
    }
  }

  if (!matches.length) {
    throw new Error('No IPL matches found in the Cricsheet archive.');
  }

  const latestSeasonKey = Math.max(...matches.map(getSeasonKey));
  const latestSeasonMatches = matches.filter((match) => getSeasonKey(match) === latestSeasonKey);
  const seasonLabel = latestSeasonMatches[0]?.info?.season || '';
  const teamMap = new Map();

  latestSeasonMatches.forEach((match) => {
    const [homeTeam, awayTeam] = match.info?.teams || [];
    if (homeTeam && !teamMap.has(homeTeam)) {
      teamMap.set(homeTeam, { name: homeTeam, wins: 0, losses: 0, noResults: 0, runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0, nrr: 0 });
    }
    if (awayTeam && !teamMap.has(awayTeam)) {
      teamMap.set(awayTeam, { name: awayTeam, wins: 0, losses: 0, noResults: 0, runsFor: 0, ballsFaced: 0, runsAgainst: 0, ballsBowled: 0, nrr: 0 });
    }

    // accumulate innings runs and legal balls for NRR calculation
    const inningsList = match.innings || [];
    inningsList.forEach((innings) => {
      // skip super overs if present
      if (innings.is_super_over || innings.super_over || String(innings.type || '').toLowerCase().includes('super')) return;

      const teamName = innings.team || innings.team_name || innings['team'];
      if (!teamName || !teamMap.has(teamName)) return;

      let inningsRuns = 0;
      let legalBalls = 0;

      const processDelivery = (d) => {
        if (!d || typeof d !== 'object') return;
        const delivery = d.runs ? d : d;
        const runs = Number((delivery.runs && (delivery.runs.total ?? delivery.runs.bat ?? delivery.runs)) || 0);
        inningsRuns += runs;
        const extras = delivery.extras || {};
        const wides = Number(extras.wides || 0);
        const noballs = Number(extras.noballs || 0);
        if (wides === 0 && noballs === 0) legalBalls += 1;
      };

      // Cricsheet may present deliveries nested under overs, or a flat deliveries array
      if (Array.isArray(innings.overs) && innings.overs.length) {
        innings.overs.forEach((ov) => {
          const deliveries = ov.deliveries || [];
          deliveries.forEach((d) => {
            // deliveries here are often objects keyed by ball number
            if (d && typeof d === 'object' && !Array.isArray(d)) {
              const vals = Object.values(d);
              if (vals.length === 1 && vals[0] && typeof vals[0] === 'object') {
                processDelivery(vals[0]);
              } else {
                processDelivery(d);
              }
            }
          });
        });
      } else if (Array.isArray(innings.deliveries) && innings.deliveries.length) {
        innings.deliveries.forEach((entry) => {
          if (entry && typeof entry === 'object') {
            const vals = Object.values(entry);
            if (vals.length === 1 && vals[0] && typeof vals[0] === 'object') {
              processDelivery(vals[0]);
            } else {
              processDelivery(entry);
            }
          }
        });
      }

      const opponent = [homeTeam, awayTeam].find((t) => t && t !== teamName);
      // update team stats
      const teamEntry = teamMap.get(teamName);
      teamEntry.runsFor += inningsRuns;
      teamEntry.ballsFaced += legalBalls;

      if (opponent && teamMap.has(opponent)) {
        const oppEntry = teamMap.get(opponent);
        oppEntry.runsAgainst += inningsRuns;
        oppEntry.ballsBowled += legalBalls;
      }
    });

    const outcome = match.info?.outcome || {};
    const winner = outcome.winner || outcome.eliminator || outcome.bowl_out || null;
    const result = String(outcome.result || '').toLowerCase();

    if (winner) {
      const loser = [homeTeam, awayTeam].find((team) => team && team !== winner);
      if (teamMap.has(winner)) {
        teamMap.get(winner).wins += 1;
      }
      if (loser && teamMap.has(loser)) {
        teamMap.get(loser).losses += 1;
      }
    } else if (result === 'no result' || result === 'draw' || result === 'tie') {
      if (homeTeam && teamMap.has(homeTeam)) {
        teamMap.get(homeTeam).noResults += 1;
      }
      if (awayTeam && teamMap.has(awayTeam)) {
        teamMap.get(awayTeam).noResults += 1;
      }
    }
  });

  // compute NRR
  for (const entry of teamMap.values()) {
    const oversFor = entry.ballsFaced / 6 || 0;
    const oversAgainst = entry.ballsBowled / 6 || 0;
    const runRateFor = oversFor > 0 ? entry.runsFor / oversFor : 0;
    const runRateAgainst = oversAgainst > 0 ? entry.runsAgainst / oversAgainst : 0;
    entry.nrr = runRateFor - runRateAgainst;
  }

  const teams = Array.from(teamMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  return {
    teams,
    seasonLabel,
    lastUpdated: new Date().toLocaleString(),
  };
}

async function fetchWikiStandings(year = new Date().getFullYear()) {
  const pageTitle = `${year} Indian Premier League`;
  const endpoint = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text&format=json&origin=*`;

  const resp = await fetch(endpoint, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Wikipedia fetch failed: ${resp.status}`);
  const json = await resp.json();
  const html = json?.parse?.text?.['*'];
  if (!html) throw new Error('Could not parse Wikipedia response');

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try to find a wikitable that contains the league table headers we expect.
  const tables = Array.from(doc.querySelectorAll('table'));
  let chosen = null;
  const nrrRegex = /^[+\-]?\d+\.\d{2,3}$/;
  for (const t of tables) {
    const headers = Array.from(t.querySelectorAll('th')).map((th) => th.textContent.trim().toLowerCase());
    // quick header check for pts or nrr
    if (headers.some(h => h.includes('pts') || h.includes('point') || h.includes('nrr') || h.includes('net run rate'))) {
      chosen = t;
      break;
    }
    // otherwise look for a data row containing an NRR-looking cell
    const dataRows = Array.from(t.querySelectorAll('tr')).filter(r => r.querySelectorAll('td').length > 1);
    if (dataRows.length) {
      const sample = dataRows.slice(0, 4);
      let found = false;
      for (const r of sample) {
        const cells = Array.from(r.querySelectorAll('td')).map(td => td.textContent.trim());
        if (cells.some(c => nrrRegex.test(c) || /pts|points/i.test(c))) {
          found = true; break;
        }
      }
      if (found) {
        chosen = t; break;
      }
    }
  }

  if (!chosen) throw new Error('Could not locate league table on the Wikipedia page');

  // map header names to column indices (handle tables without a thead)
  let headerCells = Array.from(chosen.querySelectorAll('thead th')).map((th) => th.textContent.trim());
  let headerRowNode = null;
  if (!headerCells.length) {
    const firstTr = chosen.querySelector('tr');
    if (firstTr) {
      headerRowNode = firstTr;
      headerCells = Array.from(firstTr.children).map((c) => c.textContent.trim());
    }
  }
  const headerLower = headerCells.map((h) => h.toLowerCase());
  const idx = (nameCandidates) => {
    for (const cand of nameCandidates) {
      const i = headerLower.findIndex((h) => h.includes(cand));
      if (i >= 0) return i;
    }
    return -1;
  };

  let iTeam = idx(['team', 'club', 'side']);
  let iPld = idx(['p', 'pld', 'played']);
  let iW = idx(['w', 'won']);
  let iL = idx(['l', 'lost']);
  let iNR = idx(['nr', 'no result', 'draw', 'tie']);
  let iPts = idx(['pts', 'points']);
  let iNrr = idx(['nrr', 'net run rate']);

  // defensive: if an index falls outside headerCells length, treat as not found
  const hdrLen = headerCells.length || 0;
  if (iTeam >= hdrLen) iTeam = -1;
  if (iPld >= hdrLen) iPld = -1;
  if (iW >= hdrLen) iW = -1;
  if (iL >= hdrLen) iL = -1;
  if (iNR >= hdrLen) iNR = -1;
  if (iPts >= hdrLen) iPts = -1;
  if (iNrr >= hdrLen) iNrr = -1;

  let rows = [];
  const tbody = chosen.querySelector('tbody');
  if (tbody) rows = Array.from(tbody.querySelectorAll('tr'));
  else rows = Array.from(chosen.querySelectorAll('tr'));
  // if we used the first tr as headerRowNode, skip it
  if (headerCells.length && rows.length) {
    const firstRowCells = Array.from(rows[0].children).map((c) => c.textContent.trim());
    if (firstRowCells.length === headerCells.length && firstRowCells.every((v, i) => v === headerCells[i])) {
      rows = rows.slice(1);
    }
  }
  const teams = [];
  for (const row of rows) {
    const cols = Array.from(row.querySelectorAll('td'));
    if (cols.length < 2) continue;
    let name = (iTeam >= 0 ? (cols[iTeam]?.textContent || cols[0]?.textContent) : cols[0]?.textContent) || '';
    name = name.trim();
    // if the captured name looks like a numeric rank, try to pick the next textual column
    if (/^\d+$/.test(name)) {
      const fallback = cols.find((c) => !/^\d+$/.test(c.textContent.trim()) && c.textContent.trim().length > 0);
      if (fallback) name = fallback.textContent.trim();
    }
    if (!name) continue;
    const played = iPld >= 0 ? parseInt(cols[iPld]?.textContent.trim()) || 0 : 0;
    const wins = iW >= 0 ? parseInt(cols[iW]?.textContent.trim()) || 0 : 0;
    const losses = iL >= 0 ? parseInt(cols[iL]?.textContent.trim()) || 0 : 0;
    const noResults = iNR >= 0 ? parseInt(cols[iNR]?.textContent.trim()) || 0 : 0;
    const points = iPts >= 0 ? parseInt(cols[iPts]?.textContent.trim()) || (wins * 2 + noResults) : (wins * 2 + noResults);
    let nrr = 0;
    let nrrText = '';
    if (iNrr >= 0) {
      nrrText = (cols[iNrr]?.textContent || '').trim().replace('\u2212', '-');
      nrr = parseFloat(nrrText) || 0;
    }

    teams.push({ name, wins, losses, noResults, played, points, nrr, nrrText });
  }

  if (!teams.length) throw new Error('No teams parsed from Wikipedia table');

  return { teams, seasonLabel: String(year), lastUpdated: new Date().toLocaleString() };
}

async function refreshLiveData({ force = false } = {}) {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;
  updateRefreshState('Refreshing live season data...', true);

  try {
    if (!force) {
      const cached = loadCache();
      if (cached && cached.teams?.length) {
        setStateFromPayload(cached);
      }
    }

    // Use Wikipedia standings as the single live source for external data.
    const payload = await fetchWikiStandings();
    saveCache(payload);
    setStateFromPayload(payload);
    updateRefreshState(`Live data updated ${payload.lastUpdated} (Wikipedia).`);
  } catch (error) {
    const cached = loadCache();
    if (cached && cached.teams?.length) {
      setStateFromPayload(cached);
      updateRefreshState('Using cached IPL data after a refresh failure.');
      summaryCopy.textContent = `${selectedTeamName.textContent} is shown from the last cached IPL snapshot because the live refresh failed.`;
    } else {
      updateRefreshState('Failed to load live data.');
      summaryCopy.textContent = `Could not load live IPL data. ${error instanceof Error ? error.message : String(error)}`;
    }
  } finally {
    refreshInFlight = false;
  }
}

teamSelect.addEventListener('change', (event) => {
  selectedTeamIndex = Number(event.target.value) || 0;
  renderStandings();
});
refreshButton.addEventListener('click', () => refreshLiveData({ force: true }));
const cached = loadCache();
if (cached?.teams?.length) {
  setStateFromPayload(cached);
  updateRefreshState('Loaded cached IPL data. Refreshing live source...');
} else {
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
  updateRefreshState('Loading live data...', true);
}

refreshLiveData();
refreshTimer = window.setInterval(() => refreshLiveData(), AUTO_REFRESH_MS);
