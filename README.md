# IPL Qualification Calculator

A live IPL qualification calculator that fetches real standings data from ESPN Cricinfo and estimates whether a team has clinched a playoff place or how many additional wins are needed to guarantee qualification.

## Architecture

- **Backend**: Node.js server that scrapes ESPN Cricinfo for live standings data
- **Frontend**: Static HTML/CSS/JavaScript that displays standings and calculates qualification chances
- **Data Flow**: Backend → Frontend API call → Live standings rendering

## Setup & Installation

### Prerequisites
- Node.js 14+ installed
- npm installed

### Step 1: Install Backend Dependencies

```bash
cd IPL-quali-calculator
npm install
```

This installs:
- `express`: Web server
- `cors`: Enables frontend to call backend
- `axios`: HTTP requests
- `cheerio`: Web scraping for ESPN Cricinfo

### Step 2: Start the Backend Server

```bash
npm start
```

You should see:
```
=================================================
IPL Standings Backend Server Running
Port: 5000
API Endpoint: http://localhost:5000/api/standings
=================================================
```

The backend will now fetch live IPL standings from ESPN Cricinfo every time you hit the API.

### Step 3: Open the Frontend

1. Open `index.html` in your browser (or serve it with a local HTTP server)
2. The app will automatically fetch current standings on page load
3. Click "Refresh live data" to get updated standings at any time

## How It Works

**Points System:**
- Win: 2 points
- No Result/Draw: 1 point
- Loss: 0 points
- Matches per team: 14 (fixed)
- Qualifying spots: 4

**Qualification Logic:**
The app uses a conservative approach:
- A team is "Qualified" when their current points exceed what the 5th-place team could possibly reach (current_points > 4th_highest_opponent_maximum_points)
- "Still open" when qualification is theoretically possible but not yet guaranteed
- "Not yet possible" when even winning all remaining matches won't guarantee qualification

**Data Source:**
- Live standings scraped directly from ESPN Cricinfo (IPL 2026).
- The backend attempts to fetch fresh data on every request; there is NO fallback dataset.
- If the scraper fails or no live data is found, the API returns an empty result and the frontend will show no standings.

## Features

- ✅ Live data from ESPN Cricinfo (fresh on every refresh)
- ✅ Select any team from dropdown to see status
- ✅ Shows matches played, wins needed, remaining matches
- ✅ Net Run Rate (NRR) from official source
- ✅ Golden separator line under top 4 qualifiers
- ✅ Backend runs on Port 5000

## Notes

- The calculator uses a conservative, points-only guarantee.
- Net run rate and tie-breakers are not modeled.
- If a team can still end on the same points as another contender, the app treats that as not guaranteed.
