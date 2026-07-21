// Recognition Mode — §3.2 Tier B rapid-fire cockpit, R4 form [author-
// authorized]: name the pattern (2-minute sub-timer, unchanged law) → REVEAL
// the canonical card from problems.json → one-key self-grade ✓/~/✗ →
// auto-advance. The rep IS the card: it auto-saves as a B-card (guess +
// canonical + grade) joining the review deck — no separate card form.
// The 7:00 ceiling and classified_in_time are unchanged law. ✗ offers a
// quiet promote-to-Tier-A action feeding data/candidates.json (never quota).
import {
  App, esc, todayStr, logDayN, mmss, appendLog, appendCard, saveSession,
  recognizedB, dayEntry, effQuota, patternDatalist, logStamp, problemStatus,
  problemInfo, sheetMark, saveCandidates, problemLink, linkLabel
} from '../app.js';
import {
  TIERB_CEIL_MIN, TIERB_CLASSIFY_MIN,
  solveElapsedMin, pausedMin, PAUSE_ABANDON_MIN
} from '../laws.js';
import { chime, blip, success } from '../audio.js';

let viewRoot = null, timerId = null, keyHandler = null;
let ceilChimed = false, lateBlipped = false, attackMounted = false;

export function cleanupRecognize() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  ceilChimed = lateBlipped = attackMounted = false;
}

// R1: the 7:00 ceiling and the 2:00 classify sub-timer run on SOLVE time
const elapsedMin = s => solveElapsedMin(s);
const round1 = x => Math.round(x * 10) / 10;

// ── Attack Plan (Regime-2, anti-freeze) ─────────────────────────────────────
// A CONTENT-FREE process scaffold: restate → 4-line sketch → tiny dry-run. The
// prompts are identical for every problem, so it NEVER pre-empts his pattern
// classification (failure mode #2). Opt-in (button / A key) and auto-surfaced
// once when he freezes (past ~2:30 with an empty pattern field). The 7:00 / 2:00
// timers and classified_in_time stay untouched law. Preference is device-level
// (localStorage), mirroring solve.js's p435.articulate — no settings page.
const attackPref = () => localStorage.getItem('p435.attackplan') === '1';
const setAttackPref = on => localStorage.setItem('p435.attackplan', on ? '1' : '0');

// ── R1 pause: same overlay law as the solve cockpit ──────────────────────────
async function pauseRep(s) {
  if (s.pausedAt || s.phase === 'card') return;
  s.pausedAt = Date.now();
  s.pauseCount = (s.pauseCount || 0) + 1;
  await saveSession(s);
  renderRecognize(viewRoot);
}
async function resumeRep(s) {
  if (!s.pausedAt) return;
  s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt);
  s.pausedAt = null;
  await saveSession(s);
  renderRecognize(viewRoot);
}

function renderPaused(root, s) {
  cleanupRecognize();
  root.innerHTML = `
    <div class="solve recog pausedview">
      <div class="phaselbl">PAUSED — problem hidden · ${mmss(elapsedMin(s) * 60)} rep time used, the 7:00 ceiling waits</div>
      <div class="bigclock dim" id="pclock">--:--</div>
      <div class="muted" id="psub"></div>
      <div class="actions">
        <button class="primary" id="resumebtn">RESUME ▸<kbd>P</kbd></button>
        <span id="pabandon"></span>
      </div>
    </div>`;
  const tick = () => {
    const pm = pausedMin(s);
    root.querySelector('#pclock').textContent = mmss(pm * 60);
    root.querySelector('#psub').textContent = `pause #${s.pauseCount || 1} · a rep is 7 minutes — drop it if you've moved on`;
    if (pm >= PAUSE_ABANDON_MIN && !root.querySelector('#drop30')) {
      root.querySelector('#pabandon').innerHTML =
        `<button class="warn" id="drop30">been away ${PAUSE_ABANDON_MIN}+ min — DROP REP (nothing logged)</button>`;
      root.querySelector('#drop30').addEventListener('click', async () => {
        const r = s.returnTo || '#/';
        await saveSession(null);
        location.hash = r;
      });
    }
  };
  timerId = setInterval(tick, 500);
  tick();
  root.querySelector('#resumebtn').addEventListener('click', () => resumeRep(s));
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'p') resumeRep(s);
  };
  window.addEventListener('keydown', keyHandler);
}

// one cockpit at a time: a new pick over a live rep forces the choice
function renderGuard(root, s) {
  cleanupRecognize();
  const p = App.pending;
  root.innerHTML = `
    <div class="solve recog"><div class="setup panel">
      <div class="phaselbl danger">ONE COCKPIT AT A TIME</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted">rep is live — ${mmss(elapsedMin(s) * 60)} on the clock. You picked <b>${esc(p.problem)}</b>.</div>
      <div class="actions" style="margin-top:14px">
        <button class="primary" id="returnbtn">RETURN TO IT<kbd>Enter</kbd></button>
        <button class="warn" id="dropbtn">DROP REP — nothing logged, then ${esc(p.problem)}</button>
      </div>
    </div></div>`;
  root.querySelector('#returnbtn').addEventListener('click', () => { App.pending = null; renderRecognize(viewRoot); });
  root.querySelector('#dropbtn').addEventListener('click', async () => {
    const next = App.pending;
    await saveSession(null);
    const h = next.tier === 'B' ? '#/recognize' : '#/solve';
    if (location.hash === h) renderRecognize(viewRoot); else location.hash = h;
  });
  keyHandler = e => {
    if (e.key === 'Enter' && !/INPUT|TEXTAREA/.test(e.target.tagName)) { App.pending = null; renderRecognize(viewRoot); }
  };
  window.addEventListener('keydown', keyHandler);
}

export function renderRecognize(root) {
  viewRoot = root;
  const s = App.state.session;
  if (!s && !App.pending) { location.hash = '#/'; return; }
  if (!s) { startRep(App.pending.problem, App.pending.forDay, App.pending.returnTo); return; }
  if (s.kind !== 'recognition') { location.hash = '#/solve'; return; } // a solve session lives there
  if (App.pending && App.pending.problem === s.problem) App.pending = null;
  if (App.pending) return renderGuard(root, s);
  if (s.pausedAt) return renderPaused(root, s);
  if (s.phase === 'reveal' || s.phase === 'card') return renderReveal(root, s); // 'card' = pre-R4 leftover
  return renderCockpit(root, s);
}

async function startRep(problem, forDay = null, returnTo = null) {
  const sess = {
    kind: 'recognition', problem, tier: 'B', ...logStamp(forDay), returnTo: returnTo || null,
    startTs: Date.now(), speed: App.speed, phase: 'recognize',
    pattern: '', guess: null, classifiedInTime: null, minutes: null,
    restate: '', sketch: '', dryRun: '', attackOpen: false, attackAutoTried: false
  };
  App.pending = null;
  await saveSession(sess);
  renderRecognize(viewRoot);
}

function renderCockpit(root, s) {
  cleanupRecognize();
  const forTag = s.forDay && s.forDay !== s.date
    ? ` · <span class="cyan">for Day ${App.cur.days.find(d => d.date === s.forDay)?.day ?? '?'}</span>` : '';
  const link = problemLink(s.problem); // TUF+ for the 435 sheet, the real platform for ⊕ supplements (shared with Tier A)
  root.innerHTML = `
    <div class="solve recog">
      <div class="phaselbl">RECOGNITION · TIER B${forTag}</div>
      <div class="probname">${esc(s.problem)}${sheetMark(s.problem)}</div>
      <a class="probopen" href="${esc(link)}" target="_blank" rel="noopener" title="opens the problem statement — read it, then name the pattern (O)">↗ ${linkLabel(s.problem)}</a>
      <div class="bigclock" id="bigclock">--:--</div>
      <div class="muted" id="subline"></div>
      <div class="recogform panel">
        <label>PATTERN — name it <span class="subtimer" id="subtimer">${TIERB_CLASSIFY_MIN}:00</span></label>
        <input id="r-pattern" type="text" autocomplete="off" placeholder="e.g. two pointers from both ends" value="${esc(s.pattern)}" list="patterns">
        ${patternDatalist()}
        <div class="actions" style="margin-top:16px">
          <button class="primary" id="revealbtn">REVEAL canonical ▸<kbd>Ctrl+Enter</kbd></button>
          <button id="pausebtn">⏸ PAUSE</button>
          <button id="attackbtn" class="ghost">🧭 attack plan<kbd>A</kbd></button>
          <button id="backbtn">✕ abandon rep</button>
        </div>
        <div id="attackzone" hidden></div>
      </div>
    </div>`;

  const $ = sel => root.querySelector(sel);
  const patternEl = $('#r-pattern');
  patternEl.focus();

  // ── attack-plan scaffold: body built ONCE, then only its visibility flips,
  // so tick() never clobbers a field mid-keystroke. Fields save on `change`
  // (commit/blur) only — the solve.js dry-run discipline. ───────────────────
  const attackZone = $('#attackzone');
  function buildAttackBody() {
    if (attackMounted) return;
    attackMounted = true;
    attackZone.innerHTML = `
      <div class="attackplan panel">
        <div class="aphdr">7 MINUTES — DO, DON'T STARE <span>· same prompts every problem, no hints</span></div>
        <label>1 · RESTATE — one line, your own words</label>
        <input id="ap-restate" type="text" autocomplete="off"
          placeholder="what's the input, what's the output? one sentence." value="${esc(s.restate || '')}">
        <label>2 · SKETCH — 4 lines max, plain words or pseudocode</label>
        <textarea id="ap-sketch" rows="4" autocomplete="off"
          placeholder="what do I loop over? what do I track? what's the move each step? what do I return? (no code — just the moves)">${esc(s.sketch || '')}</textarea>
        <label>3 · DRY-RUN — the tiniest example, by hand</label>
        <input id="ap-dryrun" type="text" autocomplete="off"
          placeholder="smallest input + what your sketch produces on it" value="${esc(s.dryRun || '')}">
        <label class="aptoggle"><input type="checkbox" id="ap-always"> always open the attack plan for Tier B</label>
      </div>`;
    attackZone.querySelector('#ap-restate').addEventListener('change', e => { s.restate = e.target.value; saveSession(s); });
    attackZone.querySelector('#ap-sketch').addEventListener('change', e => { s.sketch = e.target.value; saveSession(s); });
    attackZone.querySelector('#ap-dryrun').addEventListener('change', e => { s.dryRun = e.target.value; saveSession(s); });
    const always = attackZone.querySelector('#ap-always');
    always.checked = attackPref();
    always.addEventListener('change', e => setAttackPref(e.target.checked));
  }
  function openAttack(focusFirst) {
    buildAttackBody();
    attackZone.hidden = false;
    s.attackOpen = true; saveSession(s);
    $('#attackbtn').classList.add('on');
    if (focusFirst) attackZone.querySelector('#ap-restate')?.focus();
  }
  function closeAttack() {
    attackZone.hidden = true;
    s.attackOpen = false; saveSession(s);
    $('#attackbtn').classList.remove('on');
  }
  if (s.attackOpen || attackPref()) openAttack(false); // restore without stealing the pattern field's focus

  const tick = () => {
    const el = elapsedMin(s);
    const remain = TIERB_CEIL_MIN - el;
    const bc = $('#bigclock');
    bc.textContent = mmss(Math.max(remain, 0) * 60);
    bc.classList.toggle('late', remain <= 1);
    if (remain <= 0) {
      if (!ceilChimed) { chime(); ceilChimed = true; }
      $('#subline').textContent = 'ceiling hit — name it, sketch it, move.';
    } else {
      $('#subline').textContent = 'easy ones take 2–3 minutes. the timer is a ceiling, not a target.';
    }
    // 2-minute classification sub-timer
    const st = $('#subtimer');
    const cRemain = TIERB_CLASSIFY_MIN - el;
    if (s.classifiedInTime === true) {
      st.textContent = '✓ in time'; st.className = 'subtimer ok';
    } else if (cRemain > 0) {
      st.textContent = mmss(cRemain * 60); st.className = 'subtimer';
    } else {
      if (s.classifiedInTime === null) { s.classifiedInTime = false; saveSession(s); }
      if (!lateBlipped) { blip(); lateBlipped = true; }
      st.textContent = 'late'; st.className = 'subtimer late';
    }
    // anti-freeze: ~2:30 in with nothing typed → surface the scaffold ONCE,
    // gently. Runs on SOLVE time (pause/speed-aware via el) — no new timer, never
    // touches classified_in_time, never nags twice, never steals focus.
    if (!s.attackOpen && !s.attackAutoTried && el >= 2.5 && !s.pattern.trim()) {
      s.attackAutoTried = true;
      openAttack(false);
      blip();
    }
  };
  timerId = setInterval(tick, 200);
  tick();

  patternEl.addEventListener('input', () => {
    s.pattern = patternEl.value;
    if (s.classifiedInTime === null && s.pattern.trim() && elapsedMin(s) <= TIERB_CLASSIFY_MIN) {
      s.classifiedInTime = true;
      saveSession(s);
    }
  });
  patternEl.addEventListener('change', () => saveSession(s));

  const reveal = () => {
    s.pattern = patternEl.value.trim();
    if (!s.pattern) { patternEl.style.borderColor = 'var(--red)'; patternEl.focus(); return; }
    s.guess = s.pattern;
    s.minutes = round1(elapsedMin(s)); // real minutes — over-ceiling shows in the log
    s.phase = 'reveal';
    saveSession(s);
    renderRecognize(viewRoot);
  };
  $('#revealbtn').addEventListener('click', reveal);
  $('#pausebtn').addEventListener('click', () => pauseRep(s));
  $('#attackbtn').addEventListener('click', () => attackZone.hidden ? openAttack(true) : closeAttack());
  $('#backbtn').addEventListener('click', async () => {
    if (!confirm('Abandon this rep? Nothing gets logged.')) return;
    const r = s.returnTo || '#/';
    await saveSession(null);
    location.hash = r;
  });
  keyHandler = e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) return reveal();
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'p') pauseRep(s);
    if (e.key.toLowerCase() === 'a') attackZone.hidden ? openAttack(true) : closeAttack();
    if (e.key.toLowerCase() === 'o') window.open(link, '_blank', 'noopener'); // open the statement (parity with Tier A)
  };
  window.addEventListener('keydown', keyHandler);
}

// ── R4: REVEAL the canonical card → one-key grade → the rep IS the card ──────
function renderReveal(root, s) {
  cleanupRecognize();
  const info = problemInfo(s.problem);
  const guess = s.guess ?? s.pattern ?? '';
  root.innerHTML = `
    <div class="solve recog">
      <div class="phaselbl">REVEAL — grade your recall</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted">you said: <b>${esc(guess)}</b>
        ${s.classifiedInTime === false ? '· <span class="amber">classified late</span>' : ''}
        · ${s.minutes ?? round1(elapsedMin(s))} min</div>
      ${info ? `
      <div class="flipcard panel" style="text-align:left;max-width:560px;margin:14px auto">
        <div class="ftag">CANONICAL</div>
        <div class="fpattern">${esc(info.pattern)}</div>
        <div class="vline" style="margin-top:8px"><span class="vtag">⚡</span>${esc(info.trigger)}</div>
        <div class="vline"><span class="vtag trap">✗</span>${esc(info.trap)}</div>
        ${(info.depth_tiers || []).length ? `<div class="vline faint" style="margin-top:6px">
          ${info.depth_tiers.map(t => `${esc(t.name)} ${esc(t.complexity || '')}`).join(' → ')}</div>` : ''}
      </div>`
      : '<div class="panel muted" style="max-width:560px;margin:14px auto">no canonical card on file — grade your own recall.</div>'}
      <div class="actions">
        <button class="good" data-grade="pass">✓ NAILED IT<kbd>1</kbd></button>
        <button class="warn" data-grade="partial">~ CLOSE<kbd>2</kbd></button>
        <button class="primary" data-grade="fail">✗ MISSED<kbd>3</kbd></button>
        <button class="ghost" id="notesbtn">+ note</button>
        <button id="pausebtn" class="ghost">⏸<kbd>P</kbd></button>
      </div>
      <div id="noteszone" hidden style="max-width:560px;margin:10px auto">
        <input id="r-note" type="text" autocomplete="off" placeholder="optional — one line onto the B-card" style="width:100%">
      </div>
    </div>`;
  const $ = sel => root.querySelector(sel);
  $('#notesbtn').addEventListener('click', () => {
    const z = $('#noteszone');
    z.hidden = !z.hidden;
    if (!z.hidden) $('#r-note').focus();
  });
  $('#pausebtn').addEventListener('click', () => pauseRep(s));

  const grade = async g => {
    const note = $('#r-note').value.trim();
    await appendCard({ // the rep IS the card — no separate form (R4)
      kind: 'B', date: s.date, day: s.day, problem: s.problem,
      guess, grade: g, pattern: info?.pattern ?? guess,
      canonical: info ? { trigger: info.trigger, pattern: info.pattern, trap: info.trap } : null,
      ...(note ? { note } : {}),
      ...((s.restate || s.sketch || s.dryRun)
        ? { process: { restate: s.restate || '', sketch: s.sketch || '', dryRun: s.dryRun || '' } }
        : {})
    });
    await appendLog({
      date: s.date, day: s.day, problem: s.problem, tier: 'B',
      minutes: s.minutes, outcome: 'recognized', flag: false,
      classification: guess, grade: g,
      classified_in_time: s.classifiedInTime,
      pause_count: s.pauseCount || 0, paused_minutes: round1(pausedMin(s)),
      ...(s.forDay ? { forDay: s.forDay } : {})
    });
    await saveSession(null);
    success();
    renderNext(viewRoot, s.problem, s.forDay, g === 'fail' ? s.problem : null, s.returnTo);
  };
  for (const b of root.querySelectorAll('button[data-grade]'))
    b.addEventListener('click', () => grade(b.dataset.grade));
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === '1') grade('pass');
    if (e.key === '2') grade('partial');
    if (e.key === '3') grade('fail');
    if (e.key.toLowerCase() === 'p') pauseRep(s);
  };
  window.addEventListener('keydown', keyHandler);
}

// rapid-fire chain: one keypress to the next unrecognized Tier B problem.
// In a forDay flow (calendar catch-up / work-ahead) the chain walks THAT
// day's list, "done" judged by any recognition ever (credit already routed).
// After a ✗ grade, a QUIET promote-to-Tier-A action feeds the candidates
// list — a suggestion pile, never an automatic quota change (R4).
function renderNext(root, lastProblem, forDay = null, failedProblem = null, returnTo = null) {
  cleanupRecognize();
  const entry = forDay ? App.cur.days.find(d => d.date === forDay) : dayEntry();
  const status = forDay ? problemStatus() : null;
  const isDone = p => forDay
    ? status.get(p)?.outcome === 'recognized'
    : recognizedB(todayStr()).has(p);
  // walk FORWARD from the slot right after the one just solved (wrapping once)
  // so the chain follows list order — intro → traversal → … — instead of
  // snapping back to the first undone item at the top of the list. The wrap
  // still sweeps up any earlier items left unrecognized before the list clears.
  const list = entry?.tierB || [];
  const start = list.indexOf(lastProblem) + 1; // 0 when lastProblem isn't in this list
  let next = null;
  for (let i = 0; i < list.length; i++) {
    const cand = list[(start + i) % list.length];
    if (cand !== lastProblem && !isDone(cand)) { next = cand; break; }
  }
  const pinned = returnTo || (forDay ? `#/calendar?d=${forDay}` : '#/'); // stay where he launched
  const label = forDay
    ? `REP LOGGED — DAY ${entry?.day} LIST (${forDay >= todayStr() ? 'work-ahead' : 'catch-up'})`
    : `REP LOGGED — TIER B ${recognizedB(todayStr()).size}/${effQuota(todayStr()).b}`;
  const promoteHtml = failedProblem && !(App.state.candidates || []).some(c => c.problem === failedProblem)
    ? `<p class="faint" style="margin-top:10px"><a href="#" id="promote">✗ on ${esc(failedProblem)} — promote to Tier A?</a>
       <span class="faint">adds to the candidates pile, never the quota</span></p>` : '';
  if (!next && !promoteHtml) { location.hash = pinned; return; }
  const home = pinned.startsWith('#/calendar') ? 'day view' : 'mission control';
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">${label}</div>
      <div class="nextup panel">
        ${next ? `<div class="muted" style="font-size:12px;letter-spacing:2px">NEXT</div>
        <div class="nextname">${esc(next)}</div>` : '<div class="muted">list cleared.</div>'}
        <div class="actions">
          ${next ? `<button class="primary" id="nextbtn">GO ▸<kbd>Enter</kbd></button>` : ''}
          <button id="homebtn">${home}<kbd>Esc</kbd></button>
        </div>
        ${promoteHtml}
      </div>
    </div>`;
  const exit = () => { location.hash = pinned; };
  root.querySelector('#nextbtn')?.addEventListener('click', () => startRep(next, forDay, returnTo));
  root.querySelector('#homebtn').addEventListener('click', exit);
  root.querySelector('#promote')?.addEventListener('click', async e => {
    e.preventDefault();
    App.state.candidates ||= [];
    App.state.candidates.push({ problem: failedProblem, date: todayStr(), from: 'recognition ✗', ts: Date.now() });
    await saveCandidates();
    e.target.outerHTML = '<span class="ok">queued as a Tier A candidate ✓</span>';
  });
  keyHandler = e => {
    if (next && e.key === 'Enter') { e.preventDefault(); startRep(next, forDay, returnTo); }
    if (e.key === 'Escape') exit();
  };
  window.addEventListener('keydown', keyHandler);
}
