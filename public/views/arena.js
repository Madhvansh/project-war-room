// SEASON 3 — THE ARENA (#/arena): the blind-solve engine. ONE combined queue
// over the DP + graph + mixed banks (arena.s3.json) with ZERO topic signal
// pre-reveal — the canonical block (pattern/progression/traps/followups) exists
// only behind the reveal step, per the standing no-spoiler rule (failure mode
// #2). Flow: hypothesis + confidence → solo clock (10-min checkpoint cue, 35
// ceiling) → solved / editorial → 15-min blank re-implement / didn't finish →
// REVEAL canonical → one-key classification grade (alias-matched suggestion,
// manual override) → constraint mutation → D+1/D+3 delayed re-solve queue.
// Every attempt is RETAINED (append-only attempts[]); the active session lives
// SERVER-SIDE (data/arena.json) so it survives refresh, browser close and
// server restart. Off-sheet — never touches log.json/sheetCount. #/dp remains
// routed as the legacy track; its solved names sink to the back of this queue.
import {
  App, Laws, esc, todayStr, saveArena, rerender, s3Content, appendCard, saveReviews
} from '../app.js';
import { runCountdown, cleanupDrill } from './ladder.js';
import { chime, success, blip } from '../audio.js';

let BANK; // arena.s3.json: undefined = not requested, 'pending' = fetching, null = missing, object = loaded
let keyHandler = null, checkTimer = null;

export function cleanupArena() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = null;
  cleanupDrill();
}

const doc = () => (App.state.arena ||= { activeSession: null, attempts: [], resolveQueue: [] });
const items = () => BANK?.items || [];
const byId = id => items().find(i => i.id === id);
const lcLink = i => `https://leetcode.com/problems/${i.slug}/`;
const BANK_ORDER = ['dp', 'graph', 'mix'];
const CONF = { 1: 'LOW', 2: 'MED', 3: 'HIGH' };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };

async function setSession(s) { doc().activeSession = s; await saveArena(); }

// ── blind serving: due re-solves surface in their own panel; the queue itself
// serves never-attempted items round-robin across banks (rotation moves with
// the attempt count) so no on-screen grouping ever hints the family. Names
// already solved in the legacy DP track sink to the back (Season-2 credit).
function nextBlind() {
  const d = doc();
  const attempted = new Set(d.attempts.map(a => a.itemId));
  const legacy = new Set(Object.keys(App.state.dp?.solved || {}).map(n => n.toLowerCase()));
  const pool = items().filter(i => !attempted.has(i.id));
  if (!pool.length) return null;
  const fresh = pool.filter(i => !legacy.has(i.name.toLowerCase()));
  const use = fresh.length ? fresh : pool;
  const start = d.attempts.length % BANK_ORDER.length;
  for (let k = 0; k < BANK_ORDER.length; k++) {
    const hit = use.find(i => i.bank === BANK_ORDER[(start + k) % BANK_ORDER.length]);
    if (hit) return hit;
  }
  return use[0] || null;
}
function nextAssisted(bank) {
  const attempted = new Set(doc().attempts.map(a => a.itemId));
  return items().find(i => i.bank === bank && !attempted.has(i.id)) || null;
}
function dueResolves() {
  const t = todayStr();
  return (doc().resolveQueue || []).filter(q => q.due <= t)
    .sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0) || a.due.localeCompare(b.due));
}

// rubric + alias matching for the classification grade (manual override stays)
function aliasMatch(hyp, canonical) {
  const h = (hyp || '').toLowerCase();
  if (!h.trim()) return 'fail';
  const names = [canonical.pattern, ...(canonical.aliases || [])].map(x => String(x).toLowerCase());
  if (names.some(n => n && h.includes(n))) return 'pass';
  const stop = new Set(['the', 'and', 'with', 'for', 'over', 'from', 'into', 'problem']);
  const toks = new Set(names.flatMap(n => n.split(/[^a-z0-9+#]+/)).filter(w => w.length >= 3 && !stop.has(w)));
  return [...toks].some(t => h.includes(t)) ? 'partial' : 'fail';
}

export function renderArena(root) {
  cleanupArena();
  if (BANK === undefined) { // request exactly once — a null result must never re-trigger (render-loop guard)
    BANK = 'pending';
    s3Content('arena').then(b => {
      BANK = b;
      if ((location.hash || '').startsWith('#/arena')) rerender();
    });
  }
  if (BANK === 'pending') { root.innerHTML = '<div class="panel"><p class="faint">loading the arena bank…</p></div>'; return; }
  if (!BANK || !items().length) { root.innerHTML = '<div class="panel"><p class="faint">arena.s3.json missing or empty — the blind banks are unavailable.</p></div>'; return; }
  const s = doc().activeSession;
  if (s) return renderCockpit(root, s);
  renderDash(root);
}

// ── the dashboard ─────────────────────────────────────────────────────────────
function renderDash(root) {
  const d = doc();
  const next = nextBlind();
  const due = dueResolves();
  const blind = d.attempts.filter(a => a.mode === 'blind' && a.outcome);
  const resolves = d.attempts.filter(a => a.mode === 'resolve' && a.outcome);
  const classOk = d.attempts.filter(a => a.classifyGrade === 'pass').length;
  // coverage: COUNTS only for the un-attempted (listing their names per bank
  // would leak future blind serves); names appear only once attempted.
  const cov = BANK_ORDER.map(b => {
    const all = items().filter(i => i.bank === b);
    const done = all.filter(i => d.attempts.some(a => a.itemId === i.id));
    return { b, done: done.length, total: all.length };
  });
  const recent = [...d.attempts].sort((a, b) => b.ts - a.ts).slice(0, 8);

  root.innerHTML = `
    <div class="panel"><h2>THE ARENA — blind interview queue
      <span class="right faint">${d.attempts.length} attempts · ${blind.length} blind · ${resolves.length} re-solves · classify ${d.attempts.length ? Math.round(classOk / d.attempts.length * 100) + '%' : '—'}</span></h2>
      <p class="muted">No topic, no family, no hint — the read is YOURS. Commit a hypothesis + confidence, solve on the clock, then the canonical deep-dive reveals and grades your read. Misses come back <b>D+1</b>, clean solves <b>D+3</b>. Editorial never counts as a clean solve. Every attempt is kept.</p>
    </div>
    ${due.length ? `<div class="panel"><h2 class="amber">↩ Due re-solves (${due.length})${due.some(q => q.priority) ? ' <span class="danger">· high-confidence miss inside</span>' : ''}</h2>
      <ul class="probs">${due.map(q => `<li style="cursor:pointer" data-resolve="${esc(q.itemId)}">
        <span class="st ${q.priority ? 'abandoned' : ''}">${q.priority ? '⚠' : '↩'}</span>
        <span class="nm">${esc(q.name)}</span>
        <span class="faint" style="margin-left:auto">due ${esc(q.due)} · from ${esc(q.from)}</span></li>`).join('')}</ul>
      <p class="faint">A re-solve is fully blind again — the reveal already happened once; now prove it stuck.</p></div>` : ''}
    <div class="cols"><div>
      ${next ? `<h3 class="dp-h3">Next up — blind</h3>
      <div class="drillcard panel">
        <div class="dc-head"><span class="cyan" style="color:var(--cyan)">BLIND</span>
          <span class="faint">hypothesis first · 10-min checkpoint · 35 ceiling</span></div>
        <div class="dc-name">${esc(next.name)} <span class="faint" style="font-size:13px">· ${esc(next.difficulty)}${next.premium ? ' · premium' : ''}</span></div>
        <div class="actions" style="justify-content:flex-start;margin-top:8px">
          <button class="primary" data-start="${esc(next.id)}" data-mode="blind">START ▸</button>
        </div>
      </div>` : '<div class="panel"><p class="ok">✓ every bank item attempted — re-solves and the gauntlet carry it from here.</p></div>'}
      <div class="panel"><h2>Assisted practice <span class="faint right">targeted repair — does NOT move the blind gate</span></h2>
        <p class="muted">Pick a family on purpose (you already know what it is — that's the assist). Still no sub-labels inside.</p>
        <div class="actions" style="justify-content:flex-start">
          ${BANK_ORDER.map(b => {
            const n = nextAssisted(b);
            return `<button class="ghost" data-assist="${b}" ${n ? '' : 'disabled'}>${b === 'dp' ? 'DP' : b === 'graph' ? 'GRAPH' : 'MIXED'} practice ▸</button>`;
          }).join('')}
        </div>
      </div>
    </div><div>
      <div class="panel"><h2>Coverage <span class="faint right">counts only — names stay hidden until attempted</span></h2>
        <ul class="dp-cov">${cov.map(c => `<li><span class="nm">${c.b === 'dp' ? 'Dynamic programming' : c.b === 'graph' ? 'Graphs' : 'Mixed top-topics'}</span>
          <span class="${c.done >= c.total ? 'ok' : c.done ? 'amber' : 'faint'}">${c.done}/${c.total}</span></li>`).join('')}</ul>
        <p class="faint" style="margin-top:8px"><a href="#/durability">durability deck ▸</a> · <a href="#/warplan">war plan ▸</a> · <a href="#/dp">legacy DP track ▸</a></p>
      </div>
      ${recent.length ? `<div class="panel"><h2>Recent attempts <span class="faint right">retrospective — canonical is fair game here</span></h2>
        <ul class="probs">${recent.map(a => `<li style="cursor:default">
          <span class="st ${a.classifyGrade === 'pass' ? 'solo' : a.classifyGrade === 'partial' ? 'recognized' : 'abandoned'}">${a.classifyGrade === 'pass' ? '✓' : a.classifyGrade === 'partial' ? '~' : '✗'}</span>
          <span class="nm">${esc(a.name)} <span class="faint">· ${esc(a.mode)} · ${a.outcome === 'solo' ? 'solved' : esc(a.outcome || '—')} · ${a.minutes ?? '—'}m${a.confidence ? ' · ' + CONF[a.confidence] : ''}</span></span></li>`).join('')}</ul>
      </div>` : ''}
    </div></div>`;

  const start = (item, mode) => setSession({
    itemId: item.id, name: item.name, difficulty: item.difficulty, link: lcLink(item),
    mode, phase: 'hypothesis', hypothesis: '', confidence: 2,
    startTs: null, reimplStartTs: null, minutes: null, outcome: null,
    classifyGrade: null, checkpointed: false
  }).then(rerender);
  root.querySelectorAll('button[data-start]').forEach(b => b.addEventListener('click', () => start(byId(b.dataset.start), b.dataset.mode)));
  root.querySelectorAll('button[data-assist]').forEach(b => b.addEventListener('click', () => {
    const n = nextAssisted(b.dataset.assist);
    if (n) start(n, 'assisted');
  }));
  root.querySelectorAll('li[data-resolve]').forEach(li => li.addEventListener('click', () => {
    const it = byId(li.dataset.resolve);
    if (it) start(it, 'resolve');
  }));
}

// ── the cockpit ───────────────────────────────────────────────────────────────
function renderCockpit(root, s) {
  if (s.phase === 'hypothesis') return renderHypothesis(root, s);
  if (s.phase === 'solve') return renderSolve(root, s);
  if (s.phase === 'editorial') return renderEditorial(root, s);
  if (s.phase === 'reimplement') return renderReimplement(root, s);
  if (s.phase === 'reveal') return renderReveal(root, s);
  if (s.phase === 'mutation') return renderMutation(root, s);
  setSession(null).then(rerender); // unknown phase — recover to the dash
}
const modeChip = s => s.mode === 'blind' ? 'BLIND' : s.mode === 'resolve' ? 'RE-SOLVE' : 'ASSISTED';

function renderHypothesis(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · ${modeChip(s)} — commit your read before the clock</div>
      <div class="probname">${esc(s.name)} <span class="faint" style="font-size:14px">${esc(s.difficulty)}</span>
        <a href="${esc(s.link)}" target="_blank" rel="noopener" class="ghost" style="padding:3px 10px;font-size:12px">open on LeetCode ↗</a></div>
      <div class="recogform panel" style="text-align:left">
        <label>YOUR READ — what pattern/approach do you suspect, and why? (free form; graded at the reveal)</label>
        <textarea id="ar-hyp" rows="3" placeholder="what the statement smells like, the state/invariant you'd try, rough complexity…">${esc(s.hypothesis || '')}</textarea>
        <label style="margin-top:10px">CONFIDENCE in that read</label>
        <div class="actions" id="ar-conf" style="justify-content:flex-start">
          ${[1, 2, 3].map(n => `<button class="ghost ${s.confidence === n ? 'sel' : ''}" data-conf="${n}">${CONF[n]}</button>`).join('')}
        </div>
        <div class="actions" style="margin-top:14px">
          <button class="primary" id="ar-go">START 35:00 ▸<kbd>Ctrl+Enter</kbd></button>
          <button id="ar-cancel" class="ghost">cancel</button>
        </div>
        <p class="faint" style="margin-top:8px">A confident wrong read is the most valuable thing you can log today — it exposes the dangerous misconception.</p>
      </div>
    </div>`;
  root.querySelector('#ar-hyp').focus();
  root.querySelectorAll('#ar-conf button').forEach(b => b.addEventListener('click', () => {
    s.confidence = +b.dataset.conf;
    root.querySelectorAll('#ar-conf button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  const go = () => {
    s.hypothesis = root.querySelector('#ar-hyp').value.trim();
    s.phase = 'solve'; s.startTs = Date.now();
    setSession(s).then(rerender);
  };
  root.querySelector('#ar-go').addEventListener('click', go);
  root.querySelector('#ar-cancel').addEventListener('click', () => setSession(null).then(rerender));
  keyHandler = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } };
  window.addEventListener('keydown', keyHandler);
}

function renderSolve(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · ${modeChip(s)} — solo. blank file.</div>
      <div class="probname">${esc(s.name)} <a href="${esc(s.link)}" target="_blank" rel="noopener" class="ghost" style="padding:3px 10px;font-size:12px">LeetCode ↗</a></div>
      <div class="muted">your read: ${esc(s.hypothesis || '—')} · ${CONF[s.confidence] || 'MED'}</div>
      <div class="bigclock" id="ar-clock">35:00</div>
      <div id="ar-check" class="${s.checkpointed ? '' : 'hidden'}" style="max-width:640px;margin:6px auto">
        ${s.checkpointed ? checkpointHtml() : ''}
      </div>
      <div class="actions">
        <button class="good" id="ar-solved">SOLVED ✓</button>
        <button class="warn" id="ar-editorial">read editorial → re-implement</button>
        <button class="ghost" id="ar-fail">didn't finish</button>
      </div>
    </div>`;
  runCountdown(root.querySelector('#ar-clock'), Laws.CEIL_MIN, s.startTs);
  // the 10-minute checkpoint — a cue, not a gate (Regime 2)
  checkTimer = setInterval(() => {
    if (s.checkpointed) { clearInterval(checkTimer); checkTimer = null; return; }
    const el = (Date.now() - s.startTs) / 60000 * App.speed;
    if (el >= 10) {
      s.checkpointed = true;
      setSession(s);
      const z = root.querySelector('#ar-check');
      if (z) { z.classList.remove('hidden'); z.innerHTML = checkpointHtml(); blip(); }
    }
  }, 1000);
  const finish = outcome => {
    s.minutes = Math.round((Date.now() - s.startTs) / 60000 * App.speed);
    s.outcome = outcome;
    if (outcome === 'editorial') { s.phase = 'editorial'; }
    else { s.phase = 'reveal'; if (outcome === 'solo') success(); }
    setSession(s).then(rerender);
  };
  root.querySelector('#ar-solved').addEventListener('click', () => finish('solo'));
  root.querySelector('#ar-editorial').addEventListener('click', () => finish('editorial'));
  root.querySelector('#ar-fail').addEventListener('click', () => finish('fail'));
}
const checkpointHtml = () => `<div class="wp-carry">10-MIN CHECKPOINT — do you have (1) an approach, (2) the invariant/state, (3) a complexity? If not: bank the brute force out loud, or take the editorial path honestly.</div>`;

function renderEditorial(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · EDITORIAL — read it, then CLOSE it</div>
      <div class="probname">${esc(s.name)} <a href="${esc(s.link)}" target="_blank" rel="noopener" class="ghost" style="padding:3px 10px;font-size:12px">LeetCode ↗</a></div>
      <p class="muted" style="max-width:560px;margin:10px auto">Read the editorial/solution now. When you understand it, <b>close the tab</b> — the 15-minute blank re-implement starts on your press. Editorial work never counts as a clean solve; the D+1 re-solve is where you earn it back.</p>
      <div class="actions">
        <button class="primary" id="ar-reimpl">editorial CLOSED — start 15:00 re-implement ▸</button>
      </div>
    </div>`;
  root.querySelector('#ar-reimpl').addEventListener('click', () => {
    s.phase = 'reimplement'; s.reimplStartTs = Date.now();
    setSession(s).then(rerender);
  });
}

function renderReimplement(root, s) {
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · RE-IMPLEMENT — from blank, from memory</div>
      <div class="probname">${esc(s.name)}</div>
      <div class="bigclock" id="ar-riclock">15:00</div>
      <div class="actions">
        <button class="primary" id="ar-ridone">DONE → reveal ▸</button>
      </div>
    </div>`;
  runCountdown(root.querySelector('#ar-riclock'), Laws.REIMPL_MIN ?? 15, s.reimplStartTs);
  root.querySelector('#ar-ridone').addEventListener('click', () => {
    s.phase = 'reveal';
    setSession(s).then(rerender);
  });
}

function renderReveal(root, s) {
  const item = byId(s.itemId);
  const c = item?.canonical;
  if (!c) { s.phase = 'mutation'; setSession(s).then(rerender); return; }
  const suggested = aliasMatch(s.hypothesis, c);
  const oc = s.outcome === 'solo' ? '<span class="ok">✓ solved</span>' : s.outcome === 'editorial' ? '<span class="amber">editorial → re-implemented</span>' : '<span class="danger">didn\'t finish</span>';
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · REVEAL — the canonical deep-dive, then grade YOUR read</div>
      <div class="probname">${esc(s.name)} <span style="font-size:14px">${oc} · ${s.minutes ?? '—'}m</span></div>
      <div class="muted">you said: <b>${esc(s.hypothesis || '—')}</b> · confidence ${CONF[s.confidence] || 'MED'}</div>
      <div class="flipcard panel" style="text-align:left;max-width:680px;margin:14px auto">
        <div class="ftag">CANONICAL</div>
        <div class="fpattern">${esc(c.pattern)}</div>
        <div class="vline" style="margin-top:6px"><span class="vtag">◇</span>${esc(c.key_idea || '')}</div>
        ${c.invariant ? `<div class="vline"><span class="vtag">▣</span>${esc(c.invariant)}</div>` : ''}
        ${(c.progression || []).length ? `<div class="ftag" style="margin-top:10px">BRUTE → OPTIMAL</div>
          ${c.progression.map(p => `<div class="vline"><span class="vtag">${p.tier === 'optimal' ? '★' : '·'}</span><b>${esc(p.tier)}</b> — ${esc(p.idea)} <span class="cyan">${esc(p.complexity || '')}</span></div>`).join('')}` : ''}
        ${(c.traps || []).length ? `<div class="ftag" style="margin-top:10px">TRAPS</div>
          ${c.traps.map(t => `<div class="vline"><span class="vtag trap">✗</span>${esc(t)}</div>`).join('')}` : ''}
        ${(c.followups || []).length ? `<div class="ftag" style="margin-top:10px">INTERVIEWER FOLLOW-UPS</div>
          ${c.followups.map(f => `<div class="vline"><span class="vtag">?</span>${esc(f)}</div>`).join('')}` : ''}
      </div>
      <div class="muted">alias match suggests: <b class="${suggested === 'pass' ? 'ok' : suggested === 'partial' ? 'amber' : 'danger'}">${suggested === 'pass' ? '✓ right read' : suggested === 'partial' ? '~ in the family' : '✗ wrong read'}</b> — you have the override.</div>
      <div class="actions">
        <button class="good" data-grade="pass">✓ I HAD IT<kbd>1</kbd></button>
        <button class="warn" data-grade="partial">~ FAMILY, NOT THE FORM<kbd>2</kbd></button>
        <button class="primary" data-grade="fail">✗ WRONG READ<kbd>3</kbd></button>
      </div>
    </div>`;
  const grade = g => {
    s.classifyGrade = g;
    s.phase = 'mutation';
    setSession(s).then(rerender);
  };
  root.querySelectorAll('button[data-grade]').forEach(b => b.addEventListener('click', () => grade(b.dataset.grade)));
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === '1') grade('pass');
    if (e.key === '2') grade('partial');
    if (e.key === '3') grade('fail');
  };
  window.addEventListener('keydown', keyHandler);
}

function renderMutation(root, s) {
  const item = byId(s.itemId);
  const mut = item?.canonical?.mutation;
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ARENA · MUTATION — the constraint just changed</div>
      <div class="probname">${esc(s.name)}</div>
      ${mut ? `<div class="panel" style="max-width:640px;margin:10px auto;text-align:left"><b>${esc(mut)}</b></div>` : ''}
      <div class="recogform panel" style="text-align:left">
        <label>2 lines — what changes in your approach, and what's the new complexity?</label>
        <textarea id="ar-mut" rows="2" placeholder="what breaks, what you'd swap in…"></textarea>
        <div class="actions" style="margin-top:12px">
          <button class="primary" id="ar-finish">BANK THE ATTEMPT ▸<kbd>Ctrl+Enter</kbd></button>
        </div>
        <p class="faint">next serve: ${s.outcome === 'solo' && s.classifyGrade === 'pass' ? 'D+3 (clean — prove it stuck)' : 'D+1 (miss — it comes back tomorrow)'}${s.confidence === 3 && s.classifyGrade === 'fail' ? ' · <span class="danger">high-confidence miss → priority</span>' : ''}</p>
      </div>
    </div>`;
  root.querySelector('#ar-mut').focus();
  const fin = () => finish(root, s, root.querySelector('#ar-mut').value.trim());
  root.querySelector('#ar-finish').addEventListener('click', fin);
  keyHandler = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); fin(); } };
  window.addEventListener('keydown', keyHandler);
}

async function finish(root, s, mutationNote) {
  const d = doc();
  const item = byId(s.itemId);
  const today = todayStr();
  // append-only history — every attempt retained, never a latest-only flag (§0)
  d.attempts.push({
    id: crypto.randomUUID(), itemId: s.itemId, name: s.name, bank: item?.bank || null,
    mode: s.mode, hypothesis: s.hypothesis || '', confidence: s.confidence || 2,
    outcome: s.outcome, minutes: s.minutes, classifyGrade: s.classifyGrade,
    mutationNote: mutationNote || '', date: today, ts: Date.now()
  });
  // spaced re-solve: clean (solo + right read) → D+3; anything else → D+1;
  // a HIGH-confidence wrong read is flagged priority — the dangerous misconception
  const clean = s.outcome === 'solo' && s.classifyGrade === 'pass';
  d.resolveQueue = (d.resolveQueue || []).filter(q => q.itemId !== s.itemId);
  d.resolveQueue.push({
    itemId: s.itemId, name: s.name, due: addDays(today, clean ? 3 : 1), from: today,
    priority: s.confidence === 3 && s.classifyGrade === 'fail'
  });
  d.activeSession = null;
  await saveArena();
  // the durability card: back-face = the SHIPPED canon, his read kept apart as
  // `attempt`; dedup by contentId — a repeat rep reschedules the existing box
  if (item) {
    const dup = (App.state.cards || []).find(x => x.contentId === item.id);
    if (dup) {
      const lt = (App.state.reviews._leitner ||= {});
      lt[dup.id] = Laws.leitnerNext(lt[dup.id], s.classifyGrade === 'pass', today);
      await saveReviews();
    } else {
      await appendCard({
        kind: item.bank === 'dp' ? 'dp' : item.bank, date: today, day: null,
        problem: s.name, link: lcLink(item), pattern: item.canonical.pattern,
        prompt: `${item.bank === 'dp' ? 'Recurrence + approach' : 'Approach + invariant'} for "${s.name}" — from blank?`,
        produce: [item.canonical.key_idea, item.canonical.invariant].filter(Boolean).join('\n'),
        attempt: s.hypothesis || '', trap: item.canonical.traps?.[0] || '',
        canonical: { pattern: item.canonical.pattern, traps: item.canonical.traps || [] },
        contentId: item.id, src: 's3', grade: s.classifyGrade
      });
    }
  }
  success();
  rerender();
}
