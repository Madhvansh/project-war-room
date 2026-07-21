// WAR ROOM — boot, router, shared state + helpers.
// curriculum.json is the single source of truth; data/*.json is the user's
// record; all Regime 1 logic lives in laws.js (audited by `npm test`).
import * as Laws from './laws.js';
import { renderMission, cleanupMission } from './views/mission.js';
import { renderSolve, cleanupSolve } from './views/solve.js';
import { renderRecognize, cleanupRecognize } from './views/recognize.js';
import { renderCards, cleanupCards } from './views/cards.js';
import { renderDurability } from './views/durability.js';
import { renderDp } from './views/dp.js';
import { renderCfAscent } from './views/cf-ascent.js';
import { renderCorecs } from './views/corecs.js';
import { renderSysd } from './views/sysd.js';
import { cleanupProduce } from './produce.js';
import { renderCommand } from './views/command.js';
import { renderOa, cleanupOa } from './views/oa.js';
import { renderGauntlet, cleanupGauntlet } from './views/gauntlet.js';
import { renderInterview, cleanupInterview } from './views/interview.js';
import { renderRapidfire, cleanupRapidfire } from './views/rapidfire.js';
import { renderArena, cleanupArena } from './views/arena.js';       // SEASON 3
import { renderDoctrine, cleanupDoctrine } from './views/doctrine.js'; // SEASON 3
import { renderGrill, cleanupGrill } from './views/grill.js';       // SEASON 3
import { renderWarplan } from './views/warplan.js';                 // SEASON 3
import { renderWall } from './views/wall.js';
import { renderLadder, cleanupDrill } from './views/ladder.js';
import { renderLog } from './views/log.js';
import { renderMock, cleanupMock } from './views/mock.js';
import { renderReport } from './views/report.js';
import { renderCalendar } from './views/calendar.js';
import { renderForge } from './views/forge.js';
import { openPalette, closePalette } from './views/palette.js';
import { openShortcuts, closeShortcuts } from './views/shortcuts.js';

export { Laws };
export const App = {
  cur: null,           // curriculum.json
  state: null,         // { log, cards, days, ladder, session }
  pending: null,       // problem picked for solve mode, before session starts
  speed: 1,            // dev-only timer accelerator (?speed=60)
  clockOverride: null, // dev-only wall-clock minutes (?clock=23:05), nag testing
  dateOverride: null,  // dev-only date (?date=2026-06-14), day-view testing
  focusDay: null,      // FOCUS DAY: run another curriculum day as the active
                       // mission (catch-up / work-ahead). A date string in
                       // cur.days, or null = the real today. NEVER feeds the
                       // truth layer (row.date, sealing, record) — only what
                       // Mission Control presents + the forDay tag on solves.
  focusSetReal: null   // the real IST date when focus was last set (stale guard)
};

// ── api ──────────────────────────────────────────────────────────────────────
async function jfetch(url, opts) {
  const r = await fetch(url, opts);
  // surface the server's own error text (e.g. "spawn claude ENOENT") when it
  // sends one — the bare URL+status hides the real cause from the AI drawers
  if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error || `${url} → ${r.status}`); }
  return r.json();
}
export const api = {
  post: (path, body) => jfetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  }),
  put: (name, doc) => jfetch(`/api/${name}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
  })
};

export async function appendLog(row) {
  row.id = row.id || crypto.randomUUID();
  row.ts = Date.now();
  App.state.log.push(row);
  await api.post('/api/log', row);
}
export async function deleteLog(id) {
  App.state.log = App.state.log.filter(r => r.id !== id);
  await api.post('/api/log/delete', { id });
}
export async function appendCard(card) {
  card.id = card.id || crypto.randomUUID();
  card.ts = Date.now();
  App.state.cards.push(card);
  await api.post('/api/cards', card);
}
export async function saveSession(s) { App.state.session = s; await api.put('session', s); }
export async function saveDays() { await api.put('days', App.state.days); }
export async function saveLadder() { await api.put('ladder', App.state.ladder); }
export async function saveReviews() { await api.put('reviews', App.state.reviews); }
export async function saveMocks() { await api.put('mocks', App.state.mocks); }
export async function saveCandidates() { await api.put('candidates', App.state.candidates); }
export async function saveDp() { await api.put('dp', App.state.dp); }                 // SEASON 2 W6
export async function saveCfAscent() { await api.put('cfAscent', App.state.cfAscent); } // SEASON 2 W6
export async function saveCorecs() { await api.put('corecs', App.state.corecs); }      // SEASON 2 W7
export async function saveSysd() { await api.put('sysd', App.state.sysd); }            // SEASON 2 W7
export async function saveOaSims() { await api.put('oaSims', App.state.oaSims); }       // SEASON 2 W8
export async function saveInterviews() { await api.put('interviews', App.state.interviews); } // SEASON 2 W8
export async function saveCompanies() { await api.put('companies', App.state.companies); }     // SEASON 2 W8
export async function saveArena() { await api.put('arena', App.state.arena); }             // SEASON 3
export async function saveDoctrine() { await api.put('doctrine', App.state.doctrine); }    // SEASON 3
export async function saveGrill() { await api.put('grill', App.state.grill); }             // SEASON 3
export async function saveWarplan() { await api.put('warplan', App.state.warplan); }       // SEASON 3

// SEASON 3 shipped content — lazy, promise-cached; loaded on first view visit,
// never a boot blocker. Resolves null when the file is absent (views degrade).
const s3cache = {};
export function s3Content(name) { // 'arena' | 'doctrine' | 'grill' | 'warplan'
  return (s3cache[name] ||= jfetch(`/${name}.s3.json`).catch(() => null));
}

// shared pattern vocabulary: every pattern field autocompletes from his own
// past cards, so names converge and the vault/weak-topic stats group cleanly
export function patternDatalist() {
  const set = new Set();
  for (const c of App.state.cards) if (c.pattern) set.add(c.pattern.trim());
  return `<datalist id="patterns">${[...set].sort().map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist>`;
}

// trigger-bank lookup: canonical card + depth tiers + links for any problem
// name or alias (null until problems.json loads — callers must degrade)
export function problemInfo(name) {
  return App.problemIndex?.get(String(name ?? '').toLowerCase()) || null;
}

// off-sheet curated extras (⊕). These are NOT on the 435 sheet, so they are not
// on TUF+ — their link must point to the real platform [user, 2026-06-15].
export function isSupplement(problem) {
  return (App.cur?.supplements || []).includes(problem);
}
// the problem's page link. The 435 sheet → TUF+ (the deterministic tuf_plus baked
// into problems.json, landing on the statement). Off-sheet supplements (⊕) → the
// real platform link (LeetCode/GfG/…). Names with no bank entry at all (CF ladder
// fills, contest problems) fall straight to a search.
export function problemLink(problem) {
  const info = problemInfo(problem);
  if (isSupplement(problem)) // ⊕ → its real platform, never a bogus TUF+ guess
    return info?.link || `https://www.google.com/search?q=${encodeURIComponent(problem + ' leetcode')}`;
  if (info?.tuf_plus) return info.tuf_plus;
  if (info?.link) return info.link;
  return `https://www.google.com/search?q=${encodeURIComponent(problem + ' takeuforward leetcode')}`;
}
// label the setup-window link by the platform it actually points to
export function linkLabel(problem) {
  const url = problemLink(problem);
  if (/takeuforward\.org/.test(url)) return 'open on TUF+';
  if (/leetcode\.com/.test(url)) return 'open on LeetCode';
  if (/geeksforgeeks\.org/.test(url)) return 'open on GfG';
  if (/codeforces\.com/.test(url)) return 'open on Codeforces';
  if (/google\.com\/search/.test(url)) return 'find the problem';
  return 'open the problem';
}

// (the pre-solve pattern-family chip was removed — naming the pattern is the
// drill, so the canonical is held back to the card/reveal step, never the list
// [user, 2026-06-15])

// supplements (off-sheet, never move 435) and read-only items carry marks
// wherever a problem name renders [Wave 4 items E+G]
export function sheetMark(problem) {
  if ((App.cur.supplements || []).includes(problem))
    return '<span class="suppmark" title="supplement — off-sheet, kept for depth; never moves 435 or the pace">⊕</span>';
  if ((App.cur.read_only || []).includes(problem))
    return '<span class="romark" title="read-only: a 10-minute read counts as touched">📖</span>';
  return '';
}

// ── text / time utils ────────────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pad2 = n => String(n).padStart(2, '0');
// §3.9: the day is the IST date, full stop — machine timezone is irrelevant
export function todayStr() {
  if (App.dateOverride) return App.dateOverride;
  return Laws.istDate(Date.now(), App.cur?.meta?.timezone
    || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
}
export function clock(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function mmss(totalSec) {
  const neg = totalSec < 0;
  const s = Math.abs(Math.round(totalSec));
  return `${neg ? '-' : ''}${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
export function minToHM(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? pad2(m) : ''}` : `${m}m`;
}

// ── sprint date logic ────────────────────────────────────────────────────────
export function sprintDayN(dateStr = todayStr()) {
  return Math.floor((Date.parse(dateStr) - Date.parse(App.cur.meta.start_date)) / 864e5) + 1;
}
export function preSprint() { return sprintDayN() < 1; }
export function displayDayN() { return Math.min(Math.max(sprintDayN(), 1), App.cur.days.length); }
// what a log row's `day` should say: warm-up work before Day 1 is day 0 —
// it banks into the sheet but never masquerades as sprint-day work
export function logDayN() { return preSprint() ? 0 : displayDayN(); }
export function dayEntry(n = displayDayN()) { return App.cur.days.find(d => d.day === n); }
// §3.9 stamp for a new log row: real date always; forDay tags catch-up (past)
// and work-ahead (future) solves; `day` is the sprint day the row CREDITS
export function logStamp(forDay = null) {
  const date = todayStr();
  if (!forDay || forDay === date) {
    return { date, day: preSprint() ? 0 : displayDayN() };
  }
  const credit = Laws.creditDate({ date, forDay });
  const n = sprintDayN(credit);
  return { date, day: n < 1 ? 0 : Math.min(n, App.cur.days.length), forDay };
}
export function sprintWeek(n = displayDayN()) { return Math.min(3, Math.ceil(Math.max(n, 1) / 7)); }

// ── FOCUS DAY (run any of the 20 days as the active mission) ─────────────────
// A presentation/navigation override, NOT a law change. activeDate() is what
// Mission Control renders and what solves tag as forDay; the §3.9 credit rule
// (laws.js) then routes the credit — catch-up (a past day) credits the real
// today, work-ahead (a future day) credits that day. todayStr() stays the real
// IST date everywhere truth is computed (row.date, sealing, the W/L record), so
// the seal can never be falsified. Persisted in localStorage; deep-linkable via
// ?focus=YYYY-MM-DD (parallel to the dev ?date=).
const FOCUS_KEY = 'p435.focusDay';
export function isFocusDate(date) {
  return !!date && App.cur?.days?.some(d => d.date === date);
}
// the curriculum date the mission is presenting (focusDay if it's a real, non-today day)
export function activeDate() {
  return (App.focusDay && App.focusDay !== todayStr() && isFocusDate(App.focusDay)) ? App.focusDay : todayStr();
}
export function isFocused() { return activeDate() !== todayStr(); }
// the day the focused work CREDITS (§3.9): catch-up → real today; work-ahead → the focus day
export function creditFocusDate() {
  return Laws.creditDate({ date: todayStr(), forDay: activeDate() });
}
export function activeDayN() {
  const n = sprintDayN(activeDate());
  return Math.min(Math.max(n, 1), App.cur.days.length);
}
export function focusDirection() {
  if (!isFocused()) return null;
  return activeDate() < todayStr() ? 'catch-up' : 'work-ahead';
}
export function setFocusDay(date) {
  if (!isFocusDate(date) || date === todayStr()) return clearFocusDay();
  App.focusDay = date;
  App.focusSetReal = todayStr();
  try {
    localStorage.setItem(FOCUS_KEY, date);
    localStorage.setItem(FOCUS_KEY + '.real', App.focusSetReal);
  } catch {}
  rerender();
}
export function clearFocusDay() {
  App.focusDay = null;
  App.focusSetReal = null;
  try { localStorage.removeItem(FOCUS_KEY); localStorage.removeItem(FOCUS_KEY + '.real'); } catch {}
  rerender();
}
// boot: restore a saved focus, honouring a ?focus= deep-link; drop anything
// invalid or equal to today. Returns true if a stale (real-day-rolled) past
// focus survived, so the banner can warn.
export function restoreFocusDay() {
  let date = null, setReal = null;
  const qf = new URLSearchParams(location.search).get('focus');
  if (qf && /^\d{4}-\d{2}-\d{2}$/.test(qf)) date = qf;
  else {
    try { date = localStorage.getItem(FOCUS_KEY); setReal = localStorage.getItem(FOCUS_KEY + '.real'); } catch {}
  }
  if (!isFocusDate(date) || date === todayStr()) { App.focusDay = null; App.focusSetReal = null; return false; }
  App.focusDay = date;
  App.focusSetReal = setReal || todayStr();
  return date < todayStr() && App.focusSetReal !== todayStr(); // rolled over while parked on a past day
}

// ── SEASON 2 CAMPAIGN — the self-paced "second attempt" ──────────────────────
// A NEW presentation lane, NOT a focusDay. The focus engine disengages once the
// real date passes Day 20 (creditDate collapses a past forDay to today; Mission's
// focus guard requires real-today to be a curriculum day). The campaign instead
// decides which curriculum day's lists Mission presents, keeps its OWN win state
// (campaign.json perDay, name-matched via stats.campaignDayStatus), and NEVER
// seals or forges a calendar day. row.date stays the real IST today everywhere
// truth is computed — the frozen §3.9 seal machinery keeps running underneath as
// archived Season-1 history. WIN = every Tier A + every Tier B of the day done
// (counting existing Season-1 solves), recorded automatically [user 2026-06-30].
export function campaignDoc() { return App.state?.campaign || null; }
export function campaignOn() { return campaignDoc()?.mode === 'campaign'; }
export function campaignPointer() {
  const n = campaignDoc()?.pointer ?? 2;
  return Math.min(Math.max(n, 1), App.cur.days.length);
}
export function campaignEntry() { return dayEntry(campaignPointer()); }
export function campaignDate() { return campaignEntry()?.date || todayStr(); }
export async function saveCampaign() { if (App.state.campaign) await api.put('campaign', App.state.campaign); }

// Start (or resume) the second attempt: open on Day 2. WIN is derived strictly
// from completing all Tier A + Tier B (campaignDayStatus), so no day is faked as
// cleared — Day 1's last Tier-B items remain honestly open until you finish them.
export async function startCampaign(pointer = 2) {
  const c = (App.state.campaign ||= {});
  Object.assign(c, { season: 2, schema: 1, mode: 'campaign' });
  c.pointer = Math.min(Math.max(pointer, 1), App.cur.days.length);
  c.started ||= todayStr();
  c.completed ||= [];
  c.perDay ||= {};
  await saveCampaign(); rerender();
}
export async function stopCampaign() {
  const c = App.state.campaign; if (!c) return;
  c.mode = 'off'; await saveCampaign(); rerender();
}
export async function setCampaignPointer(n) {
  const c = App.state.campaign; if (!c) return;
  c.pointer = Math.min(Math.max(n, 1), App.cur.days.length);
  c.perDay ||= {}; (c.perDay[c.pointer] ||= {}).opened ||= Date.now();
  await saveCampaign(); rerender();
}
// auto-record a win the moment all Tier A + Tier B of a day are done. Idempotent
// (first time only); mutates in place synchronously so re-renders don't loop, then
// persists. Returns true if it NEWLY recorded the win (so the view can celebrate).
export function recordCampaignWin(n) {
  const c = App.state.campaign; if (!c) return false;
  c.perDay ||= {};
  if ((c.perDay[n] ||= {}).wonAt) return false;
  c.perDay[n].wonAt = Date.now();
  c.perDay[n].wonDate = todayStr();
  c.completed = [...new Set([...(c.completed || []), n])].sort((a, b) => a - b);
  saveCampaign(); // fire-and-forget; the in-place mutation already blocks re-entry
  return true;
}
// advance the cursor to the next curriculum day (bursts/manual stepping).
// The strip lets you jump to any day directly, so a simple +1 is predictable.
export async function campaignNext() {
  await setCampaignPointer(Math.min(campaignPointer() + 1, App.cur.days.length));
}
// curriculum days won during THIS real day — the burst (for the header chip)
export function campaignBurst() {
  const c = campaignDoc(); if (!c?.perDay) return [];
  const t = todayStr();
  return Object.entries(c.perDay).filter(([, v]) => v.wonDate === t && v.wonAt)
    .map(([n]) => +n).sort((a, b) => a - b);
}
// the produce-from-blank review queue size (the forget-cliff nudge in the header)
export function reviewDueCount() {
  if (!App.state?.cards?.length) return 0;
  try { return Laws.buildReviewDeck(App.state.cards, App.state.reviews || {}, todayStr()).length; }
  catch { return 0; }
}

// ── quota / win / progress — thin wrappers over the audited laws.js engine ──
export function effQuota(dateStr = todayStr()) { return Laws.effectiveQuota(App.cur, App.state, dateStr); }
export function problemStatus() { return Laws.problemStatus(App.state.log); }
export function completedA(dateStr) { return Laws.completedA(App.state.log, dateStr); }
export function recognizedB(dateStr) { return Laws.recognizedB(App.state.log, dateStr); }
export function isWonOn(dateStr) { return Laws.isWonOn(App.cur, App.state, dateStr); }
export function record() { return Laws.record(App.cur, App.state, todayStr()); }
export function sheetCount() { return Laws.sheetCount(App.cur, App.state.log); }
export function overflowQueue() {
  return preSprint() ? [] : Laws.overflowQueue(App.cur, App.state.log, displayDayN());
}

export function projectedFinish() {
  const daysWithWork = new Set(App.state.log.map(r => r.date)).size;
  if (!daysWithWork) return null;
  const baseline = App.cur.meta.baseline_done ?? 0;
  const touched = sheetCount() - baseline;
  const remaining = 435 - sheetCount();
  if (remaining <= 0) return 'DONE';
  const pace = touched / daysWithWork;
  if (pace <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() + Math.ceil(remaining / pace));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ── header + router ──────────────────────────────────────────────────────────
function renderHeader() {
  const hdr = document.getElementById('hdr');
  const n = displayDayN();
  const { wins, losses, streak } = record();
  const route = (location.hash || '#/').split('?')[0];
  const focused = isFocused();
  const due = reviewDueCount();
  const campOn = campaignOn();
  const burst = campOn ? campaignBurst().length : 0;
  const navlink = (h, label) =>
    `<a href="${h}" class="${route === h ? 'active' : ''}">${label}</a>`;
  hdr.innerHTML = `
    <span class="brand">WAR ROOM</span>
    <span class="stat">DAY <b>${preSprint() ? '—' : n}</b>/20</span>
    <span class="stat">SHEET <b>${sheetCount()}</b>/435</span>
    <span class="stat">RECORD <b class="won">${wins}W</b>–<b>${losses}L</b></span>
    <span class="stat">STREAK <b>${streak}</b>🔥</span>
    ${focused ? `<span class="focuschip" title="running Day ${activeDayN()} (${focusDirection()}); the real day is Day ${n}">▶ RUNNING D${activeDayN()}<button id="hdrbacktoday" title="back to today">↩ today</button></span>` : ''}
    ${campOn ? `<span class="campchip" title="the second attempt — running curriculum Day ${campaignPointer()} at your pace; nothing is reset">▶ CAMPAIGN D${campaignPointer()}${burst > 1 ? ` <b class="burst">+${burst}</b>` : ''}</span>` : ''}
    ${due ? `<a class="duechip" href="#/durability" title="${due} cards in the produce-from-blank review queue — beat the 70% forget cliff">◆ ${due} REVIEW</a>` : ''}
    ${App.speed !== 1 ? `<span class="dev">DEV ×${App.speed}</span>` : ''}
    ${App.clockOverride != null ? '<span class="dev">DEV CLOCK</span>' : ''}
    ${App.dateOverride ? `<span class="dev">DEV DATE ${App.dateOverride}</span>` : ''}
    <nav>
      ${navlink('#/', 'MISSION')}
      ${navlink('#/warplan', 'WAR PLAN')}
      ${navlink('#/command', 'COMMAND')}
      ${navlink('#/arena', 'ARENA')}
      ${navlink('#/doctrine', 'DOCTRINE')}
      ${navlink('#/grill', 'GRILL')}
      ${navlink('#/calendar', 'CALENDAR')}
      ${navlink('#/cards', 'CARDS')}
      ${navlink('#/durability', 'DURABILITY')}
      ${navlink('#/cf-ascent', 'CF↑')}
      ${navlink('#/corecs', 'CORE CS')}
      ${navlink('#/sysd', 'SYSD')}
      ${navlink('#/wall', 'WALL')}
      ${navlink('#/ladder', 'SPEED DRILL')}
      ${navlink('#/forge', 'FORGE')}
      ${navlink('#/mock', 'MOCK')}
      ${navlink('#/log', 'LOG')}
    </nav>`;
  hdr.querySelector('#hdrbacktoday')?.addEventListener('click', () => { clearFocusDay(); location.hash = '#/'; });
}

export function rerender() { route(); }

// Navigation ruling [Wave 4]: navigation is FREE during an active session —
// the floating mini-timer pill keeps the clock in sight everywhere. The hard
// lock remains ONLY on the card-form phase: the pattern card is still the one
// exit door (§3.1, §3.2). Concurrent sessions are guarded in the cockpits.
function sessionRoute() {
  const s = App.state.session;
  return s ? (s.kind === 'recognition' ? '#/recognize' : '#/solve') : null;
}
function routeLocked() {
  const s = App.state.session;
  return s && s.phase === 'card' ? sessionRoute() : null;
}

// ── the mini-timer pill: phase color, solve-minutes, pause state ─────────────
function renderPill() {
  const s = App.state?.session;
  const route = (location.hash || '#/').split('?')[0];
  const sr = sessionRoute();
  let pill = document.getElementById('timerpill');
  if (!s || route === sr) { pill?.remove(); return; }
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'timerpill';
    pill.title = 'click to return to the cockpit';
    pill.addEventListener('click', () => { location.hash = sessionRoute(); });
    document.body.appendChild(pill);
  }
  const paused = !!s.pausedAt;
  const el = Laws.solveElapsedMin(s);
  let phase, remain, cls;
  if (s.kind === 'recognition') { phase = 'TIER B'; remain = Laws.TIERB_CEIL_MIN - el; cls = 'recog'; }
  else if (s.phase === 'reimplement') {
    phase = 'RE-IMPL';
    remain = s.reimplStartTs ? Laws.REIMPL_MIN - (Date.now() - s.reimplStartTs) / 60000 * (s.speed || 1) : null;
    cls = 'reimpl';
  } else if (s.phase === 'editorial') { phase = 'EDITORIAL'; remain = null; cls = 'reimpl'; }
  else if (s.phase === 'card') { phase = 'CARD'; remain = null; cls = 'solvep'; }
  else { phase = 'SOLVE'; remain = Laws.CEIL_MIN - el; cls = 'solvep'; }
  pill.className = `${cls}${paused ? ' paused' : ''}`;
  pill.innerHTML = `<span class="pphase">${paused ? '⏸ ' : ''}${phase}</span>` +
    (remain != null && !paused ? `<span class="ptime">${mmss(Math.max(remain, 0) * 60)}</span>` : '') +
    (paused ? '<span class="ptime">paused</span>' : '');
}

function route() {
  cleanupSolve();
  cleanupRecognize();
  cleanupCards();
  cleanupMission();
  cleanupDrill();
  cleanupMock();
  cleanupProduce(); // SEASON 2 W7: core-CS / sysd produce reps
  cleanupOa(); cleanupGauntlet(); cleanupInterview(); cleanupRapidfire(); // SEASON 2 W8
  cleanupArena(); cleanupDoctrine(); cleanupGrill(); // SEASON 3
  renderHeader();
  const view = document.getElementById('view');
  view.innerHTML = '';
  document.getElementById('modal-root').innerHTML = '';
  const h = location.hash || '#/';
  const sr = routeLocked(); // card phase only — everything else navigates freely
  if (sr && h !== sr) { location.hash = sr; return; }
  renderPill();
  if (h === '#/solve') renderSolve(view);
  else if (h === '#/recognize') renderRecognize(view);
  else if (h === '#/cards') renderCards(view);
  else if (h === '#/durability') renderDurability(view); // SEASON 2
  else if (h === '#/dp') renderDp(view); // SEASON 2 W6
  else if (h === '#/cf-ascent') renderCfAscent(view); // SEASON 2 W6
  else if (h === '#/corecs') renderCorecs(view); // SEASON 2 W7
  else if (h === '#/sysd') renderSysd(view); // SEASON 2 W7
  else if (h === '#/command') renderCommand(view); // SEASON 2 W8
  else if (h === '#/oa') renderOa(view); // SEASON 2 W8
  else if (h === '#/gauntlet') renderGauntlet(view); // SEASON 2 W8
  else if (h === '#/interview') renderInterview(view); // SEASON 2 W8
  else if (h === '#/rapidfire') renderRapidfire(view); // SEASON 2 W8
  else if (h === '#/arena') renderArena(view); // SEASON 3 — blind banks (#/dp stays routed as legacy)
  else if (h === '#/doctrine') renderDoctrine(view); // SEASON 3 — shipped theory + drills
  else if (h === '#/grill') renderGrill(view); // SEASON 3 — project defense
  else if (h === '#/warplan') renderWarplan(view); // SEASON 3 — 10-day crunch board + gates
  else if (h.startsWith('#/calendar')) renderCalendar(view);
  else if (h === '#/forge') renderForge(view);
  else if (h.startsWith('#/wall')) renderWall(view);
  else if (h === '#/ladder') renderLadder(view);
  else if (h === '#/mock') renderMock(view);
  else if (h === '#/report') renderReport(view);
  else if (h === '#/log') renderLog(view);
  else renderMission(view);
}

// ── §3.4 sleep-guard nag: past the hard stop, visible and annoying ───────────
let nagSnoozedUntil = 0;

function wallMinutes() {
  if (App.clockOverride != null) return App.clockOverride;
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function checkNag() {
  const sg = App.cur.schedule_template.sleep_guard;
  const m = wallMinutes();
  const past = m >= Laws.parseHM(sg.hard_stop) || m < 5 * 60; // 23:00 through 05:00
  const el = document.getElementById('sleepnag');
  if (!past || Date.now() < nagSnoozedUntil) { el?.remove(); return; }
  const now = `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
  if (el) { el.querySelector('.nagclock').textContent = now; return; }
  const bar = document.createElement('div');
  bar.id = 'sleepnag';
  bar.innerHTML = `<span class="nagclock">${now}</span> — PAST ${esc(sg.hard_stop)}. HARD STOP.
    In bed by ${esc(sg.in_bed)}. The plan survives a short day, not a broken sleep cycle.
    <button id="nagsnooze">5 min</button>`;
  document.body.appendChild(bar);
  bar.querySelector('#nagsnooze').addEventListener('click', () => {
    nagSnoozedUntil = Date.now() + 5 * 60000; // it comes back. that's the law.
    bar.remove();
  });
}

// ── boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  const sp = new URLSearchParams(location.search).get('speed');
  if (sp && +sp > 0) App.speed = +sp;
  const ck = new URLSearchParams(location.search).get('clock');
  if (ck && /^\d{1,2}:\d{2}$/.test(ck)) App.clockOverride = Laws.parseHM(ck);
  const dt = new URLSearchParams(location.search).get('date');
  if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) App.dateOverride = dt;
  try {
    [App.cur, App.state] = await Promise.all([jfetch('/curriculum.json'), jfetch('/api/state')]);
    App.state.reviews ||= {};
    App.state.mocks ||= [];
    App.state.candidates ||= [];
    App.state.campaign ||= { season: 2, schema: 1, mode: 'off', pointer: 2, started: null, completed: [], perDay: {}, baseline: null };
    App.state.dp ||= { solved: {}, upsolve: [] };
    App.state.cfAscent ||= { attempts: [], ratingTarget: 1850 };
    App.state.corecs ||= { done: {}, cursor: {} };
    App.state.sysd ||= { artifacts: [] };
    App.state.oaSims ||= [];
    App.state.interviews ||= [];
    App.state.companies ||= [];
    App.state.arena ||= { activeSession: null, attempts: [], resolveQueue: [] };   // SEASON 3
    App.state.doctrine ||= { read: {}, probes: {}, recalls: [], builds: [] };      // SEASON 3
    App.state.grill ||= { ownership: {}, drilled: [], whiteboard: {}, landmines: {}, pitches: {}, mocks: [] }; // SEASON 3
    App.state.warplan ||= { checked: {}, diagnostic: {} };                         // SEASON 3
    restoreFocusDay(); // FOCUS DAY: re-enter a saved/deep-linked focus (needs cur loaded)
    // SEASON 2 static config (schedule_template_s2 + track curricula) — optional,
    // served from ROOT, never a boot blocker; the campaign Mission reads it if present
    App.s2 = null;
    jfetch('/curriculum.s2.json').then(s => { App.s2 = s; rerender(); }).catch(() => {});
    // the trigger bank (problems.json) is optional context, never a boot blocker
    App.problems = null;
    App.problemIndex = new Map();
    jfetch('/problems.json').then(p => {
      App.problems = p;
      const add = (k, e) => { if (k && !App.problemIndex.has(k)) App.problemIndex.set(k, e); };
      for (const e of p) {
        App.problemIndex.set(e.canonical_name.toLowerCase(), e);
        add(e.matched_item?.toLowerCase(), e); // bridge: curriculum names → the bank entry
        for (const a of e.aliases || []) add(a.toLowerCase(), e);
      }
      rerender();
    }).catch(() => {});
  } catch (e) {
    document.getElementById('view').innerHTML =
      `<div class="banner">Failed to load curriculum/state: ${esc(e.message)}. Is the server running?</div>`;
    return;
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('keydown', e => { // Ctrl+K command palette (Wave 4 minor)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    // ? — keyboard cheat-sheet (Open-Wave slate); never hijack a literal '?' typed into a field
    if (e.key === '?' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); openShortcuts(); }
    if (e.key === 'Escape') { closePalette(); closeShortcuts(); }
  });
  // resume into the cockpit on boot — but an explicitly requested route wins
  // (free navigation, Wave 4 ruling); the card-phase lock still applies in route()
  const h0 = (location.hash || '#/').split('?')[0];
  if (App.state.session && (h0 === '#/' || h0 === '')) location.hash = sessionRoute();
  route();
  // SEASON 2 no-reset guard: the server compares the live record against its
  // captured baseline; on drift it never repairs, only warns here.
  if (App.state.s2drift) {
    const bar = document.createElement('div');
    bar.id = 'driftbanner';
    bar.innerHTML = `⚠ Season-1 record changed since the no-reset baseline: ${esc(App.state.s2drift)}. If this was not intentional, check <code>data/</code>. <button id="driftx">dismiss</button>`;
    document.body.appendChild(bar);
    bar.querySelector('#driftx').addEventListener('click', () => bar.remove());
  }
  checkNag();
  setInterval(checkNag, 15000);
  setInterval(renderPill, 1000); // the pill ticks even between renders
}
boot();
