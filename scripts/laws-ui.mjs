// DOM-level law audit + Solve Mode regression via headless Edge.
// Proves what laws.mjs cannot: the rendered gates and the unskippable card
// form (the router refuses to leave an active session). Fully sandboxed:
// spawns its OWN server on :4399 against a throwaway temp data dir — it can
// never touch the live :4350 server or ./data (user rule, 2026-06-11).
// Usage: node scripts/laws-ui.mjs
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.P435_TEST_PORT || 4399);
const BASE = `http://localhost:${PORT}`;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'p435-test-'));

const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Microsoft Edge not found — cannot run UI audit.'); process.exit(1); }

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.error('  FAIL  ' + name)); };

// dump-dom forces a stdout wait (GUI-subsystem gotcha); strip inline scripts
// so page-script strings never false-positive a content match. Each call gets
// its OWN user-data-dir + hard timeout: without one, headless Edge forwards
// to the user's RUNNING browser via the default-profile singleton and hangs
// forever (bit us live on Day 1, 2026-06-12).
let dumpSeq = 0;
function dom(urlPath, budget = 4500) {
  const prof = path.join(os.tmpdir(), `p435-ui-dump-${process.pid}-${++dumpSeq}`);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return execFileSync(EDGE, [
          '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`,
          `--virtual-time-budget=${budget}`, '--dump-dom', BASE + urlPath
        ], { encoding: 'utf8', maxBuffer: 64e6, timeout: 45000, killSignal: 'SIGKILL' })
          .replace(/<script[\s\S]*?<\/script>/gi, '');
      } catch (e) {
        if (attempt >= 1) throw e;
      }
    }
  } finally {
    try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
  }
}

const clean = d => !d.includes('data-errtrap');

// keep-alive sockets go stale across slow Edge dumps → force fresh
// connections and retry transient resets
async function jfetch(url, opts = {}, tries = 3) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { ...opts, headers: { ...(opts.headers || {}), connection: 'close' } });
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

// ── sandboxed server lifecycle ───────────────────────────────────────────────
let serverProc = null;
async function up() {
  try { await jfetch(BASE + '/api/state', {}, 1); return true; } catch { return false; }
}
async function ensureServer() {
  if (await up()) throw new Error(`something already listens on :${PORT} — refusing to share a test port`);
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, P435_NO_ENRICH: '1', P435_PORT: String(PORT), P435_DATA: SANDBOX }
  });
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 250));
    if (await up()) return;
  }
  throw new Error(`sandboxed server failed to start on :${PORT}`);
}

const put = (name, doc) => jfetch(`${BASE}/api/${name}`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
});

const solveSession = (elapsedMin, phase, gateAnswered = false) => ({
  problem: 'Kadane', tier: 'A', date: '2026-06-12', day: 1,
  classification: 'max subarray dp', speed: 1,
  startTs: Date.now() - elapsedMin * 60000, phase,
  hintTaken: false, gateAnswered,
  debugUntil: null,
  outcome: phase === 'reimplement' || phase === 'card' ? 'editorial' : null,
  flag: phase === 'reimplement' || phase === 'card',
  reimplStartTs: phase === 'reimplement' ? Date.now() - 60000 : null,
  cardStartTs: phase === 'card' ? Date.now() : null,
  completedMin: phase === 'reimplement' || phase === 'card' ? 35 : null
});

const recogSession = phase => ({
  kind: 'recognition', problem: 'Linear Search', tier: 'B', date: '2026-06-12', day: 1,
  startTs: Date.now() - 1.2 * 60000, speed: 1, phase,
  pattern: 'single pass scan', guess: null, classifiedInTime: true,
  restate: '', sketch: '', dryRun: '', attackOpen: false, attackAutoTried: false,
  cardStartTs: phase === 'card' ? Date.now() : null,
  minutes: phase === 'card' ? 1.2 : null
});

try {
  await ensureServer();

  // ── every route boots clean ──
  await put('session', null);
  let d = dom('/#/');
  ok(d.includes('WAR ROOM') && /Day \d+ ·/.test(d) && clean(d), 'boot: mission control renders, zero JS errors');
  d = dom('/#/cards');
  ok(d.includes('Card vault') && clean(d), 'boot: card vault renders');
  d = dom('/#/wall');
  ok(d.includes('Evidence wall') && d.includes('Evidence card') && clean(d), 'boot: evidence wall + card render');
  d = dom('/#/ladder');
  // parity-agnostic: even days render the CF ladder, odd days the re-solve drill
  ok((d.includes('CF ladder') || d.includes('timed blank re-solves')) && clean(d), 'boot: speed drill renders');
  d = dom('/#/log');
  ok(d.includes('Solve log') && clean(d), 'boot: log renders');
  d = dom('/#/calendar');
  ok(d.includes('THE 20 DAYS') && d.includes('D20') && clean(d), 'boot: §3.9 calendar renders all 20 cells');
  d = dom('/?date=2026-06-12#/calendar?d=2026-06-13');
  ok(d.includes('DAY 2') && d.includes('work-ahead') && clean(d), 'boot: day view renders a future date as work-ahead');
  d = dom('/#/forge');
  ok(d.includes('THE FORGE') && clean(d), 'boot: §11 forge renders (empty → no bosses standing)');

  // ── §3.4: the 23:00 nag, visible and annoying ──
  d = dom('/?clock=23:05#/');
  ok(d.includes('HARD STOP') && d.includes('sleepnag') && clean(d), 'nag: present past 23:00');
  d = dom('/?clock=12:00#/');
  ok(!d.includes('sleepnag') && clean(d), 'nag: absent midday');

  // ── §3.1 solve mode gates (regression suite) ──
  await put('session', solveSession(10.5, 'solve'));
  d = dom('/#/solve');
  ok(d.includes('MINUTE 10 — CHECKPOINT') && d.includes('ANY working approach') && clean(d),
    'solve: minute-10 gate fires with the R2 question (brute counts)');
  await put('session', { ...solveSession(21, 'solve', true), cueShown: false });
  d = dom('/#/solve');
  ok(d.includes('brute banked — hunt optimal') && !/id="optcue"\s+hidden/.test(d) && clean(d),
    'R2: the minute-20 cue shows once an approach is banked — non-gating');
  await put('session', solveSession(15, 'solve', true));
  d = dom('/#/solve');
  ok(/id="optcue"\s+hidden/.test(d), 'R2: no cue before minute 20');
  await put('session', solveSession(35.5, 'solve', true));
  d = dom('/#/solve');
  ok(d.includes('MINUTE 35 — HARD CEILING') && clean(d), 'solve: minute-35 ceiling fires');
  await put('session', solveSession(36, 'reimplement', true));
  d = dom('/#/solve');
  ok(d.includes('RE-IMPLEMENT FROM BLANK') && clean(d), 'solve: re-implement phase renders');
  await put('session', solveSession(36, 'card', true));
  d = dom('/#/solve');
  ok(d.includes('PATTERN CARD — the exit door') && d.includes('ONE LINE') && d.includes('PATTERN — name it') && clean(d),
    'solve: R3 card form = pattern + one observation line, still the exit door');
  ok(d.includes('AI layer') || d.includes('separate AI layer'), 'R3: the form says the AI layer is separate, never merged');
  ok(d.includes('DEPTH — one tap each') && d.includes('final tier reached'),
    'R6: the exit flow carries the two one-tap depth questions');

  // ── the unskippable exit door: the router refuses to leave ──
  d = dom('/#/');
  ok(d.includes('PATTERN CARD — the exit door'), 'law: navigating to mission with a live card still shows the card');
  d = dom('/#/cards');
  ok(d.includes('PATTERN CARD — the exit door') && !d.includes('Card vault'), 'law: card form cannot be skipped via any route');

  // ── §3.2 recognition mode (R4 form) + Wave 4 free navigation ──
  await put('session', recogSession('recognize'));
  d = dom('/#/recognize');
  ok(d.includes('RECOGNITION · TIER B') && d.includes('REVEAL canonical') && d.includes('PATTERN — name it')
    && d.includes('attack plan') && /id="attackzone"\s+hidden/.test(d) && clean(d),
    'recognize: R4 cockpit = name → REVEAL; attack plan offered but collapsed (lean flow intact)');
  // ── Open-Wave: Tier-B attack-plan scaffold (anti-freeze, content-free) ──
  ok(!d.includes('CANONICAL') && !d.includes('class="fpattern"') && !d.includes('class="vline"') && clean(d),
    'attack: cockpit never reveals pattern/trigger/trap before grading (failure mode #2)');
  await put('session', { ...recogSession('recognize'), pattern: '', classifiedInTime: null, startTs: Date.now() - 3 * 60000 });
  let da = dom('/#/recognize');
  ok(!/id="attackzone"\s+hidden/.test(da) && da.includes('RESTATE') && da.includes('SKETCH') && da.includes('DRY-RUN') && clean(da),
    'attack: freeze (past 2:30, empty pattern) auto-surfaces restate/sketch/dry-run');
  ok(da.includes('same prompts every problem') && !da.includes('CANONICAL') && clean(da),
    'attack: scaffold is content-free, still no canonical leak');
  await put('session', { ...recogSession('recognize'), pattern: 'two pointers', startTs: Date.now() - 3 * 60000 });
  da = dom('/#/recognize');
  ok(/id="attackzone"\s+hidden/.test(da) && clean(da),
    'attack: no auto-surface once a pattern is typed (fast path protected)');
  await put('session', recogSession('recognize')); // restore for the nav-pill check
  d = dom('/#/log');
  ok(d.includes('Solve log') && d.includes('timerpill') && clean(d),
    'nav ruling: free navigation mid-rep — the log renders WITH the mini-timer pill');
  await put('session', { ...recogSession('reveal'), guess: 'single pass scan', minutes: 1.2 });
  d = dom('/#/recognize');
  ok(d.includes('REVEAL — grade your recall') && d.includes('NAILED IT') && d.includes('CANONICAL') && clean(d),
    'R4: reveal shows the canonical problems.json card + one-key ✓/~/✗ grades');

  // ── R1 pause: full overlay, problem hidden, clock frozen ──
  await put('session', { ...solveSession(12, 'solve', true), pausedAt: Date.now() - 60000, pausedMs: 0, pauseCount: 1 });
  d = dom('/#/solve');
  ok(d.includes('PAUSED — problem hidden') && !d.includes('Kadane') && clean(d),
    'R1: the pause overlay hides the problem entirely');
  d = dom('/#/log');
  ok(d.includes('timerpill') && d.includes('⏸') && clean(d), 'R1: the pill shows the paused state everywhere');

  // ── §3.7 speed drill view: parity + the Day-1 ladder fallback ──
  await put('session', null);
  d = dom('/?date=2026-06-12#/ladder'); // Day 1: odd, empty log
  ok(d.includes('odd: timed blank re-solves') && d.includes('ladder fill') && clean(d),
    'drill: odd day renders re-solve mode, shortfall filled from the ladder (Day 1 case)');
  ok(d.includes('20 min strict each'), 'drill: 20-minute strict re-solves [ruling]');
  d = dom('/?date=2026-06-13#/ladder'); // Day 2: even
  ok(d.includes('CF ladder (even days)') && d.includes('Strict clock') && clean(d),
    'drill: even day renders the CP-31 ladder + strict clock');
  await jfetch(BASE + '/api/log', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-06-12', day: 1, problem: 'Two Sum', tier: 'A', minutes: 14.5, outcome: 'hint', flag: true, classification: 'hashmap' })
  });
  d = dom('/?date=2026-06-16#/ladder'); // Day 5: odd, one eligible (≥3 days old)
  ok(d.includes('Two Sum') && d.includes('first time:') && d.includes('⚑ flagged') && clean(d),
    'drill: pick card carries the flag badge + original-time delta');

  // ── §3.6 contest module + upsolve injection ──
  d = dom('/?date=2026-06-14#/'); // Day 3: LC Weekly
  ok(d.includes('LC Weekly') && d.includes('LOG CONTEST') && clean(d), 'contest: Day 3 banner offers LOG CONTEST');
  // pin the clock pre-20:00: the biweekly prompt is time-aware (after 20:00 it
  // flips to "did you play tonight's…"), so without ?clock this assertion fails
  // whenever the audit runs past 8 PM local
  d = dom('/?date=2026-06-13&clock=12:00#/'); // Day 2: a Saturday
  ok(d.includes('LC Biweekly possible') && clean(d), 'contest: Saturday carries the biweekly toggle');
  ok(d.includes('CF round tonight?'), 'contest: CF night offer, cap-gated');
  await put('days', { '2026-06-13': { day: 2, cfRound: { name: 'CF Div 3/Div 4', planned: true, ts: Date.now() } } });
  d = dom('/?date=2026-06-13#/');
  ok(d.includes('20:05–22:05') && d.includes('replaces speed drill + review') && clean(d),
    'contest: a CF night replaces Blocks 4–5 in the timeline');
  await put('days', { '2026-06-13': { day: 2, biweekly: { name: 'LC Biweekly', solved: 2, firstUnsolved: 'Q4. Hard Thing', logged: true, ts: Date.now() } } });
  d = dom('/?date=2026-06-14#/');
  ok(d.includes('UPSOLVE') && d.includes('Q4. Hard Thing') && d.includes('LC Biweekly') && clean(d),
    'upsolve: the single morning-after task is pinned on mission control, naming its contest');

  // ── §3.6 upsolve chain owns the router like any session ──
  await put('session', {
    problem: 'Q4. Hard Thing', tier: 'A', date: '2026-06-14', day: 3,
    classification: null, startTs: Date.now(), speed: 1, phase: 'editorial',
    hintTaken: false, gateAnswered: true, debugUntil: null, outcome: 'editorial',
    flag: false, upsolve: true, source: 'LC Biweekly',
    reimplStartTs: null, cardStartTs: null, completedMin: null
  });
  d = dom('/#/solve');
  ok(d.includes('UPSOLVE') && d.includes('EDITORIAL CLOSED') && clean(d), 'upsolve: editorial→close screen renders');
  d = dom('/#/log');
  ok(d.includes('timerpill') && d.includes('EDITORIAL') && clean(d),
    'nav ruling: an active upsolve travels as a pill, not a lock');

  // ── the Coach drawer is reachable from the cockpit ──
  await put('session', solveSession(5, 'solve'));
  d = dom('/#/solve');
  ok(d.includes('COACH') && clean(d), 'coach: cockpit offers the drawer (C)');
  await put('session', null);

  // ── evidence endpoints round-trip ──
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await jfetch(BASE + '/api/evidence', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2000-01-01', png: `data:image/png;base64,${png1x1}` })
  });
  const list = await jfetch(BASE + '/api/evidence').then(r => r.json());
  ok(list.includes('2000-01-01.png'), 'evidence: POST + list round-trip');
  const img = await jfetch(BASE + '/evidence/2000-01-01.png');
  ok(img.ok, 'evidence: static serving');

  // ── §11 slate (last — these append log rows; nothing reads the log after) ──
  await put('session', null);
  const aRow = (p, outcome, flag, alone) => ({ date: '2026-06-12', day: 1, problem: p, tier: 'A', minutes: 14, outcome, flag, classification: 'x', depth_alone: alone, depth_final: 'optimal', depth_top: 'optimal', depth_source: outcome === 'solo' ? 'solo' : 'editorial' });
  for (const r of [aRow('Two Sum', 'editorial', true, null), aRow('Kadane\'s Algorithm - Maximum Subarray', 'solo', false, 'optimal'), aRow('Majority Element (Moore\'s Voting)', 'hint', false, 'brute')])
    await jfetch(BASE + '/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
  d = dom('/?date=2026-06-12&clock=22:30#/');
  ok(d.includes('paceline') && d.includes('B left') && d.includes('to the stop') && clean(d), 'slate#1: pace ribbon shows the burn-down vs the hard stop');
  ok(d.includes('SALVAGE') && d.includes('salvagelist') && clean(d), 'slate#2: late + behind surfaces the salvage panel');
  d = dom('/?date=2026-06-12&clock=14:00#/');
  ok(!d.includes('SALVAGE') && clean(d), 'slate#2: salvage absent mid-afternoon');
  d = dom('/?date=2026-06-12#/forge');
  ok(d.includes('THE FORGE') && d.includes('FIGHT') && d.includes('Two Sum') && clean(d), 'slate#3: a flagged problem stands as a boss with FIGHT');
  d = dom('/?date=2026-06-12#/log');
  ok(d.includes('Readiness — interview-ready') && clean(d), 'slate#4: readiness map renders on the data room');
} finally {
  if (serverProc) serverProc.kill();
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}

console.log(`\nUI LAW AUDIT: ${pass} passed, ${fail} failed` + (fail ? '' : ' — gates, locks and the exit door hold.'));
process.exit(fail ? 1 : 0);
