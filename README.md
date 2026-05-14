# IPL Qualification Calculator

A small static web app that estimates whether an IPL team has clinched a playoff place or how many additional wins are needed to guarantee qualification on points alone.

## What it uses

- 10 teams
- 14 matches per team by default
- 2 points for a win
- 1 point for a no-result or draw
- 0 points for a loss

## How to use

1. Open `index.html` in a browser.
2. Enter each team's completed-match record.
3. Pick a team from the dropdown to see its qualification status.
4. Optional: click `Load sample season` to see the calculator in action.

## Notes

- The calculator uses a conservative, points-only guarantee.
- Net run rate and tie-breakers are not modeled.
- If a team can still end on the same points as another contender, the app treats that as not guaranteed.
