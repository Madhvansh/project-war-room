// Solve Mode — the 10/10/35 cockpit. Full-screen, keyboard-first, no exit
// without a pattern card. Session persists to data/session.json so a refresh
// or restart resumes the clock instead of resetting it.
import {
  App, api, esc, todayStr, logDayN, mmss, appendLog, appendCard, saveSession,
  patternDatalist, logStamp, rerender, problemInfo, problemLink, linkLabel, campaignOn
} from '../app.js';
import {
  SOLO_MIN, CEIL_MIN, REIMPL_MIN, DEBUG_MIN, CARD_SEC,
  solveElapsedMin, pausedMin, PAUSE_ABANDON_MIN, OPTIMAL_CUE_MIN
} from '../laws.js';
import { chime, blip, success, startAlarm, stopAlarm } from '../audio.js';

let viewRoot = null;
let timerId = null;
let keyHandler = null;
let gateOpen = false, ceilOpen = false, chimed = false, reimplChimed = false;

// ── the Coach (§6) — drawer state survives cockpit re-renders ────────────────
// Level moves ONLY via the explicit ESCALATE control [law author, 2026-06-11];
// L5 additionally requires the 35-minute ceiling to have fired.
const LVL = {
  1: 'L1 — one Socratic question',
  2: 'L2 — pattern family only',
  3: 'L3 — approach in plain English, no code',
  4: 'L4 — skeleton with blanks',
  5: 'L5 — full walkthrough (only past the 35-min ceiling)'
};
let coach = { open: false, level: 1, busy: false, transcript: [], problem: null, loaded: false };
function resetCoach(problem = null) {
  coach = { open: false, level: 1, busy: false, transcript: [], problem, loaded: false };
}

export function cleanupSolve() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  stopAlarm();
  closeModal();
  gateOpen = ceilOpen = chimed = reimplChimed = false;
}

// R1: the clock is SOLVE time — paused time never advances a gate
const elapsedMin = s => solveElapsedMin(s);
const round1 = x => Math.round(x * 10) / 10;
// idea 1 (approved): coming back after 60+ seconds away earns a re-entry strip
let lastCockpitSeen = 0;
// problemLink/linkLabel now live in app.js (shared) — TUF+ for the 435 sheet,
// the real platform for ⊕ supplements. idea 4's O-key + setup link both use them.

// ── R1 pause: full overlay, problem hidden, all anchors frozen ───────────────
async function pauseSession(s) {
  if (s.pausedAt || s.phase === 'card') return; // the exit door stays an exit door
  s.pausedAt = Date.now();
  s.pauseCount = (s.pauseCount || 0) + 1;
  await saveSession(s);
  renderSolve(viewRoot);
}
async function resumeSession(s) {
  if (!s.pausedAt) return;
  const dur = Date.now() - s.pausedAt;
  s.pausedMs = (s.pausedMs || 0) + dur;
  // sub-timers freeze with the cockpit: shift their anchors past the pause
  if (s.debugUntil) s.debugUntil += dur;
  if (s.reimplStartTs) s.reimplStartTs += dur;
  s.pausedAt = null;
  await saveSession(s);
  renderSolve(viewRoot);
}

function renderPaused(root, s) {
  cleanupSolve();
  root.innerHTML = `
    <div class="solve pausedview">
      <div class="phaselbl">PAUSED — problem hidden · ${mmss(elapsedMin(s) * 60)} solve time used, gates wait with you</div>
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
    root.querySelector('#psub').textContent =
      `away — pause #${s.pauseCount || 1} of this solve`;
    if (pm >= PAUSE_ABANDON_MIN && !root.querySelector('#abandon30')) {
      root.querySelector('#pabandon').innerHTML =
        `<button class="warn" id="abandon30">been away ${PAUSE_ABANDON_MIN}+ min — ABANDON → overflow</button>`;
      root.querySelector('#abandon30').addEventListener('click', async () => {
        const dur = Date.now() - s.pausedAt;
        s.pausedMs = (s.pausedMs || 0) + dur;
        s.pausedAt = null;
        finish(s, 'abandoned'); // flags + exits through the card, like every abandon
      });
    }
  };
  timerId = setInterval(tick, 500);
  tick();
  root.querySelector('#resumebtn').addEventListener('click', () => resumeSession(s));
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'p') resumeSession(s);
  };
  window.addEventListener('keydown', keyHandler);
}

// one cockpit at a time: a new pick while a session lives forces the choice
function renderGuard(root, s) {
  cleanupSolve();
  const p = App.pending;
  root.innerHTML = `
    <div class="solve"><div class="setup panel">
      <div class="phaselbl danger">ONE COCKPIT AT A TIME</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted">is live — ${mmss(elapsedMin(s) * 60)} solve time on the clock.
        You picked <b>${esc(p.problem)}</b>.</div>
      <div class="actions" style="margin-top:14px">
        <button class="primary" id="returnbtn">RETURN TO IT<kbd>Enter</kbd></button>
        <button class="warn" id="abandonbtn">ABANDON IT — logs ABANDONED + ⚑, card first, then ${esc(p.problem)}</button>
      </div>
    </div></div>`;
  root.querySelector('#returnbtn').addEventListener('click', () => {
    App.pending = null;
    renderSolve(viewRoot);
  });
  root.querySelector('#abandonbtn').addEventListener('click', () => {
    if (s.pausedAt) { s.pausedMs = (s.pausedMs || 0) + (Date.now() - s.pausedAt); s.pausedAt = null; }
    finish(s, 'abandoned'); // App.pending survives — the card save chains into it
  });
  keyHandler = e => {
    if (e.key === 'Enter' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      App.pending = null;
      renderSolve(viewRoot);
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function modal(html) {
  document.getElementById('modal-root').innerHTML =
    `<div class="modal-back"><div class="modal">${html}</div></div>`;
}
function closeModal() {
  const mr = document.getElementById('modal-root');
  if (mr) mr.innerHTML = '';
  gateOpen = ceilOpen = false;
}

export function renderSolve(root) {
  viewRoot = root;
  const s = App.state.session;
  if (!s && !App.pending) { location.hash = '#/'; return; }
  if (!s && App.pending?.upsolve) { startUpsolve(App.pending); return; }
  if (!s) return renderSetup(root);
  if (s.kind === 'recognition') { location.hash = '#/recognize'; return; } // its guard owns B reps
  if (App.pending && App.pending.problem === s.problem) App.pending = null; // same problem: resume
  if (App.pending && s.phase !== 'card')
    return renderGuard(root, s); // concurrent-session guard [Wave 4 nav ruling]
  if (s.pausedAt) return renderPaused(root, s); // R1: overlay, problem hidden
  if (s.phase === 'editorial') return renderEditorial(root, s);
  if (s.phase === 'solve') return renderCockpit(root, s);
  if (s.phase === 'reimplement') return renderReimpl(root, s);
  return renderCard(root, s);
}

// ── §3.6 upsolve: full editorial → close → re-implement → card ───────────────
async function startUpsolve(p) {
  const sess = {
    problem: p.problem, tier: 'A', date: todayStr(), day: logDayN(),
    classification: null, startTs: Date.now(), speed: App.speed,
    phase: 'editorial', hintTaken: false, gateAnswered: true,
    debugUntil: null, outcome: 'editorial', flag: false,
    upsolve: true, source: p.source || 'contest',
    reimplStartTs: null, cardStartTs: null, completedMin: null
  };
  App.pending = null;
  await saveSession(sess);
  renderSolve(viewRoot);
}

function renderEditorial(root, s) {
  cleanupSolve();
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">UPSOLVE · ${esc(s.source)}</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted" style="max-width:560px;margin:16px auto">Open the editorial. Read the FULL
        solution — idea, proof, complexity. When it's in your head, close the tab.
        Then rebuild it from a blank file.</div>
      <div class="actions">
        <button class="primary" id="closedbtn">EDITORIAL CLOSED — re-implement (${REIMPL_MIN}:00) ▸<kbd>Enter</kbd></button>
        <button id="backbtn">✕ not now</button>
      </div>
    </div>`;
  const go = () => {
    s.phase = 'reimplement';
    s.reimplStartTs = Date.now();
    saveSession(s);
    renderSolve(viewRoot);
  };
  root.querySelector('#closedbtn').addEventListener('click', go);
  root.querySelector('#backbtn').addEventListener('click', async () => {
    if (!confirm('Leave the upsolve? It stays pinned in Block 0.')) return;
    await saveSession(null);
    location.hash = '#/';
  });
  keyHandler = e => { if (e.key === 'Enter' && !/INPUT|TEXTAREA/.test(e.target.tagName)) go(); };
  window.addEventListener('keydown', keyHandler);
}

// ── phase 0: classification gate, then the clock starts ─────────────────────
function renderSetup(root) {
  const { problem, forDay, returnTo } = App.pending;
  const forTag = forDay && forDay !== todayStr()
    ? ` · <span class="cyan">for Day ${App.cur.days.find(d => d.date === forDay)?.day ?? '?'} (${forDay >= todayStr() ? 'work-ahead' : 'catch-up'})</span>` : '';
  const link = problemLink(problem);
  root.innerHTML = `
    <div class="solve"><div class="setup panel">
      <div class="phaselbl">solve mode · tier A · 10/10/35${forTag}</div>
      <div class="probname">${esc(problem)}</div>
      <a class="probopen" href="${esc(link)}" target="_blank" rel="noopener" title="opens the problem statement — read it, then start the clock (O)">
        ↗ ${linkLabel(problem)}</a>
      <label>Pattern classification — one line. The clock will not start without it.</label>
      <input id="classif" type="text" placeholder="e.g. prefix-sum + hashmap" autocomplete="off" list="patterns">
      ${patternDatalist()}
      <p class="muted" style="margin-top:10px">0–10 solo · checkpoint chime at 10 · hard ceiling at 35.</p>
      <div class="actions">
        <button class="primary" id="startbtn">START 35:00 ▸<kbd>Enter</kbd></button>
        <button id="backbtn">back</button>
      </div>
    </div></div>`;
  const input = root.querySelector('#classif');
  input.focus();
  const start = async () => {
    const classification = input.value.trim();
    if (!classification) { input.style.borderColor = 'var(--red)'; input.focus(); return; }
    const sess = {
      problem, tier: 'A', ...logStamp(forDay), returnTo: returnTo || null,
      classification, startTs: Date.now(), speed: App.speed,
      phase: 'solve', hintTaken: false, gateAnswered: false,
      debugUntil: null, outcome: null, flag: false,
      reimplStartTs: null, cardStartTs: null, completedMin: null
    };
    await saveSession(sess);
    App.pending = null;
    renderSolve(viewRoot);
  };
  root.querySelector('#startbtn').addEventListener('click', start);
  root.querySelector('#backbtn').addEventListener('click', () => { const r = returnTo || '#/'; App.pending = null; location.hash = r; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') start(); });
  // O opens the problem before the clock starts (the visible link is primary;
  // the classification input owns plain keys, so O only fires outside a field)
  keyHandler = e => {
    if (e.key.toLowerCase() === 'o' && !/INPUT|TEXTAREA/.test(e.target.tagName)) {
      e.preventDefault(); window.open(link, '_blank', 'noopener');
    }
  };
  window.addEventListener('keydown', keyHandler);
}

// ── phase 1: the 35-minute clock ─────────────────────────────────────────────
function renderCockpit(root, s) {
  cleanupSolve();
  if (coach.problem !== s.problem) resetCoach(s.problem);
  // dev-only (?coach=1): open the drawer on entry — inert unless passed
  if (!coach.autoOpened && new URLSearchParams(location.search).get('coach') === '1') {
    coach.autoOpened = true;
    coach.open = true;
  }
  const showReentry = lastCockpitSeen && Date.now() - lastCockpitSeen > 60000; // idea 1
  const link = problemLink(s.problem);
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl" id="phaselbl">SOLO ATTEMPT
        <button id="articulatetgl" class="ghost" style="float:right;padding:0 8px;font-size:10px"
          title="a YES at the gate requires one typed sentence: approach, why, complexity (auto-on in mocks)">articulate: ${articulateOn() ? 'ON' : 'off'}</button></div>
      <div class="probname">${esc(s.problem)}${link ? ` <a href="${esc(link)}" target="_blank" rel="noopener" title="open the problem (O)" class="problink">↗</a>` : ''}</div>
      ${showReentry ? `<div class="reentry" id="reentry">you were here — ⟨ ${esc(s.classification)} ⟩ · ${mmss(elapsedMin(s) * 60)} on the clock${s.dryRun ? ` · dry-run: ${esc(s.dryRun)}` : ''}${s.gateAnswered ? ' · approach banked' : ''}</div>` : ''}
      <div class="classif">⟨ ${esc(s.classification)} ⟩${s.hintTaken ? ' <span class="amber">· hint taken</span>' : ''}${s.forDay && s.forDay !== s.date ? ` <span class="cyan">· for Day ${App.cur.days.find(d => d.date === s.forDay)?.day ?? '?'}</span>` : ''}</div>
      <div class="bigclock" id="bigclock">--:--</div>
      <div class="muted" id="subline"></div>
      <div class="optcue" id="optcue" ${s.cueShown ? '' : 'hidden'}>⛏ brute banked — hunt optimal.</div>
      <div class="seg">
        <div class="solo-zone"><div class="done-fill" id="fill-solo"></div></div>
        <div class="rest-zone"><div class="done-fill" id="fill-rest"></div></div>
      </div>
      <div class="actions">
        <button class="good" id="solvedbtn">✓ SOLVED<kbd>S</kbd></button>
        <button class="warn" id="bugbtn">🐛 STUCK ON A BUG<kbd>B</kbd></button>
        <button id="coachbtn">⟁ COACH<kbd>C</kbd></button>
        <button id="pausebtn">⏸ PAUSE<kbd>P</kbd></button>
        <button id="abandonbtn">✕ abandon</button>
      </div>
      <div id="debugzone"></div>
    </div>
    ${coach.open ? coachDrawerHtml(s) : ''}`;
  if (coach.open) wireCoachDrawer(root, s);

  const $ = sel => root.querySelector(sel);
  $('#articulatetgl').addEventListener('click', e => {
    localStorage.setItem('p435.articulate', articulateOn() ? '0' : '1');
    e.target.textContent = `articulate: ${articulateOn() ? 'ON' : 'off'}`;
  });
  if (showReentry) setTimeout(() => $('#reentry')?.classList.add('fade'), 6000);

  const tick = () => {
    lastCockpitSeen = Date.now();
    const el = elapsedMin(s);
    const remain = CEIL_MIN - el;
    const bc = $('#bigclock');
    bc.textContent = mmss(Math.max(remain, 0) * 60);
    bc.classList.toggle('late', remain <= 5);
    $('#fill-solo').style.width = `${Math.min(el / SOLO_MIN, 1) * 100}%`;
    $('#fill-rest').style.width = `${Math.max(0, Math.min((el - SOLO_MIN) / (CEIL_MIN - SOLO_MIN), 1)) * 100}%`;
    if (el < SOLO_MIN) {
      $('#phaselbl').textContent = 'SOLO ATTEMPT';
      $('#subline').textContent = `checkpoint in ${mmss((SOLO_MIN - el) * 60)}`;
    } else {
      $('#phaselbl').textContent = 'EXECUTE';
      $('#subline').textContent = `minute ${Math.floor(el)} — ceiling at ${CEIL_MIN}`;
    }
    // debug sub-timer — chip updates by textContent so the dry-run input
    // underneath never gets clobbered mid-keystroke
    const dz = $('#debugzone');
    if (s.debugUntil && !dz.dataset.active) {
      dz.dataset.active = '1';
      dz.innerHTML = `<div class="debugchip" id="dchip"></div>
        <div class="dryrun"><input id="dryrun" type="text" autocomplete="off"
          placeholder="the smallest failing input — type it, then trace it on paper"
          value="${esc(s.dryRun || '')}"></div>`;
      dz.querySelector('#dryrun').addEventListener('change', e => {
        s.dryRun = e.target.value;
        saveSession(s);
      });
    }
    if (s.debugUntil) {
      const dRemain = (s.debugUntil - Date.now()) / 1000 * (s.speed || 1);
      const chip = $('#dchip');
      if (dRemain > 0) {
        chip.textContent = `🐛 DEBUG ${mmss(dRemain)} — stop re-reading code. Dry-run the smallest failing input.`;
        chip.classList.remove('danger');
      } else {
        chip.textContent = '🐛 debug window over — did the dry-run expose it? Decide.';
        chip.classList.add('danger');
      }
    }
    // R2 minute-20 cue — non-gating, once, only when an approach is banked
    if (!s.cueShown && s.gateAnswered && !s.hintTaken && el >= OPTIMAL_CUE_MIN && el < CEIL_MIN) {
      s.cueShown = true;
      saveSession(s);
      $('#optcue').hidden = false;
      blip();
    }
    // gates
    if (!ceilOpen && el >= CEIL_MIN) openCeiling(s);
    else if (!gateOpen && !ceilOpen && !s.gateAnswered && el >= SOLO_MIN) openGate(s);
  };
  timerId = setInterval(tick, 200);
  tick();

  $('#solvedbtn').addEventListener('click', () => finish(s, 'solved'));
  $('#bugbtn').addEventListener('click', () => {
    s.debugUntil = Date.now() + DEBUG_MIN * 60000 / (s.speed || 1);
    saveSession(s);
  });
  $('#abandonbtn').addEventListener('click', () => {
    if (confirm('Abandon? Logs as ABANDONED and flags it for the Day 19–20 pool. The pattern card is still required.'))
      finish(s, 'abandoned');
  });

  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (ceilOpen) {
      if (k === '1') ceilingSolved(s);
      if (k === '2') ceilingEditorial(s);
      return;
    }
    if (gateOpen) {
      if (k === 'y') gateYes(s);
      if (k === 'a') gateHint(s, 'approach');
      if (k === 'c') gateHint(s, 'coach');
      return;
    }
    if (k === 's') finish(s, 'solved');
    if (k === 'b') { s.debugUntil = Date.now() + DEBUG_MIN * 60000 / (s.speed || 1); saveSession(s); }
    if (k === 'c') { coach.open = !coach.open; renderSolve(viewRoot); }
    if (k === 'p') pauseSession(s);
    if (k === 'o') window.open(problemLink(s.problem), '_blank', 'noopener'); // idea 4
  };
  window.addEventListener('keydown', keyHandler);

  $('#coachbtn').addEventListener('click', () => { coach.open = !coach.open; renderSolve(viewRoot); });
  $('#pausebtn').addEventListener('click', () => pauseSession(s));
}

// ── the Coach drawer ─────────────────────────────────────────────────────────
function coachMsgHtml(m) {
  if (m.role === 'error') return `<div class="cmsg err">⚠ ${esc(m.content)}</div>`;
  if (m.role === 'user') return `<div class="cmsg user"><span class="who">you · L${m.level || 1}</span>${esc(m.content)}</div>`;
  return `<div class="cmsg coach"><span class="who">coach${m.model ? ` · ${esc(m.model)}` : ''}</span>${esc(m.content)}</div>`;
}

function coachDrawerHtml(s) {
  const l5Locked = !s.ceilingHit;
  return `
  <aside class="coach-drawer" id="coachdrawer">
    <div class="cd-head">
      <span>⟁ COACH</span>
      <button id="coachclose" class="ghost">✕<kbd>C</kbd></button>
    </div>
    <div class="ladderhud" title="§6: one level per explicit escalation, never above the granted level">
      ${[1, 2, 3, 4, 5].map(l => `<span class="lvl ${l <= coach.level ? 'granted' : ''} ${l === coach.level ? 'cur' : ''}"
        title="${esc(LVL[l])}">L${l}</span>`).join('')}
      <button id="escalate" ${coach.level >= 5 || (coach.level === 4 && l5Locked) ? 'disabled' : ''}
        title="${coach.level === 4 && l5Locked ? 'L5 unlocks at the 35-minute ceiling' : esc(LVL[Math.min(coach.level + 1, 5)])}">ESCALATE ▸</button>
    </div>
    <div class="cd-ctx faint" title="sent with every message, saved in the transcript">auto-attached:
      ${esc(s.classification || '—')} · minute ${Math.floor(elapsedMin(s))}${s.dryRun ? ' · dry-run input' : ''}${s.ceilingHit ? ' · past ceiling' : ''}</div>
    ${!s.hintTaken ? '<div class="cd-warn amber">first message logs this solve as HINT</div>' : ''}
    <div class="cd-msgs" id="coachmsgs">
      ${coach.loaded
        ? (coach.transcript.map(coachMsgHtml).join('') || '<div class="faint" style="padding:8px">No exchanges on this problem yet. L1 = one Socratic question.</div>')
        : '<div class="faint" style="padding:8px">loading transcript…</div>'}
      ${coach.busy ? '<div class="cmsg coach faint">coach is thinking…</div>' : ''}
    </div>
    <div class="cd-input">
      <textarea id="coach-input" rows="2" placeholder="where are you stuck? (Enter sends · Shift+Enter newline)"></textarea>
      <button class="primary" id="coachsend" ${coach.busy ? 'disabled' : ''}>▸</button>
    </div>
  </aside>`;
}

function wireCoachDrawer(root, s) {
  const $ = sel => root.querySelector(sel);
  const msgs = $('#coachmsgs');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
  $('#coachclose').addEventListener('click', () => { coach.open = false; renderSolve(viewRoot); });
  $('#escalate').addEventListener('click', () => {
    if (coach.level >= 5 || (coach.level === 4 && !s.ceilingHit)) return;
    coach.level++;
    renderSolve(viewRoot);
  });
  const send = () => coachSend(s, root);
  $('#coachsend').addEventListener('click', send);
  $('#coach-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $('#coach-input').focus();
  if (!coach.loaded && !coach.busy) {
    fetch('/api/coach?problem=' + encodeURIComponent(s.problem))
      .then(r => r.json())
      .then(d => {
        coach.transcript = d.transcript || [];
        coach.level = Math.max(1, ...coach.transcript.map(m => m.level || 1));
        coach.loaded = true;
        if (coach.open) renderSolve(viewRoot);
      })
      .catch(() => { coach.loaded = true; if (coach.open) renderSolve(viewRoot); });
  }
}

async function coachSend(s, root) {
  const ta = root.querySelector('#coach-input');
  const message = ta.value.trim();
  if (!message || coach.busy) return;
  coach.busy = true;
  coach.transcript.push({ role: 'user', content: message, level: coach.level, ts: Date.now() });
  renderSolve(viewRoot);
  try {
    const r = await api.post('/api/coach', {
      problem: s.problem, message, level: coach.level,
      context: {
        classification: s.classification,
        minutes: round1(elapsedMin(s)),
        dryRun: s.dryRun || null,
        ceilingHit: !!s.ceilingHit
      }
    });
    coach.transcript = r.transcript;
    // the grade is only spent once a reply actually arrived — a failed call
    // (no `claude` CLI, 502) gives zero help, so it must cost nothing
    s.coachUsed = true; // R6 source attribution (editorial > coach > approach-read)
    if (!s.hintTaken) s.hintTaken = true; // any coach ask caps the solve at HINT
    saveSession(s);
  } catch (e) {
    coach.transcript.push({
      role: 'error',
      content: `${String(e.message || e)}\nfallback (§3.1): open the editorial's approach paragraph ONLY — no code — then back to the clock. No hint arrived, so this solve is NOT logged as HINT.`,
      ts: Date.now()
    });
  }
  coach.busy = false;
  renderSolve(viewRoot);
}

// minute-10 checkpoint
function openGate(s) {
  gateOpen = true;
  if (!chimed) { chime(); chimed = true; }
  modal(`
    <h3>MINUTE 10 — CHECKPOINT</h3>
    <p>Do you have ANY working approach? Brute counts — bank it. The clock keeps running.</p>
    <div class="actions">
      <button class="good" id="g-yes">YES — keep going<kbd>Y</kbd></button>
      <button class="warn" id="g-appr">NO — read approach only · logs HINT<kbd>A</kbd></button>
      <button class="warn" id="g-coach">NO — ask Coach for a directional hint · logs HINT<kbd>C</kbd></button>
    </div>`);
  document.getElementById('g-yes').addEventListener('click', () => gateYes(s));
  document.getElementById('g-appr').addEventListener('click', () => gateHint(s, 'approach'));
  document.getElementById('g-coach').addEventListener('click', () => gateHint(s, 'coach'));
}
// Wave 4 feature 5: the articulate gate — optional toggle, auto-on while a
// mock is running. A YES must be SAID: approach, why it works, complexity.
// SEASON 2 W8: also auto-on during the campaign (the second attempt is production,
// so every YES forces the spoken/typed approach + complexity — explain-it-back).
function articulateOn() {
  const mockLive = (App.state.mocks || []).some(m => m.startTs && !m.finished);
  return mockLive || campaignOn() || localStorage.getItem('p435.articulate') === '1';
}
function gateYes(s) {
  if (!articulateOn()) {
    s.gateAnswered = true;
    gateOpen = false;
    saveSession(s);
    closeModal();
    return;
  }
  modal(`
    <h3>ARTICULATE IT</h3>
    <p>One sentence before you build: the approach, why it works, the complexity.</p>
    <input id="artic" type="text" autocomplete="off" placeholder="e.g. sort + two pointers from both ends, sumcheck monotone — O(n log n)" style="width:100%">
    <div class="actions"><button class="primary" id="articgo">BANKED ▸<kbd>Enter</kbd></button></div>`);
  const input = document.getElementById('artic');
  input.focus();
  const go = () => {
    const t = input.value.trim();
    if (!t) { input.style.borderColor = 'var(--red)'; input.focus(); return; }
    s.articulation = t; // saved to the log row and the card
    s.gateAnswered = true;
    gateOpen = false;
    saveSession(s);
    closeModal();
  };
  document.getElementById('articgo').addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}
function gateHint(s, kind) {
  s.gateAnswered = true;
  s.hintTaken = true;
  gateOpen = false; // free move: the latched gate flag was eating S/B/C keys post-answer
  if (kind === 'approach') s.approachRead = true; // R6 source attribution
  saveSession(s);
  closeModal();
  if (kind === 'coach') coach.open = true; // straight into the drawer — ask for a directional hint
  renderSolve(viewRoot); // re-render to show the "hint taken" mark
}

// minute-35 hard ceiling — no dismissing this one
function openCeiling(s) {
  closeModal();
  ceilOpen = true;
  if (!s.ceilingHit) { s.ceilingHit = true; saveSession(s); } // unlocks Coach L5 (§6 law 1)
  startAlarm();
  modal(`
    <h3 class="danger">MINUTE 35 — HARD CEILING</h3>
    <p>Decide. Now.</p>
    <div class="actions">
      <button class="good" id="c-solved">SOLVED ✓<kbd>1</kbd></button>
      <button class="warn" id="c-edit">READ FULL SOLUTION → re-implement from blank (15:00)
        · logs EDITORIAL · flags for Day 19–20<kbd>2</kbd></button>
    </div>`);
  document.getElementById('c-solved').addEventListener('click', () => ceilingSolved(s));
  document.getElementById('c-edit').addEventListener('click', () => ceilingEditorial(s));
}
function ceilingSolved(s) { stopAlarm(); finish(s, 'solved'); }
function ceilingEditorial(s) {
  stopAlarm();
  closeModal();
  s.outcome = 'editorial';
  s.flag = true;
  s.completedMin = round1(Math.min(elapsedMin(s), CEIL_MIN));
  s.phase = 'reimplement';
  s.reimplStartTs = Date.now();
  saveSession(s);
  renderSolve(viewRoot);
}

function finish(s, kind) {
  stopAlarm();
  closeModal();
  if (s.completedMin == null) s.completedMin = round1(Math.min(elapsedMin(s), CEIL_MIN));
  if (kind === 'solved') {
    s.outcome = s.hintTaken ? 'hint' : 'solo';
    s.flag = false;
    success();
  } else {
    s.outcome = 'abandoned';
    s.flag = true;
  }
  s.phase = 'card';
  s.cardStartTs = Date.now();
  saveSession(s);
  renderSolve(viewRoot);
}

// ── phase 2: editorial → re-implement from blank ─────────────────────────────
function renderReimpl(root, s) {
  cleanupSolve();
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">RE-IMPLEMENT FROM BLANK</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted">Solution closed. Blank file. Rebuild it from memory.</div>
      <div class="bigclock" id="bigclock">15:00</div>
      <div class="actions">
        <button class="primary" id="donebtn">DONE — pattern card ▸<kbd>Enter</kbd></button>
        <button id="pausebtn">⏸ PAUSE<kbd>P</kbd></button>
      </div>
    </div>`;
  const tick = () => {
    const remain = REIMPL_MIN - (Date.now() - s.reimplStartTs) / 60000 * (s.speed || 1);
    const bc = root.querySelector('#bigclock');
    bc.textContent = mmss(Math.max(remain, 0) * 60);
    bc.classList.toggle('late', remain <= 2);
    if (remain <= 0 && !reimplChimed) { chime(); reimplChimed = true; }
  };
  timerId = setInterval(tick, 200);
  tick();
  const done = () => {
    if (s.completedMin == null) // upsolve path: the re-implement is the timed work
      s.completedMin = round1((Date.now() - s.reimplStartTs) / 60000 * (s.speed || 1));
    s.phase = 'card';
    s.cardStartTs = Date.now();
    saveSession(s);
    renderSolve(viewRoot);
  };
  root.querySelector('#donebtn').addEventListener('click', done);
  root.querySelector('#pausebtn').addEventListener('click', () => pauseSession(s));
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === 'Enter') done();
    if (e.key.toLowerCase() === 'p') pauseSession(s);
  };
  window.addEventListener('keydown', keyHandler);
}

// ── R6 depth ledger: the problem's tiers (DP gets the pipeline names) ─────────
function depthTiers(problem) {
  const info = problemInfo(problem);
  const names = (info?.depth_tiers || []).map(t => t.name).filter(Boolean);
  return names.length ? names : ['brute', 'better', 'optimal'];
}
function depthSource(s) {
  // precedence ruled by the author: editorial > coach > gate-approach-read;
  // a hint without a finer flag still attributes 'hint', never 'solo'
  if (s.outcome === 'editorial') return 'editorial';
  if (s.coachUsed) return 'coach';
  if (s.approachRead) return 'approach-read';
  if (s.hintTaken) return 'hint';
  return 'solo';
}
function depthChipsHtml(s, tiers) {
  const solo = s.outcome === 'solo';
  const chip = (row, name, sel) =>
    `<button class="dchip ${sel ? 'sel' : ''}" data-drow="${row}" data-dval="${esc(name)}">${esc(name)}</button>`;
  return `
    <div class="depthblock panel" id="depthblock">
      <div class="muted" style="margin-bottom:6px">DEPTH — one tap each (R6; quota counts any implemented depth)</div>
      <div class="depthrow"><span class="dlbl">highest tier ALONE</span>
        ${(solo ? tiers : ['none', ...tiers]).map(n => chip('alone', n, s.depthAlone === n)).join('')}
        ${solo ? '<span class="faint">solo — final = alone</span>' : ''}</div>
      ${solo ? '' : `<div class="depthrow"><span class="dlbl">final tier reached</span>
        ${tiers.map(n => chip('final', n, s.depthFinal === n)).join('')}
        <span class="faint">source auto-attributed: ${esc(depthSource(s))}</span></div>
      <div class="depthrow"><span class="dlbl">why it stalled <span class="faint">(optional)</span></span>
        ${['no idea', 'wrong pattern', 'bug', 'interrupted'].map(n =>
          `<button class="dchip ${s.struggle === n ? 'sel' : ''}" data-drow="struggle" data-dval="${esc(n)}">${esc(n)}</button>`).join('')}
      </div>`}
    </div>`;
}

function wireDepthChips(root, s, tiers) {
  const block = root.querySelector('#depthblock');
  if (!block) return;
  const idx = n => tiers.indexOf(n); // 'none' → −1, conveniently the shallowest
  const sync = () => {
    for (const b of block.querySelectorAll('button[data-drow]')) {
      const v = b.dataset.dval;
      b.classList.toggle('sel', b.dataset.drow === 'alone' ? s.depthAlone === v
        : b.dataset.drow === 'struggle' ? s.struggle === v : s.depthFinal === v);
    }
  };
  block.addEventListener('click', e => {
    const b = e.target.closest('button[data-drow]');
    if (!b) return;
    if (b.dataset.drow === 'struggle') { // idea 2: ground truth for weakScore v2
      s.struggle = s.struggle === b.dataset.dval ? null : b.dataset.dval;
      saveSession(s);
      sync();
      return;
    }
    if (b.dataset.drow === 'alone') {
      s.depthAlone = b.dataset.dval;
      if (s.outcome === 'solo') s.depthFinal = s.depthAlone;
      else if (s.depthFinal && idx(s.depthFinal) < idx(s.depthAlone)) s.depthFinal = s.depthAlone;
    } else {
      s.depthFinal = b.dataset.dval;
      if (s.depthAlone && idx(s.depthAlone) > idx(s.depthFinal)) s.depthAlone = s.depthFinal; // he over-claimed — final wins
    }
    saveSession(s);
    sync();
    block.style.borderColor = '';
  });
}

// ── phase 3: the exit door — pattern card, no skipping ───────────────────────
function renderCard(root, s) {
  cleanupSolve();
  const tiers = depthTiers(s.problem);
  // categorization + intuition are held back to here — never the pre-solve list
  // — so naming the pattern stays your drill. Now compare against the bank.
  const info = problemInfo(s.problem);
  const canonical = info ? `
      <div class="flipcard panel" style="text-align:left;max-width:560px;margin:14px auto 0">
        <div class="ftag">CANONICAL — held back until now · compare against your call</div>
        <div class="fpattern">${esc(info.pattern)}</div>
        ${info.trigger ? `<div class="vline" style="margin-top:8px"><span class="vtag">⚡</span>${esc(info.trigger)}</div>` : ''}
        ${info.trap ? `<div class="vline"><span class="vtag trap">✗</span>${esc(info.trap)}</div>` : ''}
      </div>` : '';
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">PATTERN CARD — the exit door</div>
      <div class="probname">${esc(s.problem)}</div>
      <div class="muted">outcome: <span class="outcome-${esc(s.outcome)}">${esc(s.outcome.toUpperCase())}</span>
        · ${s.completedMin} min ${s.upsolve ? `· <span style="color:var(--cyan)">⚡ upsolve (${esc(s.source)})</span>` : ''}
        ${s.flag ? '· <span class="danger">⚑ flagged for Day 19–20</span>' : ''}</div>
      ${s.upsolve ? '' : depthChipsHtml(s, tiers)}
      <div class="cardform panel">
        <div class="cardtimer" id="cardtimer">1:00</div>
        <label class="muted">PATTERN — name it (R3: this + one line is the whole human card)</label>
        <input id="f-pattern" type="text" autocomplete="off" value="" list="patterns">
        <label class="muted" style="margin-top:10px;display:block">ONE LINE — the observation worth keeping</label>
        <input id="f-note" type="text" autocomplete="off" placeholder="what you saw / what nearly got you — one line">
        ${patternDatalist()}
        <p class="faint" style="margin-top:8px">your two lines stay yours; a deeper AI layer (optimal insight) lands later in the vault — never merged in.</p>
        <div class="actions" style="margin-top:16px">
          <button class="primary" id="savebtn">SAVE &amp; EXIT ▸<kbd>Ctrl+Enter</kbd></button>
        </div>
      </div>
      ${canonical}
    </div>`;
  const $ = sel => root.querySelector(sel);
  $('#f-pattern').value = s.classification || '';
  $('#f-note').focus();
  wireDepthChips(root, s, tiers);

  const tick = () => {
    const remain = CARD_SEC - (Date.now() - s.cardStartTs) / 1000 * (s.speed || 1);
    const ct = $('#cardtimer');
    if (remain > 0) ct.textContent = mmss(remain);
    else { ct.textContent = 'over 60s — write it and go'; ct.classList.add('over'); }
  };
  timerId = setInterval(tick, 250);
  tick();

  const save = async () => {
    const pattern = $('#f-pattern').value.trim();
    const note = $('#f-note').value.trim();
    for (const [val, id] of [[pattern, '#f-pattern'], [note, '#f-note']]) {
      if (!val) { $(id).style.borderColor = 'var(--red)'; $(id).focus(); return; }
    }
    if (!s.upsolve && (!s.depthAlone || !s.depthFinal)) { // R6: one tap each, no skipping
      const block = $('#depthblock');
      if (block) { block.style.borderColor = 'var(--red)'; block.scrollIntoView({ block: 'center' }); return; }
    }
    $('#savebtn').disabled = true;
    await appendCard({
      date: s.date, day: s.day, problem: s.problem, pattern, note,
      ...(s.articulation ? { articulation: s.articulation } : {}),
      enrich: { // context for the async AI layer — server queues it
        classification: s.classification, outcome: s.outcome,
        minutes: s.completedMin,
        depth: s.upsolve ? null : { alone: s.depthAlone, final: s.depthFinal, source: depthSource(s) }
      }
    });
    await appendLog({
      date: s.date, day: s.day, problem: s.problem, tier: s.tier,
      minutes: s.completedMin, outcome: s.outcome, flag: s.flag,
      classification: s.classification, dry_run: s.dryRun ?? null,
      pause_count: s.pauseCount || 0, paused_minutes: round1(pausedMin(s)),
      ...(s.articulation ? { articulation: s.articulation } : {}),
      ...(s.struggle ? { struggle: s.struggle } : {}),
      ...(s.upsolve ? { upsolve: true, source: s.source } : {
        depth_alone: s.depthAlone === 'none' ? null : s.depthAlone,
        depth_final: s.depthFinal,
        depth_top: tiers[tiers.length - 1],
        depth_source: depthSource(s)
      }),
      ...(s.forDay ? { forDay: s.forDay } : {})
    });
    await saveSession(null);
    const next = App.pending; // a concurrency-guard abandon chains into the new pick
    resetCoach();
    success();
    if (next) {
      const h = next.tier === 'B' ? '#/recognize' : '#/solve';
      if (location.hash === h) rerender(); else location.hash = h;
    } else {
      App.pending = null;
      location.hash = s.returnTo || '#/'; // back to the calendar day he launched from
    }
  };
  $('#savebtn').addEventListener('click', save);
  keyHandler = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); };
  window.addEventListener('keydown', keyHandler);
}
