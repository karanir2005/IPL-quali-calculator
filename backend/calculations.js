// Simple standings helper functions shared by the backend

export function normalizeTeam(t) {
  return {
    name: t.name || 'Unknown',
    played: parseInt(t.played) || parseInt(t.p) || 0,
    wins: parseInt(t.wins) || parseInt(t.w) || 0,
    losses: parseInt(t.losses) || parseInt(t.l) || 0,
    noResults: parseInt(t.noResults) || parseInt(t.nr) || 0,
    nrr: parseFloat(t.nrr) || 0,
    points: parseInt(t.points) || parseInt(t.pts) || 0
  };
}

export function sortStandings(teams) {
  return [...teams].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    return (b.nrr || 0) - (a.nrr || 0);
  });
}

export function computeTeamStats(team, matchesPerTeam = 14) {
  const played = team.played || (team.wins + team.losses + team.noResults) || 0;
  const remaining = Math.max(matchesPerTeam - played, 0);
  const points = (team.points !== undefined) ? team.points : (team.wins * 2 + team.noResults);
  const maxPoints = points + remaining * 2;
  return { ...team, played, remaining, points, maxPoints };
}
