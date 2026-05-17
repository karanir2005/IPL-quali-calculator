import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';

function parseDateFromText(text) {
  if (!text) return null;
  const t = text.replace(/\u00A0/g, ' ');
  const now = new Date();
  const today = new Date(now.toDateString());
  // relative tokens
  if (/\btoday\b/i.test(t)) return today.toISOString();
  if (/\btomorrow\b/i.test(t)) return new Date(today.getTime() + 24*3600*1000).toISOString();

  const months = {
    jan: 'Jan', feb: 'Feb', mar: 'Mar', apr: 'Apr', may: 'May', jun: 'Jun',
    jul: 'Jul', aug: 'Aug', sep: 'Sep', oct: 'Oct', nov: 'Nov', dec: 'Dec',
    january: 'Jan', february: 'Feb', march: 'Mar', april: 'Apr', june: 'Jun',
    july: 'Jul', august: 'Aug', september: 'Sep', october: 'Oct', november: 'Nov', december: 'Dec'
  };

  // patterns: 15 May, May 15, 15 May 2026, May 15, 2026
  const re1 = /(\d{1,2})[\s,]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\b(?:[,\s]+(\d{4}))?/i;
  const re2 = /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:[,\s]+(\d{4}))?/i;

  let m = re1.exec(t) || re2.exec(t);
  if (m) {
    let day, mon, yr;
    if (m.length === 4) {
      if (/^\d/.test(m[1])) { day = m[1]; mon = m[2]; yr = m[3]; }
      else { mon = m[1]; day = m[2]; yr = m[3]; }
    }
    if (!yr) yr = '2026';
    const monNorm = mon.substring(0,3);
    const parsed = new Date(`${monNorm} ${day}, ${yr} GMT`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // fallback: look for ISO-like dates
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return new Date(iso[0]).toISOString();
  return null;
}

function parseTimeAndCombine(dateText, timeText) {
  if (!dateText) return null;
  const dateISO = parseDateFromText(dateText);
  if (!dateISO && !timeText) return null;
  // try to parse combined string
  const combined = `${dateText} ${timeText || ''}`.trim();
  // normalize common timezone labels
  const tzMap = { IST: '+05:30', BST: '+01:00', GMT: '+00:00', UTC: '+00:00' };
  let norm = combined.replace(/\b(IST|BST|GMT|UTC)\b/g, (m) => tzMap[m] || m);
  const parsed = Date.parse(norm);
  if (!isNaN(parsed)) return new Date(parsed).toISOString();
  // fallback to parsing date only
  return dateISO;
}

function extractDateFromBlock($, block) {
  if (!block || block.length === 0) return null;
  // 1. look for <time datetime="...">
  const timeEl = block.find('time').first();
  if (timeEl && timeEl.attr && timeEl.attr('datetime')) {
    const dt = timeEl.attr('datetime').trim();
    const parsed = Date.parse(dt);
    if (!isNaN(parsed)) return new Date(parsed).toISOString();
  }
  // 2. look for data-date or data-start attributes
  const attrEl = block.find('[data-date],[data-start],[data-dt]').filter((i, e) => $(e).attr('data-date') || $(e).attr('data-start') || $(e).attr('data-dt')).first();
  if (attrEl && attrEl.attr) {
    const dt = attrEl.attr('data-date') || attrEl.attr('data-start') || attrEl.attr('data-dt');
    if (dt) {
      const parsed = Date.parse(dt);
      if (!isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  // 3. look for visible elements with class containing date/time
  const candidates = block.find('*').filter((i, el) => {
    const cls = ($(el).attr('class') || '').toLowerCase();
    const tag = el.tagName || '';
    return /date|time|match|fixture/.test(cls) || tag === 'time';
  }).toArray();
  for (const c of candidates) {
    const txt = $(c).text().trim();
    if (!txt) continue;
    const byDate = parseDateFromText(txt);
    if (byDate) return byDate;
    // try to find date + time in the same text
    const datePart = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\b(?:[\s,]+\d{4})?)/i.exec(txt);
    const timePart = /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i.exec(txt);
    if (datePart) {
      const combined = parseTimeAndCombine(datePart[0], timePart ? timePart[0] : '');
      if (combined) return combined;
    }
  }
  // 4. final fallback: parse entire block text
  const full = block.text() || '';
  const fullParsed = parseDateFromText(full);
  if (fullParsed) return fullParsed;
  return null;
}

// Fetch live standings (unchanged behavior)
export async function fetchLiveStandings() {
  const source = {
    name: 'ESPN Cricinfo Official',
    url: 'https://www.espncricinfo.com/series/ipl-2026-1510719/points-table-standings'
  };

  try {
    console.log(`[${new Date().toLocaleTimeString()}] Scraping standings: ${source.url}`);
    const resp = await axios.get(source.url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (resp.status !== 200) throw new Error(`status ${resp.status}`);
    const teams = parseEspnCricinfoHtml(resp.data);
    if (!teams) throw new Error('No teams parsed');
    return { teams, source: source.name };
  } catch (err) {
    console.error(`✗ ${source.name} failed: ${err.message}`);
    return null;
  }
}

// Parse standings HTML
export function parseEspnCricinfoHtml(html) {
  try {
    const $ = cheerio.load(html);
    const teams = [];
    $('table tbody tr').each((index, element) => {
      try {
        const row = $(element);
        let cells = row.find('td');
        if (cells.length === 0) cells = row.find('[role="cell"]');
        if (cells.length < 8) return;
        const cellTexts = [];
        cells.each((i, cell) => cellTexts.push($(cell).text().trim()));
        let name = cellTexts[0].replace(/^\d+/, '').trim();
        const played = parseInt(cellTexts[1]) || 0;
        const wins = parseInt(cellTexts[2]) || 0;
        const losses = parseInt(cellTexts[3]) || 0;
        const noResults = parseInt(cellTexts[5]) || 0;
        const points = parseInt(cellTexts[6]) || (wins * 2 + noResults);
        let nrr = 0;
        if (cellTexts[7]) { const n = parseFloat(cellTexts[7]); if (!isNaN(n)) nrr = n; }
        if (name && played > 0) teams.push({ name, played, wins, losses, noResults, nrr, points });
      } catch (e) {
        // ignore row
      }
    });
    if (teams.length >= 8) return teams;
  } catch (e) {
    console.error('Error parsing standings HTML:', e.message);
  }
  return null;
}

// Fetch upcoming fixtures (robust parser)
export async function fetchUpcomingFixtures() {
  const url = 'https://www.espncricinfo.com/series/ipl-2026-1510719/match-schedule-fixtures-and-results';
  const MAX_ROUND = 70; // per user: 70 round matches

  try {
    console.log(`[${new Date().toLocaleTimeString()}] Scraping fixtures: ${url}`);
    const response = await axios.get(url, { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    try { fs.writeFileSync('schedule_dump.html', response.data, 'utf8'); } catch (e) { /* ignore */ }
    const $ = cheerio.load(response.data);

    const jsonLdDateMap = new Map();
    const addJsonLdDate = (matchNumber, startDate) => {
      const n = Number(matchNumber);
      if (!n || n < 1 || n > MAX_ROUND || !startDate) return;
      const parsed = Date.parse(startDate);
      if (isNaN(parsed)) return;
      if (!jsonLdDateMap.has(n)) jsonLdDateMap.set(n, new Date(parsed).toISOString());
    };

    $('script[type="application/ld+json"]').each((i, el) => {
      const raw = $(el).text().trim();
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const queue = Array.isArray(data) ? [...data] : [data];
        while (queue.length) {
          const item = queue.shift();
          if (!item || typeof item !== 'object') continue;
          const type = String(item['@type'] || '').toLowerCase();
          const name = String(item.name || item.description || '');
          const urlText = String(item.url || item?.broadcastOfEvent?.url || '');
          const startDate = item.startDate || item?.broadcastOfEvent?.startDate;
          const matchFromName = /(\d{1,3})(?:st|nd|rd|th)\s+Match/i.exec(name);
          const matchFromUrl = /(\d{1,3})(?:st|nd|rd|th)-match/i.exec(urlText);
          const matchNumber = matchFromName ? matchFromName[1] : (matchFromUrl ? matchFromUrl[1] : null);
          if (startDate && (type.includes('broadcastevent') || type.includes('sportsevent') || matchNumber)) {
            addJsonLdDate(matchNumber, startDate);
          }
          if (item.broadcastOfEvent && typeof item.broadcastOfEvent === 'object') queue.push(item.broadcastOfEvent);
        }
      } catch (e) {
        // ignore malformed JSON-LD blocks
      }
    });

    const anchors = $('a[href*="/live-cricket-score"], a[href*="/match-preview"], a[href*="/full-scorecard"]');
    const vsRegex = /(.+?)\s+vs\s+(.+?)(?:\s+-|$)/i;

    const fixtures = [];

    // Determine last completed match number by scanning RESULT tokens for 2026
    const htmlText = $.html();
    let lastCompleted = 0;
    const resultRegex = /RESULT\s+(\d{1,3})(?:st|nd|rd|th)\s+Match/gi;
    let r;
    while ((r = resultRegex.exec(htmlText)) !== null) {
      const num = parseInt(r[1]); if (!isNaN(num) && num > lastCompleted) lastCompleted = num;
    }

    // Primary pass: anchors that include 'vs' and match number nearby
    anchors.each((i, a) => {
      try {
        const el = $(a);
        const text = (el.text() || '').trim();
        const vs = vsRegex.exec(text);
        if (!vs) return;
        const teamAraw = vs[1].trim();
        const teamBraw = vs[2].trim();
        const cleanTeamA = (teamAraw.split(/\s+/)[0] || teamAraw).replace(/[^A-Za-z0-9]+/g,'').trim();
        const cleanTeamB = (teamBraw.split(/\s+/)[0] || teamBraw).replace(/[^A-Za-z0-9]+/g,'').trim();

        const hrefRaw = (el.attr('href') || '').trim();
        let matchNumber = null;
        const hrefMatch = /(\d{1,3})(?:st|nd|rd|th)-match/i.exec(hrefRaw);
        if (hrefMatch) matchNumber = parseInt(hrefMatch[1]);

        const windowText = el.parent().text() + ' ' + el.closest('section,article,div').text();
        if (!matchNumber) {
          const nearbyMatch = /(\d{1,3})(?:st|nd|rd|th)\s*[\u00A0\s]*Match/i.exec(windowText);
          if (nearbyMatch) matchNumber = parseInt(nearbyMatch[1]);
        }

        let dateISO = parseDateFromText(windowText);
        if (!dateISO) {
          const block = el.closest('section,article,div');
          const extra = extractDateFromBlock($, block);
          if (extra) dateISO = extra;
        }

        const absHref = hrefRaw ? (hrefRaw.startsWith('http') ? hrefRaw : `https://www.espncricinfo.com${hrefRaw}`) : '';

        const isCompleted = /won by|beat|defeat|defeated|result|chased|innings|abandoned|tie/i.test(windowText) || /full-scorecard|scorecard/i.test(hrefRaw);

        if (matchNumber && matchNumber >= 1 && matchNumber <= MAX_ROUND) {
          // ensure link belongs to 2026 series if present
          if (absHref && !/ipl-2026/.test(absHref)) return;
          fixtures.push({ teamA: cleanTeamA, teamB: cleanTeamB, date: dateISO, matchNumber, href: absHref, completed: !!isCompleted });
        }
      } catch (e) {
        // ignore anchor parse errors
      }
    });

    // Secondary pass: scan explicit match-number spans and nearby blocks
    const matchLabels = $('span').filter((i, s) => /(\d{1,3})(?:st|nd|rd|th)\s*Match/i.test($(s).text()));
    matchLabels.each((i, s) => {
      try {
        const label = $(s).text();
        const m = /(\d{1,3})(?:st|nd|rd|th)\s*Match/i.exec(label);
        if (!m) return;
        const matchNumber = parseInt(m[1]);
        if (isNaN(matchNumber) || matchNumber < 1 || matchNumber > MAX_ROUND) return;

        const block = $(s).closest('div,section,article');
        const blockText = block.text() || '';
        const vs = /([A-Za-z\.\s]+?)\s+vs\s+([A-Za-z\.\s]+?)/i.exec(blockText);

        let teamAraw, teamBraw;
        if (vs) {
          teamAraw = vs[1].trim();
          teamBraw = vs[2].trim();
        } else {
          const aEls = block.find('a').toArray().map(x => $(x).text().trim()).filter(t => t && !/ipl|series|match-schedule|full scorecard|scorecard/i.test(t));
          if (aEls.length >= 2) {
            teamAraw = aEls[0];
            teamBraw = aEls[1];
          } else {
            const spanTexts = block.find('span').toArray().map(x => $(x).text().trim()).filter(t => t && !/match|ipl|series/i.test(t));
            if (spanTexts.length >= 2) {
              teamAraw = spanTexts[0];
              teamBraw = spanTexts[1];
            } else return;
          }
        }

        const cleanTeamA = (teamAraw.split(/\s+/)[0] || teamAraw).replace(/[^A-Za-z0-9]+/g,'').trim();
        const cleanTeamB = (teamBraw.split(/\s+/)[0] || teamBraw).replace(/[^A-Za-z0-9]+/g,'').trim();

        let href = '';
        const hrefMatch = block.html() && /href="([^"]*?(?:-\d{1,3}(?:st|nd|rd|th)\-match|live-cricket-score|match-preview|full-scorecard)[^"]*)"/i.exec(block.html());
        if (hrefMatch) href = hrefMatch[1].startsWith('http') ? hrefMatch[1] : `https://www.espncricinfo.com${hrefMatch[1]}`;
        else {
          const anyA = block.find('a').attr('href');
          if (anyA) href = anyA.startsWith('http') ? anyA : `https://www.espncricinfo.com${anyA}`;
        }

        // attempt to parse a date from the block
        let parsedDate = parseDateFromText(blockText);
        if (!parsedDate) parsedDate = extractDateFromBlock($, block);
        // determine if completed from surrounding text or href
        const isCompleted = /won by|beat|defeat|defeated|result|chased|innings|abandoned|tie/i.test(blockText) || /full-scorecard|scorecard/i.test(href || '');
        // only include if 2026 link or no href present
        if (href && !/ipl-2026/.test(href)) return;

        fixtures.push({ teamA: cleanTeamA, teamB: cleanTeamB, date: parsedDate, matchNumber, href, completed: !!isCompleted });
      } catch (e) {
        // ignore
      }
    });

    // Dedupe by matchNumber, prefer entries with href/date
    const byNumber = new Map();
    for (const f of fixtures) {
      if (!f.matchNumber) continue;
      const n = Number(f.matchNumber);
      if (n < 1 || n > MAX_ROUND) continue;
      const existing = byNumber.get(n);
      if (!existing) { byNumber.set(n, f); continue; }
      if (!existing.href && f.href) { byNumber.set(n, f); continue; }
      if (!existing.date && f.date) { byNumber.set(n, f); continue; }
    }

    // Build final array for matches 1..MAX_ROUND
    const result = [];
    for (let i = 1; i <= MAX_ROUND; i++) {
      if (byNumber.has(i)) result.push(byNumber.get(i));
    }

    result.sort((a, b) => a.matchNumber - b.matchNumber);

    // compute lastCompleted from detected completed flags (fallback to earlier regex)
    const computedLast = result.reduce((acc, f) => {
      if (f && f.completed && Number(f.matchNumber) > acc) return Number(f.matchNumber);
      return acc;
    }, 0);
    if (computedLast > lastCompleted) lastCompleted = computedLast;

    console.log(`✓ Parsed ${result.length} league fixtures (1..${MAX_ROUND}) (lastCompleted=${lastCompleted})`);
    // Fill dates from embedded JSON-LD if available
    for (const f of result) {
      if (!f.date && jsonLdDateMap.has(Number(f.matchNumber))) {
        f.date = jsonLdDateMap.get(Number(f.matchNumber));
      }
    }

    // If many fixtures still lack dates, fetch individual match pages to extract start times
    const needDates = result.filter(r => !r.date && r.href);
    if (needDates.length > 0) {
      console.log(`Fetching ${needDates.length} match pages to extract missing dates (this may take a moment)...`);
      for (const f of needDates) {
        try {
          const dt = await fetchDateFromMatchPage(f.href);
          if (dt) f.date = dt;
        } catch (e) {
          // ignore per-match errors
        }
      }
    }

    // recompute lastCompleted after date fetches
    const recomputedLast = result.reduce((acc, f) => {
      if (f && (f.completed || (f.date && new Date(f.date) < new Date()))) {
        if (Number(f.matchNumber) > acc) return Number(f.matchNumber);
      }
      return acc;
    }, lastCompleted);

    // Mark fixtures as completed when their parsed date is in the past
    const now = new Date();
    for (const f of result) {
      if (f && f.date) {
        const d = new Date(f.date);
        if (!isNaN(d.getTime()) && d < now) {
          f.completed = true;
        }
      }
    }

    if (recomputedLast > lastCompleted) lastCompleted = recomputedLast;

    return { fixtures: result, source: 'ESPN Cricinfo', lastCompleted };
  } catch (error) {
    console.error('Error fetching fixtures:', error.message);
    return null;
  }
}

async function fetchDateFromMatchPage(url) {
  try {
    const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (resp.status !== 200) return null;
    const $ = cheerio.load(resp.data);
    // 1. JSON-LD
    const jsonLd = $('script[type="application/ld+json"]').map((i, el) => $(el).text()).get().join('\n');
    try {
      const objs = JSON.parse(jsonLd);
      if (objs) {
        const start = (objs.startDate || (Array.isArray(objs) && objs[0] && objs[0].startDate));
        if (start) {
          const p = Date.parse(start);
          if (!isNaN(p)) return new Date(p).toISOString();
        }
      }
    } catch (e) {
      // ignore JSON parse
    }
    // 2. time[datetime]
    const timeEl = $('time[datetime]').first();
    if (timeEl && timeEl.attr('datetime')) {
      const p = Date.parse(timeEl.attr('datetime'));
      if (!isNaN(p)) return new Date(p).toISOString();
    }
    // 3. meta description or og:description
    const metaDesc = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content');
    if (metaDesc) {
      const parsed = parseDateFromText(metaDesc);
      if (parsed) return parsed;
    }
    // 4. fallback: scan page text
    const bodyText = $.text();
    const parsed = parseDateFromText(bodyText);
    if (parsed) return parsed;
    return null;
  } catch (err) {
    return null;
  }
}
