async function fetchFixtures() {
  try {
    const r = await fetch('http://localhost:5000/api/fixtures', { cache: 'no-store' });
    if (!r.ok) throw new Error('Network error');
    const data = await r.json();
    return data;
  } catch (e) {
    return { success: false, fixtures: [] };
  }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch (e) {
    return iso;
  }
}

function render(fixtures) {
  const upcomingList = document.getElementById('upcomingList');
  const pastList = document.getElementById('pastList');
  const meta = document.getElementById('fixturesMeta');
  upcomingList.innerHTML = '';
  pastList.innerHTML = '';
  if (!fixtures || fixtures.length === 0) {
    meta.textContent = 'No fixtures found.';
    return;
  }
  // ensure numeric sort by matchNumber
  fixtures.sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
  meta.textContent = `${fixtures.length} fixtures (auto-scraped)`;

  const today = new Date(new Date().toDateString());
  // classify
  const upcoming = [];
  const past = [];
  const lastCompleted = window.__fixtures_lastCompleted || 0;
  fixtures.forEach(f => {
    let isPast = false;
    // If backend explicitly marked the fixture completed, respect that first
    if (f.completed === true) {
      isPast = true;
    } else if (f.date) {
      // compare full datetime (so matches earlier today are treated as past)
      const d = new Date(f.date);
      if (!isNaN(d.getTime())) isPast = d < new Date();
    } else if (f.matchNumber && lastCompleted) {
      isPast = f.matchNumber <= lastCompleted;
    }
    if (isPast) past.push(f); else upcoming.push(f);
  });

  // render upcoming then past
  upcoming.forEach(f => {
    const li = document.createElement('li');
    li.className = 'fixture-item';
    const parts = [];
    if (f.matchNumber) parts.push(`Match ${f.matchNumber}`);
    parts.push(f.date ? formatDate(f.date) : 'TBD');
    parts.push(`${f.teamA} vs ${f.teamB}`);
    li.textContent = parts.join(' — ');
    if (f.href) {
      const a = document.createElement('a');
      a.href = f.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = ' View match';
      a.style.marginLeft = '8px';
      li.appendChild(a);
    }
    upcomingList.appendChild(li);
  });

  // past
  past.forEach(f => {
    const li = document.createElement('li');
    li.className = 'fixture-item past';
    const parts = [];
    if (f.matchNumber) parts.push(`Match ${f.matchNumber}`);
    parts.push(f.date ? formatDate(f.date) : 'Date unknown');
    parts.push(`${f.teamA} vs ${f.teamB}`);
    li.textContent = parts.join(' — ');
    if (f.href) {
      const a = document.createElement('a');
      a.href = f.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = ' View scorecard';
      a.style.marginLeft = '8px';
      li.appendChild(a);
    }
    pastList.appendChild(li);
  });
}

let fixturesTimer = null;
const FIXTURES_AUTO_MS = 60 * 1000;

async function refreshFixtures() {
  const meta = document.getElementById('fixturesMeta');
  meta.textContent = 'Refreshing fixtures…';
  try {
    const payload = await fetchFixtures();
    if (payload && payload.success) {
      window.__fixtures_lastCompleted = payload.lastCompleted || 0;
      render(payload.fixtures || []);
      meta.textContent = `${(payload.fixtures || []).length} fixtures (auto-scraped)`;
    } else {
      render([]);
      meta.textContent = 'No fixtures found.';
    }
  } catch (e) {
    render([]);
    meta.textContent = 'Failed to load fixtures.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // initial load
  await refreshFixtures();

  // wire manual refresh button
  // Refresh when the page becomes visible again (user left and returned)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFixtures();
  });

  // auto-refresh while page is open
  if (fixturesTimer) clearInterval(fixturesTimer);
  fixturesTimer = setInterval(() => refreshFixtures(), FIXTURES_AUTO_MS);

  // cleanup on unload
  window.addEventListener('beforeunload', () => {
    if (fixturesTimer) clearInterval(fixturesTimer);
  });
});
