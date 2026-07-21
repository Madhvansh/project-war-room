// SEASON 2 Wave 6 — CF-Ascent (#/cf-ascent): the rating climb toward the
// 1800-1900 OA band. Sits ABOVE the frozen §3.7 ladder (1100/1200/1300) — it
// never replaces it. Reads the LIVE /api/cf rating (handle from data/config.json). Off-sheet:
// attempts live in data/cf-ascent.json, never log.json. An unsolved problem mints
// a CP-pattern card (kind:'cp') — name the technique, re-derive it from blank.
// Reuses ladder.js runCountdown for the strict clock.
import {
  App, esc, todayStr, displayDayN, appendCard, saveCfAscent, rerender,
  campaignOn, campaignEntry
} from '../app.js';
import { runCountdown, cleanupDrill } from './ladder.js';
import { success } from '../audio.js';
import { cfBandReadiness } from '../stats.js';

const SKEY = 'p435.cf.session';
const CLOCK_MIN = 45; // a focused CF band problem
const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } };
const setSession = s => s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY);

const CP_TECHNIQUES = ['binary-search-on-answer', 'greedy / exchange', 'constructive', 'number theory', 'graph', 'DP', 'two-pointer / sliding window', 'bitmask', 'combinatorics / counting'];

export function renderCfAscent(root) {
  cleanupDrill();
  const s = getSession();
  if (s) return s.phase === 'solve' ? renderSolve(root, s) : renderCard(root, s);
  renderDash(root);
}

function renderDash(root) {
  const st = App.state.cfAscent || { attempts: [], ratingTarget: 1850 };
  const target = st.ratingTarget || 1850;
  const bands = App.s2?.cf_ascent?.bands || [];
  const recent = [...(st.attempts || [])].sort((a, b) => b.ts - a.ts).slice(0, 8);

  root.innerHTML = `
    <div class="cols"><div>
      <div class="panel"><h2>CF-Ascent — climb to ${target} <span class="right faint">above the §3.7 ladder</span></h2>
        <p class="muted">OA problems are ≥1800-1900. Pick a good problem (from <a href="https://cf-ascent.netlify.app/" target="_blank" rel="noopener">CF-Ascent ↗</a>), beat a strict clock, log it. Unsolved → a CP-pattern card you re-derive from blank. Off-sheet: never touches the 435 sheet or the frozen ladder.</p>
        <div id="cf-rating" class="cf-rating faint">syncing rating…</div>
      </div>
      <div class="panel"><h2>Log a problem</h2>
        <div class="ladder-add">
          <input id="cf-name" type="text" placeholder="e.g. 1800C — Anya and the Mysterious Sequence" autocomplete="off">
          <input id="cf-rating-in" type="text" inputmode="numeric" placeholder="rating" style="width:90px" autocomplete="off">
          <button class="primary" id="cf-start">START ${CLOCK_MIN}:00 ▸</button>
        </div>
        <p class="faint" style="margin-top:8px">${CLOCK_MIN} min strict. Solve from blank — narrate the technique out loud.</p>
      </div>
      ${recent.length ? `<div class="panel"><h2>Recent attempts</h2><ul class="probs">${recent.map(a => `<li style="cursor:default">
        <span class="st ${a.solved ? 'solo' : 'amber'}">${a.solved ? '✓' : '↑'}</span>
        <span class="nm">${esc(a.problem)}</span>
        <span class="faint" style="margin-left:auto">${a.rating ? a.rating + ' · ' : ''}${a.minutes ?? '—'}m</span></li>`).join('')}</ul></div>` : ''}
    </div><div>
      <div class="panel"><h2>The band ladder</h2>
        <ul class="cf-bands">${bands.map(b => `<li><b>${esc(b.band)}</b> <span class="faint">${esc(b.phase)}</span><br><span class="muted">${esc(b.focus)}</span></li>`).join('')}</ul>
      </div>
      <div id="cf-readiness"></div>
    </div></div>`;

  const startAttempt = () => {
    const problem = root.querySelector('#cf-name').value.trim();
    if (!problem) { root.querySelector('#cf-name').focus(); return; }
    const rating = parseInt(root.querySelector('#cf-rating-in').value, 10);
    setSession({ problem, rating: Number.isFinite(rating) ? rating : null, phase: 'solve', startTs: Date.now() });
    rerender();
  };
  root.querySelector('#cf-start').addEventListener('click', startAttempt);
  root.querySelector('#cf-name').addEventListener('keydown', e => { if (e.key === 'Enter') startAttempt(); });

  // live rating + readiness (mirrors mission.js CF sync)
  fetch('/api/cf').then(r => r.json()).then(cf => {
    const host = root.querySelector('#cf-rating');
    const rd = cfBandReadiness(cf, st, target);
    if (host) host.innerHTML = cf?.offline
      ? '<span class="amber">CF offline — readiness from logged attempts only</span>'
      : `live rating <b class="cyan">${cf.current ?? '—'}</b>${cf.stale ? ' <span class="amber">(cached)</span>' : ''} · target <b>${target}</b>`;
    const rdHost = root.querySelector('#cf-readiness');
    if (rdHost) rdHost.innerHTML = `<div class="panel"><h2>OA-band readiness</h2>
      <div class="durhead">
        <div class="durstat"><span class="big ${rd.ready ? 'ok' : 'amber'}">${rd.fightable ?? '—'}</span><span class="dl">fightable rating<br><span class="faint">vs ${target} target</span></span></div>
        <div class="durstat"><span class="big">${rd.solvedN}</span><span class="dl">band solves</span></div>
        <div class="durstat"><span class="big ${rd.gap != null && rd.gap <= 0 ? 'ok' : ''}">${rd.gap != null ? (rd.gap > 0 ? rd.gap : 'there ✓') : '—'}</span><span class="dl">${rd.gap > 0 ? 'rating to close' : 'OA-band ready'}</span></div>
      </div></div>`;
  }).catch(() => { const h = root.querySelector('#cf-rating'); if (h) h.textContent = ''; });
}

function renderSolve(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">CF-ASCENT · SOLVE — blank file, narrate the technique</div>
      <div class="probname">${esc(s.problem)}${s.rating ? ` <span class="faint" style="font-size:14px">rated ${s.rating}</span>` : ''}</div>
      <div class="bigclock" id="cf-clock">${CLOCK_MIN}:00</div>
      <div class="muted faint">strict ${CLOCK_MIN} min — say the CP technique out loud as you spot it</div>
      <div class="actions">
        <button class="good" id="cf-solved">SOLVED ✓</button>
        <button class="warn" id="cf-up">didn't get it → CP card + upsolve</button>
        <button class="ghost" id="cf-cancel">cancel</button>
      </div>
    </div>`;
  runCountdown(root.querySelector('#cf-clock'), CLOCK_MIN, s.startTs);
  const finish = solved => {
    s.minutes = Math.round((Date.now() - s.startTs) / 60000 * App.speed);
    s.solved = solved;
    if (solved) { recordAttempt(s); }
    else { s.phase = 'card'; setSession(s); rerender(); }
  };
  root.querySelector('#cf-solved').addEventListener('click', () => finish(true));
  root.querySelector('#cf-up').addEventListener('click', () => finish(false));
  root.querySelector('#cf-cancel').addEventListener('click', () => { setSession(null); rerender(); });
}

async function recordAttempt(s) {
  App.state.cfAscent ||= { attempts: [], ratingTarget: 1850 };
  App.state.cfAscent.attempts.push({
    problem: s.problem, rating: s.rating || null, solved: !!s.solved, minutes: s.minutes ?? null, ts: Date.now()
  });
  await saveCfAscent();
  setSession(null);
  if (s.solved) success();
  rerender();
}

// unsolved → a CP-pattern card: name the technique, re-derive from blank
function renderCard(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">CF-ASCENT · CP CARD — the technique that unlocks it (produce later from blank)</div>
      <div class="probname">${esc(s.problem)} <span class="amber" style="font-size:14px">upsolve · ${s.minutes}m</span></div>
      <div class="recogform panel" style="text-align:left">
        <label>THE CP TECHNIQUE</label>
        <select id="cf-tech" style="width:100%">${['', ...CP_TECHNIQUES].map(t => `<option value="${esc(t)}">${t || '— pick the family —'}</option>`).join('')}</select>
        <label style="margin-top:10px">THE KEY INSIGHT (one line — what you'll re-derive)</label>
        <input id="cf-insight" type="text" autocomplete="off" placeholder="e.g. monotone predicate on the answer → binary search the boundary">
        <label style="margin-top:10px">THE TRAP</label>
        <input id="cf-trap" type="text" autocomplete="off" placeholder="e.g. overflow on n*k; the predicate flips at mid, not mid+1">
        <div class="actions" style="margin-top:14px"><button class="primary" id="cf-cardsave">BANK CARD + UPSOLVE ▸<kbd>Enter</kbd></button></div>
      </div>
    </div>`;
  root.querySelector('#cf-insight').focus();
  const save = async () => {
    const tech = root.querySelector('#cf-tech').value;
    const insight = root.querySelector('#cf-insight').value.trim();
    const trap = root.querySelector('#cf-trap').value.trim();
    const today = todayStr();
    await appendCard({
      kind: 'cp', date: today, day: campaignOn() ? campaignEntry()?.day : displayDayN(),
      problem: s.problem, pattern: tech || 'CP',
      prompt: `Technique + key insight for "${s.problem}"${s.rating ? ` (rated ${s.rating})` : ''}?`,
      produce: [tech, insight].filter(Boolean).join(' — ') || '(name the technique)', trap
    });
    await recordAttempt(s); // logs the unsolved attempt + clears the session
  };
  root.querySelector('#cf-cardsave').addEventListener('click', save);
  root.querySelector('#cf-trap').addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}
