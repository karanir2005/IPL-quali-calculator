// Qualification engine with tunable caps for testing.
// Adjust these two values to change the execution cutoff and qualifying-scenario threshold.
export let MAX_REMAINING_MATCHES = 15;
export let MAX_DETAILED_SCENARIOS = 5;

// Safety cap so brute-force enumeration doesn't explode in accidental test runs.
export let MAX_TOTAL_SCENARIOS = 200000;

function clone(value) {
	return JSON.parse(JSON.stringify(value));
}

function outcomeLabel(outcome, teamA, teamB) {
	if (outcome === 'A') return `${teamA} win`;
	if (outcome === 'B') return `${teamB} win`;
	return 'No result';
}

function buildScenarioSummary(path) {
	return path
		.map((step) => `Match ${step.matchNumber}: ${step.teamA} vs ${step.teamB} — ${outcomeLabel(step.outcome, step.teamA, step.teamB)}`)
		.join(' / ');
}

// teams: normalized standings rows with name, points, played, etc.
// fixtures: scraped fixtures with matchNumber, teamA, teamB, completed
export function computeQualification(teams, fixtures, opts = {}) {
	// Helper to resolve fixture team codes (RCB, RR, MI, etc.) to full standing team names
	function resolveTeamName(code) {
		if (!code) return code;
		const raw = String(code).replace(/[^A-Za-z]/g, '').toUpperCase();
		// exact match against full team name cleaned
		for (const t of teams || []) {
			const cleaned = String(t.name).replace(/[^A-Za-z]/g, '').toUpperCase();
			if (cleaned === raw) return t.name;
		}
		// match initials (e.g., Rajasthan Royals -> RR)
		for (const t of teams || []) {
			const initials = String(t.name).split(/\s+/).map(w => w[0] || '').join('').toUpperCase();
			if (initials === raw) return t.name;
		}
		// substring or subsequence match fallback
		for (const t of teams || []) {
			const cleaned = String(t.name).replace(/[^A-Za-z]/g, '').toUpperCase();
			if (cleaned.includes(raw)) return t.name;
			// subsequence: all chars of raw appear in order inside cleaned
			let i = 0; for (const ch of raw) { i = cleaned.indexOf(ch, i); if (i === -1) { i = -1; break; } i++; }
			if (i !== -1) return t.name;
		}
		// fallback to original code
		return code;
	}

	const basePoints = {};
	const baseNrr = {};
	for (const team of teams || []) {
		basePoints[team.name] = Number(team.points) || 0;
		baseNrr[team.name] = Number(team.nrr) || 0;
	}

	const remainingFixtures = (fixtures || [])
		.filter((fixture) => !fixture.completed)
		.map((fixture) => ({
			matchNumber: Number(fixture.matchNumber),
			teamA: resolveTeamName(fixture.teamA),
			teamB: resolveTeamName(fixture.teamB),
		}))
		.filter((fixture) => {
			if (!Number.isFinite(fixture.matchNumber) || fixture.matchNumber <= 0) return false;
			// Both team names must exist in standings — unresolved codes would create phantom
			// keys in pointsMap that persist across DFS branches (rollback leaves them at 0)
			// and cause the real team to never accumulate points in those scenarios.
			const aKnown = Object.prototype.hasOwnProperty.call(basePoints, fixture.teamA);
			const bKnown = Object.prototype.hasOwnProperty.call(basePoints, fixture.teamB);
			if (!aKnown || !bKnown) {
				console.warn(`[qualification] skipping match ${fixture.matchNumber}: unresolved team(s) — A="${fixture.teamA}" (${aKnown ? 'ok' : 'unknown'}), B="${fixture.teamB}" (${bKnown ? 'ok' : 'unknown'})`);
				return false;
			}
			return true;
		});

	const remainingMatches = remainingFixtures.length;

	const teamsWithRemainingGames = new Set();
	for (const f of remainingFixtures) {
		teamsWithRemainingGames.add(f.teamA);
		teamsWithRemainingGames.add(f.teamB);
	}

	if (remainingMatches > MAX_REMAINING_MATCHES) {
		return {
			success: false,
			reason: 'too_many_remaining_matches',
			remainingMatches,
			maxAllowed: MAX_REMAINING_MATCHES,
		};
	}

		// use 2^n branching (only wins/losses) to limit explosion
		// Use binary outcomes (win / loss) only to reduce complexity to 2^n
		const totalScenarios = Math.pow(2, remainingMatches);
		const detailedLimit = (opts && typeof opts.maxDetailedScenarios === 'number') ? opts.maxDetailedScenarios : MAX_DETAILED_SCENARIOS;
		if (totalScenarios > MAX_TOTAL_SCENARIOS) {
			return {
				success: false,
				reason: 'scenario_count_exceeds_limit',
				remainingMatches,
				totalScenarios,
				limit: MAX_TOTAL_SCENARIOS,
			};
		}

	const perTeamCounts = {};
	const detailedScenarioLists = {};
	for (const team of teams || []) {
		perTeamCounts[team.name] = {
			scenariosTotal: 0,
			scenariosTop4: 0,
			scenariosTop2: 0,
			scenariosTop4NrrDependent: 0,
			scenariosTop2NrrDependent: 0,
			scenariosTop4NrrOnly: 0,
			scenariosTop2NrrOnly: 0,
		};
		// prepare an array but only store up to the per-team cap during enumeration
		detailedScenarioLists[team.name] = [];
	}

	let exploredScenarios = 0;

	function rankTeams(pointsMap) {
		return Object.keys(pointsMap)
			.map((name) => ({ name, points: pointsMap[name], nrr: baseNrr[name] || 0 }))
			.sort((a, b) => {
				if (b.points !== a.points) return b.points - a.points;
				if (b.nrr !== a.nrr) return b.nrr - a.nrr;
				return a.name.localeCompare(b.name);
			});
	}

	function recordScenario(path, pointsMap) {
		exploredScenarios += 1;
		const ranking = rankTeams(pointsMap);
		// A slot is NRR-dependent if the team at that boundary is tied on points with the next team out.
		// rank index 3 (4th place) — tied with rank 4 (5th place) means top-4 boundary is NRR-decided.
		// rank index 1 (2nd place) — tied with rank 2 (3rd place) means top-2 boundary is NRR-decided.
		const top4BoundaryNrr = ranking.length >= 5 && ranking[3].points === ranking[4].points
			&& (teamsWithRemainingGames.has(ranking[3].name) || teamsWithRemainingGames.has(ranking[4].name));
		const top2BoundaryNrr = ranking.length >= 3 && ranking[1].points === ranking[2].points
			&& (teamsWithRemainingGames.has(ranking[1].name) || teamsWithRemainingGames.has(ranking[2].name));

		for (let i = 0; i < ranking.length; i++) {
			const entry = ranking[i];
			const count = perTeamCounts[entry.name];
			if (!count) continue;
			count.scenariosTotal += 1;
			if (i < 4) {
				count.scenariosTop4 += 1;
				// NRR-dependent: team is inside top 4 but boundary is a points tie — NRR decided they're in
				if (top4BoundaryNrr && (i === 3 || ranking[3].points === entry.points)) {
					count.scenariosTop4NrrDependent += 1;
				}
				if (i < 2) {
					count.scenariosTop2 += 1;
					if (top2BoundaryNrr && (i === 1 || ranking[1].points === entry.points)) {
						count.scenariosTop2NrrDependent += 1;
					}
				}
				if (detailedScenarioLists[entry.name] && detailedScenarioLists[entry.name].length < detailedLimit) {
					detailedScenarioLists[entry.name].push(buildScenarioSummary(path));
				}
			} else {
				// Team is outside top 4 — check if they're tied on points with rank 3 (last qualifier).
				// If so, better NRR could have put them through.
				if (ranking.length >= 4 && entry.points === ranking[3].points) {
					count.scenariosTop4NrrOnly += 1;
				}
				// Same for top 2 boundary
				if (ranking.length >= 2 && entry.points === ranking[1].points) {
					count.scenariosTop2NrrOnly += 1;
				}
			}
		}
	}

	function dfs(index, pointsMap, path) {
		if (index >= remainingFixtures.length) {
			recordScenario(path, pointsMap);
			return;
		}

		const fixture = remainingFixtures[index];
		const { teamA, teamB } = fixture;


		// A wins
		pointsMap[teamA] += 2;
		path.push({ matchNumber: fixture.matchNumber, teamA, teamB, outcome: 'A' });
		dfs(index + 1, pointsMap, path);
		path.pop();
		pointsMap[teamA] -= 2;

		// B wins
		pointsMap[teamB] += 2;
		path.push({ matchNumber: fixture.matchNumber, teamA, teamB, outcome: 'B' });
		dfs(index + 1, pointsMap, path);
		path.pop();
		pointsMap[teamB] -= 2;
	}

	const pointsMap = {};
	for (const team of teams || []) {
		pointsMap[team.name] = basePoints[team.name] || 0;
	}

	dfs(0, pointsMap, []);

	const teamSummaries = (teams || []).map((team) => {
		const counts = perTeamCounts[team.name] || { scenariosTotal: 0, scenariosTop4: 0, scenariosTop2: 0 };
		const scenariosTotal = counts.scenariosTotal;
		const scenariosTop4 = counts.scenariosTop4;
		const scenariosTop2 = counts.scenariosTop2;

		let status = 'Can Still Qualify';
		if (scenariosTotal > 0 && scenariosTop4 === scenariosTotal) {
			status = 'Guaranteed Top 4';
		} else if (scenariosTop4 === 0) {
			status = 'Eliminated';
		}

		return {
			...team,
			currentPoints: basePoints[team.name] || 0,
			scenariosTotal,
			scenariosTop4,
			scenariosTop2,
			scenariosTop4NrrDependent: counts.scenariosTop4NrrDependent || 0,
			scenariosTop2NrrDependent: counts.scenariosTop2NrrDependent || 0,
			scenariosTop4NrrOnly: counts.scenariosTop4NrrOnly || 0,
			scenariosTop2NrrOnly: counts.scenariosTop2NrrOnly || 0,
			status,
		};
	});

	const result = {
		success: true,
		totalScenarios: exploredScenarios,
		remainingMatches,
		maxRemainingMatches: MAX_REMAINING_MATCHES,
		maxDetailedScenarios: MAX_DETAILED_SCENARIOS,
		remainingFixtures,
		teams: teamSummaries,
	};

	if (totalScenarios > 0) {
		for (const team of teams || []) {
			const counts = perTeamCounts[team.name];
			if (!counts) continue;
			if (counts.scenariosTop4 === 0 || counts.scenariosTop4 > detailedLimit) {
				delete detailedScenarioLists[team.name];
			}
		}
	}

	if (Object.keys(detailedScenarioLists).length > 0) {
		result.qualifyingScenarios = detailedScenarioLists;
	}

	return result;
}

export default {
	computeQualification,
	MAX_REMAINING_MATCHES,
	MAX_DETAILED_SCENARIOS,
	MAX_TOTAL_SCENARIOS,
};
