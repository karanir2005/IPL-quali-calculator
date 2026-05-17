# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install        # install dependencies
npm start          # start backend server on port 5000
```

Open `index.html` directly in a browser (or via a static server) after starting the backend. There is no build step and no test suite.

## Architecture

This is a two-layer app with no bundler or framework.

**Backend** (`server.js` + `backend/`): Express server on port 5000 with four API endpoints:
- `GET /api/standings` — scrapes the ESPN Cricinfo points table, normalizes, and sorts teams
- `GET /api/fixtures` — scrapes the ESPN Cricinfo match schedule and returns all 70 league fixtures
- `GET /api/remaining-fixtures` — filters to unplayed fixtures and groups them by team
- `GET /api/qualification` — combines standings + fixtures and runs the full qualification enumeration

**Frontend** (`index.html`, `fixtures.html`, `app.js`, `styles.css`): Plain HTML/CSS/JS that calls the backend at `http://localhost:5000`.

### Backend modules

| File | Responsibility |
|---|---|
| `backend/scraper.js` | `fetchLiveStandings()` and `fetchUpcomingFixtures()` — HTTP scrape + Cheerio parse of ESPN Cricinfo. Writes a debug dump to `schedule_dump.html`. |
| `backend/calculations.js` | `normalizeTeam()`, `sortStandings()`, `computeTeamStats()` — shared data-shaping helpers. |
| `backend/qualification.js` | `buildRemainingFixturesTable()` and `evaluateQualificationReport()` — the core qualification logic. |

### Qualification algorithm (`backend/qualification.js`)

`evaluateQualificationReport` exhaustively enumerates all `3^N` outcome combinations for the N remaining fixtures (each match can be a win for team A, draw, or win for team B). For each leaf it:
1. Applies delta points to base standings
2. Sorts and ranks all 10 teams (points → NRR → name)
3. Tracks per-team metrics: qualifying scenario count, best/worst rank, self-outcome masks

A team's status is determined by `overallWorstRank` and `overallBestRank` across all scenarios:
- **Guaranteed Top 4**: worst rank across all 3^N scenarios ≤ 4
- **Qualified**: currently in top 4 and can still get there
- **Can Still Qualify**: best possible rank ≤ 4 but not guaranteed
- **Eliminated**: best possible rank > 4 in every scenario

For teams with ≤ 5 qualifying scenarios, the code does a second full enumeration pass to collect concrete example scenario strings.

### Points system

IPL uses: Win = 2 pts, No result = 1 pt, Loss = 0 pts. The qualification engine uses Win = 3, Draw = 1, Loss = 0 in its enumeration delta math — this is intentional and matches the format where draws in cricket are labeled differently from no-results.

### Scraper behavior

- No fallback data — if ESPN Cricinfo scraping fails, the API returns `{ success: false, teams: [] }`.
- `fetchUpcomingFixtures` uses two passes: primary (links containing "vs"), secondary (match-number span labels), then deduplicates by match number.
- `lastCompleted` is detected by scanning for `RESULT Nth Match` tokens in the raw HTML.
- Missing dates are resolved by fetching individual match pages (`fetchDateFromMatchPage`).
- The project is ESM (`"type": "module"` in package.json); all backend files use `import`/`export`.
