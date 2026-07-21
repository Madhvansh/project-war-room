// SEASON 2 Wave 6 — Hard DP-from-LeetCode (#/dp). The single most-asked, most-
// forgotten family: you already know the SUBTOPIC from Striver, so daily hard LC
// reps turn recognition into production. Off-sheet — reps live in data/dp-lc.json
// and NEVER enter log.json / sheetCount (the 435 arc stays Season-1 history). Each
// solve mints a structured recurrence card (kind:'dp') → the durability deck later
// asks you to RE-DERIVE the recurrence from blank. Reuses ladder.js runCountdown.
import {
  App, Laws, esc, todayStr, displayDayN, dayEntry, appendCard, saveDp, rerender,
  campaignOn, campaignEntry
} from '../app.js';
import { runCountdown, cleanupDrill } from './ladder.js';
import { chime, success } from '../audio.js';

const SKEY = 'p435.dp.session';
const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch { return null; } };
const setSession = s => s ? sessionStorage.setItem(SKEY, JSON.stringify(s)) : sessionStorage.removeItem(SKEY);

// curriculum DP day → the subtopic groups it covers (Striver Days 6-8)
const DP_DAY_SUBTOPICS = {
  'DP on Subsequences': ['Subsequence / knapsack', '1D / linear'],
  'DP on Strings + Stocks': ['Strings / LCS', 'Stocks'],
  'DP on LIS + MCM/Partition': ['LIS', 'MCM / interval', 'Squares / matrix']
};
function activeEntry() {
  return campaignOn() ? campaignEntry() : (dayEntry() || App.cur.days[App.cur.days.length - 1]);
}
function lcLink(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `https://leetcode.com/problems/${slug}/`;
}
// today's served problem: a subtopic match on a DP curriculum day, else the
// least-drilled subtopic (keep-warm). Returns null if the map is unloaded,
// or {done:true} when a chosen subtopic is fully solved.
function dpServe() {
  const map = App.s2?.dp_lc?.subtopics;
  if (!map) return null;
  const solved = App.state.dp?.solved || {};
  const entry = activeEntry();
  const isDpDay = entry?.phase === 'DP completion';
  let reason, candidates;
  if (isDpDay) {
    const groups = DP_DAY_SUBTOPICS[entry.focus] || Object.keys(map);
    candidates = groups.flatMap(g => (map[g] || []).map(p => ({ subtopic: g, problem: p })));
    reason = `today's DP topic — ${entry.focus}`;
  } else {
    const counts = Object.entries(map).map(([g, ps]) => ({ g, ps, frac: ps.filter(p => solved[p]).length / ps.length }));
    counts.sort((a, b) => a.frac - b.frac);
    const g = counts.find(c => c.frac < 1) || counts[0];
    candidates = g.ps.map(p => ({ subtopic: g.g, problem: p }));
    reason = `keep-warm — ${g.g} (least-drilled DP subtopic)`;
  }
  const next = candidates.find(c => !solved[c.problem]);
  return next ? { ...next, link: lcLink(next.problem), reason } : { done: true, reason };
}

export function renderDp(root) {
  cleanupDrill();
  const s = getSession();
  if (s) return renderCockpit(root, s);
  renderDash(root);
}

function renderDash(root) {
  const serve = dpServe();
  const solved = App.state.dp?.solved || {};
  const upsolve = App.state.dp?.upsolve || [];
  const map = App.s2?.dp_lc?.subtopics || {};
  const totals = Object.entries(map).map(([g, ps]) => ({ g, done: ps.filter(p => solved[p]).length, total: ps.length }));
  const solvedCount = Object.keys(solved).length;

  const pickCard = (p, isUp) => `
    <div class="drillcard panel">
      <div class="dc-head"><span class="${isUp ? 'amber' : 'cyan'}" style="color:var(--${isUp ? 'amber' : 'cyan'})">${isUp ? '↩ upsolve' : esc(p.subtopic)}</span>
        <span class="faint">10 solo · 35 ceiling · blank file → produce the recurrence</span></div>
      <div class="dc-name">${esc(p.problem)}</div>
      ${p.reason ? `<div class="dc-delta muted">${esc(p.reason)}</div>` : ''}
      <div class="actions" style="justify-content:flex-start;margin-top:8px">
        <button class="primary" data-start="${esc(p.problem)}" data-sub="${esc(p.subtopic)}" data-link="${esc(p.link || lcLink(p.problem))}">START ▸</button>
        <a href="${esc(p.link || lcLink(p.problem))}" target="_blank" rel="noopener" class="ghost" style="padding:5px 12px">open on LeetCode ↗</a>
      </div>
    </div>`;

  root.innerHTML = `
    <div class="cols"><div>
      <div class="panel"><h2>DP from LeetCode <span class="right faint">${solvedCount} hard reps banked</span></h2>
        <p class="muted">You know the subtopic from Striver — these turn recognition into production on the most-forgotten family. Off-sheet: never moves the 435 sheet. Each solve banks a recurrence card you'll re-derive from blank.</p></div>
      ${upsolve.length ? `<h3 class="dp-h3">↩ Upsolve queue (${upsolve.length})</h3>${upsolve.map(u => pickCard({ ...u, subtopic: u.subtopic }, true)).join('')}` : ''}
      ${serve == null ? '<div class="panel"><p class="faint">curriculum.s2.json not loaded — the subtopic map is unavailable.</p></div>'
        : serve.done ? `<div class="panel"><p class="ok">✓ every problem in this subtopic is solved — ${esc(serve.reason)}. Switch days or come back tomorrow for keep-warm.</p></div>`
        : `<h3 class="dp-h3">Today's pick</h3>${pickCard(serve, false)}`}
    </div><div>
      <div class="panel"><h2>Subtopic coverage</h2>
        <ul class="dp-cov">${totals.map(t => `<li><span class="nm">${esc(t.g)}</span><span class="${t.done >= t.total ? 'ok' : t.done ? 'amber' : 'faint'}">${t.done}/${t.total}</span></li>`).join('')}</ul>
        <p class="faint" style="margin-top:8px"><a href="#/durability">durability deck ▸</a> — re-derive recurrences before they decay.</p></div>
    </div></div>`;

  root.querySelectorAll('button[data-start]').forEach(b => b.addEventListener('click', () => {
    setSession({ problem: b.dataset.start, subtopic: b.dataset.sub, link: b.dataset.link, phase: 'setup', classification: '', startTs: null });
    rerender();
  }));
}

function renderCockpit(root, s) {
  cleanupDrill();
  if (s.phase === 'setup') return renderSetup(root, s);
  if (s.phase === 'solve') return renderSolve(root, s);
  if (s.phase === 'card') return renderCard(root, s);
}

function renderSetup(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">DP REP · SETUP — name the subtopic/approach before the clock</div>
      <div class="probname">${esc(s.problem)} <a href="${esc(s.link)}" target="_blank" rel="noopener" class="ghost" style="padding:3px 10px;font-size:12px">LeetCode ↗</a></div>
      <div class="muted">${esc(s.subtopic)} · 10 min solo, 35 ceiling. Classify, then attempt on a blank file.</div>
      <div class="recogform panel">
        <label>YOUR CLASSIFICATION (the DP state / what you're optimizing)</label>
        <input id="dp-class" type="text" autocomplete="off" placeholder="e.g. dp[i][cap] = max value using items ≤ i with capacity cap" value="${esc(s.classification || '')}">
        <div class="actions" style="margin-top:14px">
          <button class="primary" id="dp-go">START 35:00 ▸<kbd>Enter</kbd></button>
          <button id="dp-cancel" class="ghost">cancel</button>
        </div>
      </div>
    </div>`;
  const start = () => {
    s.classification = root.querySelector('#dp-class').value.trim();
    s.phase = 'solve'; s.startTs = Date.now(); setSession(s); rerender();
  };
  root.querySelector('#dp-class').focus();
  root.querySelector('#dp-go').addEventListener('click', start);
  root.querySelector('#dp-class').addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  root.querySelector('#dp-cancel').addEventListener('click', () => { setSession(null); rerender(); });
}

function renderSolve(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">DP REP · SOLVE — blank file, ${esc(s.subtopic)}</div>
      <div class="probname">${esc(s.problem)} <a href="${esc(s.link)}" target="_blank" rel="noopener" class="ghost" style="padding:3px 10px;font-size:12px">LeetCode ↗</a></div>
      <div class="muted">your state: ${esc(s.classification || '—')}</div>
      <div class="bigclock" id="dp-clock">35:00</div>
      <div class="muted faint">10 min solo before any hint · chime at the 35-min ceiling</div>
      <div class="actions">
        <button class="good" id="dp-solved">SOLVED ✓</button>
        <button class="warn" id="dp-editorial">read editorial → re-implement</button>
        <button class="ghost" id="dp-fail">didn't finish — upsolve</button>
      </div>
    </div>`;
  runCountdown(root.querySelector('#dp-clock'), Laws.CEIL_MIN, s.startTs);
  const finish = outcome => {
    s.minutes = Math.round((Date.now() - s.startTs) / 60000 * App.speed);
    s.outcome = outcome; s.phase = 'card'; setSession(s);
    if (outcome === 'solo') success();
    rerender();
  };
  root.querySelector('#dp-solved').addEventListener('click', () => finish('solo'));
  root.querySelector('#dp-editorial').addEventListener('click', () => finish('editorial'));
  root.querySelector('#dp-fail').addEventListener('click', () => finish('fail'));
}

function renderCard(root, s) {
  const ok = s.outcome === 'solo';
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">DP REP · CARD — produce the recurrence from blank (the exit door)</div>
      <div class="probname">${esc(s.problem)} <span class="${ok ? 'ok' : 'amber'}" style="font-size:14px">${ok ? '✓ solved' : s.outcome === 'editorial' ? 'editorial' : 'upsolve'} · ${s.minutes}m</span></div>
      <div class="recogform panel" style="text-align:left">
        <label>STATE + TRANSITION (the recurrence — write it as you'd reproduce it)</label>
        <textarea id="dp-rec" rows="3" placeholder="dp[i][w] = max(dp[i-1][w], val[i] + dp[i-1][w-wt[i]]); base dp[0][*]=0"></textarea>
        <label style="margin-top:10px">THE TRAP (the off-by-one / base case / dimension that bites)</label>
        <input id="dp-trap" type="text" autocomplete="off" placeholder="e.g. iterate capacity DESC for 0/1, ASC for unbounded">
        <div class="actions" style="margin-top:14px">
          <button class="primary" id="dp-save">BANK CARD ▸<kbd>Enter</kbd></button>
        </div>
      </div>
    </div>`;
  root.querySelector('#dp-rec').focus();
  const save = async () => {
    const produce = root.querySelector('#dp-rec').value.trim();
    const trap = root.querySelector('#dp-trap').value.trim();
    const today = todayStr();
    App.state.dp ||= { solved: {}, upsolve: [] };
    if (ok || s.outcome === 'editorial') {
      App.state.dp.solved[s.problem] = { subtopic: s.subtopic, ts: Date.now(), minutes: s.minutes, outcome: s.outcome };
      App.state.dp.upsolve = (App.state.dp.upsolve || []).filter(u => u.problem !== s.problem);
    } else { // didn't finish → upsolve next session
      if (!(App.state.dp.upsolve || []).some(u => u.problem === s.problem))
        (App.state.dp.upsolve ||= []).push({ problem: s.problem, subtopic: s.subtopic, link: s.link, fromDate: today });
    }
    await saveDp();
    await appendCard({
      kind: 'dp', date: today, day: campaignOn() ? campaignEntry()?.day : displayDayN(),
      problem: s.problem, link: s.link, pattern: s.subtopic,
      prompt: `Recurrence + transition for "${s.problem}" (${s.subtopic})?`,
      produce: produce || s.classification || '(state the recurrence)', trap
    });
    setSession(null);
    success();
    rerender();
  };
  root.querySelector('#dp-save').addEventListener('click', save);
  root.querySelector('#dp-trap').addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
}
