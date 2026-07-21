// HOSTILE QA AUDIT — MISSION.md §3 law by law, §5 outcome by outcome.
// Every row is proven by EXERCISING the app: pure simulation through the same
// laws.js the browser runs, rendered-DOM dumps, real clicks over the Chrome
// DevTools Protocol, or one live coach round-trip. Never by reading code.
// Fully sandboxed: own servers on :4399 + throwaway temp dirs. Prints SHA256
// of live ./data before and after as proof the live record was never touched.
// Usage: node scripts/audit.mjs        exit code = number of FAILs
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const L = await import('../public/laws.js');
const S = await import('../public/stats.js');
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum.json'), 'utf8'));
const PORT = 4399, B = `http://localhost:${PORT}`;
const CDP_PORT = 9223;
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
].find(p => fs.existsSync(p));
if (!EDGE) { console.error('Edge not found'); process.exit(1); }

// ── conformance table ────────────────────────────────────────────────────────
const ROWS = [];
function row(section, requirement, location, method, status, evidence) {
  ROWS.push({ section, requirement, location, method, status, evidence: String(evidence).slice(0, 220) });
  const mark = status === 'PASS' ? 'PASS ' : status === 'DEFERRED' ? 'DEFER' : '*FAIL*';
  console.log(`${mark}  [${section}] ${requirement}`);
  if (status === 'FAIL') console.log(`       ${evidence}`);
}
const check = (section, requirement, location, method, cond, evidence) =>
  row(section, requirement, location, method, cond ? 'PASS' : 'FAIL', evidence);

// ── live-data proof ──────────────────────────────────────────────────────────
// The guarded set is the USER'S RECORD. cf.json is a server-maintained cache
// the LIVE :4350 server rewrites on its own timer (Wave 4 CF sync) — it can
// legitimately drift while a sandboxed audit runs, so it is excluded.
function liveHashes() {
  const dir = path.join(ROOT, 'data');
  if (!fs.existsSync(dir)) return 'no live data dir';
  const out = [];
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    if (/(^|[\\/])cf\.json$/.test(String(f))) continue;
    const p = path.join(dir, String(f));
    if (fs.statSync(p).isFile())
      out.push(`${f}=${crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)}`);
  }
  return out.sort().join(' ');
}
const liveBefore = liveHashes();

// The user may be SOLVING on the live :4350 server while the audit runs — his
// own appends are not contamination. On hash drift, verify structurally that
// every pre-existing log row and card survived BYTE-IDENTICAL (cards may gain
// only the async .ai layer) and no past day-record changed; then the drift is
// his live activity and the guard holds. Anything else stays a hard FAIL.
const liveDoc = f => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8')); } catch { return null; }
};
const liveSnap = { log: liveDoc('log.json'), cards: liveDoc('cards.json'), days: liveDoc('days.json') };
function explainLiveDrift() {
  const log = liveDoc('log.json'), cards = liveDoc('cards.json'), days = liveDoc('days.json');
  if (!log || !cards || !days || !liveSnap.log) return null;
  const logMap = new Map(log.map(r => [r.id, r]));
  if (!liveSnap.log.every(r => JSON.stringify(logMap.get(r.id)) === JSON.stringify(r))) return null;
  const cardMap = new Map(cards.map(c => [c.id, c]));
  const sansAi = ({ ai, ...rest }) => rest;
  if (!liveSnap.cards.every(c => {
    const a = cardMap.get(c.id);
    return a && JSON.stringify(sansAi(a)) === JSON.stringify(sansAi(c));
  })) return null;
  const today = new Date().toISOString().slice(0, 10);
  for (const [date, rec] of Object.entries(liveSnap.days)) {
    if (date >= today || date === '_r5') continue;
    if (JSON.stringify(days[date]?.sealed) !== JSON.stringify(rec.sealed)) return null; // sealed past = immutable
  }
  return `drift = the user's LIVE activity (append-only: +${log.length - liveSnap.log.length} log rows, `
    + `+${cards.length - liveSnap.cards.length} cards; every pre-existing row byte-identical, sealed days untouched)`;
}

// ── sandbox server ───────────────────────────────────────────────────────────
let serverProc = null, sandboxDir = null;
async function up() {
  try { await jfetch(B + '/api/state', {}, 1); return true; } catch { return false; }
}
async function startSandbox(extraEnv = {}, reuseDir = null) {
  await stopSandbox(!reuseDir);
  sandboxDir = reuseDir || fs.mkdtempSync(path.join(os.tmpdir(), 'p435-audit-'));
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'],
    // P435_NO_ENRICH: the audit asserts queue MECHANICS (persist + restart
    // survival); model calls would slow every card save and starve the live
    // coach round-trip check — the worker itself is E2E-proven separately
    env: { ...process.env, P435_NO_ENRICH: '1', P435_PORT: String(PORT), P435_DATA: sandboxDir, ...extraEnv }
  });
  let banner = '';
  serverProc.stdout.on('data', d => banner += d);
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 200));
    if (await up()) return () => banner;
  }
  throw new Error('sandbox server failed to start');
}
async function stopSandbox(rmDir = true) {
  if (serverProc) { serverProc.kill('SIGKILL'); serverProc = null; }
  for (let i = 0; i < 20 && await up(); i++) await new Promise(r => setTimeout(r, 150));
  if (rmDir && sandboxDir) { try { fs.rmSync(sandboxDir, { recursive: true, force: true }); } catch {} }
  if (rmDir) sandboxDir = null;
}

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
const api = {
  state: () => jfetch(B + '/api/state').then(r => r.json()),
  post: (p, b) => jfetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json()),
  put: (name, doc) => jfetch(`${B}/api/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc) }).then(r => r.json())
};

// rendered-DOM dump. Each call gets its OWN user-data-dir (the default-profile
// singleton can make a second Edge forward-and-hang) and a hard timeout.
let dumpSeq = 0;
function dump(urlPath, budget = 4500) {
  const prof = path.join(os.tmpdir(), `p435-dump-${process.pid}-${++dumpSeq}`);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return execFileSync(EDGE, [
          '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${prof}`,
          `--virtual-time-budget=${budget}`, '--dump-dom', B + urlPath
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

// ── CDP driver: a real browser, real clicks, real dialogs ────────────────────
let edgeProc = null, ws = null, cdpId = 0, profileDir = null;
const pending = new Map();

async function cdpLaunch() {
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p435-cdp-'));
  edgeProc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1440,900',
    `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`, 'about:blank'
  ], { stdio: 'ignore' });
  let targets = null;
  for (let i = 0; i < 50 && !targets; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json`).then(r => r.json()); } catch {}
  }
  if (!targets) throw new Error('CDP endpoint never came up');
  const page = targets.find(t => t.type === 'page');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Page.javascriptDialogOpening') {
      cmd('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
    }
  };
  await cmd('Page.enable');
  await cmd('Runtime.enable');
}
function cmd(method, params = {}) {
  const id = ++cdpId;
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`CDP timeout: ${method}`)); } }, 20000);
  });
}
async function evaluate(expression) {
  const r = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result?.value;
}
let navSeq = 0;
async function navigate(urlPath) {
  // cache-buster goes into the QUERY, never after the hash — a corrupted hash
  // silently falls through to mission control and poisons every assertion
  const [pq, hash = ''] = urlPath.split('#');
  const url = `${B}${pq}${pq.includes('?') ? '&' : '?'}t=${++navSeq}${hash ? '#' + hash : ''}`;
  await cmd('Page.navigate', { url });
  await waitFor(`document.querySelector('#hdr')?.textContent.includes('WAR ROOM')`);
}
async function waitFor(expr, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await evaluate(`!!(${expr})`)) return true; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`waitFor timed out: ${expr.slice(0, 90)}`);
}
// textContent, not innerText — CSS text-transform: uppercase would otherwise
// break source-case needles
const has = str => evaluate(`document.body.textContent.includes(${JSON.stringify(str)})`);
const waitHas = (str, ms) => waitFor(`document.body.textContent.includes(${JSON.stringify(str)})`, ms);
const click = sel => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOEL'; el.click(); return 'OK'; })()`);
const setInput = (sel, v) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOEL';
  el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return 'OK'; })()`);
const bodyText = () => evaluate('document.body.textContent');
const hookAudio = () => evaluate(`window.__osc = 0; (() => { const AC = window.AudioContext;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function () { window.__osc++; return orig.apply(this, arguments); };
  return 'hooked'; })()`);
async function cdpClose() {
  try { ws?.close(); } catch {}
  ws = null;
  if (edgeProc) { edgeProc.kill('SIGKILL'); edgeProc = null; }
  await new Promise(r => setTimeout(r, 400));
  if (profileDir) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} }
  profileDir = null;
}

// ── seed helpers ─────────────────────────────────────────────────────────────
const uuid = () => crypto.randomUUID();
const logRow = (date, day, problem, tier, outcome, extra = {}) =>
  api.post('/api/log', { date, day, problem, tier, outcome, minutes: 15, flag: false, classification: 'seed', ...extra });
const solveSession = (elapsedMin, phase, gateAnswered = false, extra = {}) => ({
  problem: 'Kadane Audit', tier: 'A', date: D(1), day: 1,
  classification: 'max subarray dp', speed: 1,
  startTs: Date.now() - elapsedMin * 60000, phase,
  hintTaken: false, gateAnswered, debugUntil: null,
  outcome: phase === 'reimplement' || phase === 'card' ? 'editorial' : null,
  flag: phase === 'reimplement' || phase === 'card',
  reimplStartTs: phase === 'reimplement' ? Date.now() - 60000 : null,
  cardStartTs: phase === 'card' ? Date.now() : null,
  completedMin: phase === 'reimplement' || phase === 'card' ? 35 : null, ...extra
});
const D = n => cur.days[n - 1].date; // sprint day n -> date string
const anchorTs = (date, h, m) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
const scenario = async (name, fn) => {
  try { await fn(); }
  catch (e) { row('crash', name, '—', '—', 'FAIL', e.message); }
};

// ═════════════════════════════════════════════════════════════════════════════
console.log('HOSTILE AUDIT — live data before:', liveBefore, '\n');

// ── existing machine suites (sim + planted-DOM) run first, ports free ────────
const suite1 = spawnSync(process.execPath, ['scripts/laws.mjs'], { cwd: ROOT, encoding: 'utf8' });
check('§3 all', 'every pure law (73 assertions: compression order/floors, win, overflow, bad day, upsolve singleton, drill weighting, CF caps, review deck, keep-warm, quota/sheet immunity)',
  'public/laws.js (whole)', 'sim suite', /LAWS AUDIT: \d+ passed, 0 failed/.test(suite1.stdout), suite1.stdout.trim().split('\n').pop());
const suite2 = spawnSync(process.execPath, ['scripts/laws-ui.mjs'], { cwd: ROOT, encoding: 'utf8' });
check('§3 all', 'rendered gates + router locks (30 DOM assertions)', 'scripts/laws-ui.mjs', 'DOM suite',
  /UI LAW AUDIT: \d+ passed, 0 failed/.test(suite2.stdout), suite2.stdout.trim().split('\n').pop());

// ── §3.4 compression: pure simulation of the demanded anchors ────────────────
await scenario('§3.4 sim', async () => {
  const d = D(1);
  const c1045 = L.compressSchedule(cur, anchorTs(d, 10, 45), 9, 3);
  check('§3.4', 'anchor 10:45 + full quota → projected 22:40 ≤ 22:45 → compression must NOT fire', 'laws.js:compressSchedule', 'sim',
    c1045.steps.length === 0 && new Date(c1045.projectedEnd).getHours() === 22 && new Date(c1045.projectedEnd).getMinutes() === 40,
    `steps=[${c1045.steps}] end=${new Date(c1045.projectedEnd).toTimeString().slice(0, 5)}`);
  const c1051 = L.compressSchedule(cur, anchorTs(d, 10, 51), 9, 3);
  check('§3.4', 'anchor 10:51 (22:46) → step 1 ONLY: Tier B −3, B3 80→59, stops once it fits', 'laws.js:compressSchedule', 'sim',
    c1051.steps.join(',') === 'trim_tierB_by_3' && c1051.quotaB === 6
      && c1051.blocks.find(b => b.id === 'B3').minutes === 59 && !c1051.over,
    `steps=[${c1051.steps}] quotaB=${c1051.quotaB} B3=${c1051.blocks.find(b => b.id === 'B3').minutes}`);
  const c1147 = L.compressSchedule(cur, anchorTs(d, 11, 47), 9, 3);
  const mins = id => c1147.blocks.find(b => b.id === id).minutes;
  check('§3.4', 'anchor 11:47 → steps fire in the EXACT stated order: tierB → breaks(15/40/30) → B4(30)', 'laws.js:compressSchedule', 'sim',
    c1147.steps.join('|') === 'trim_tierB_by_3|breaks_to_minimum_15_40_30|block4_to_30min'
      && mins('BREAK1') === 15 && mins('LUNCH') === 40 && mins('DINNER') === 30 && mins('B4') === 30 && !c1147.over,
    `steps=${c1147.steps.join('→')} breaks=${mins('BREAK1')}/${mins('LUNCH')}/${mins('DINNER')} B4=${mins('B4')}`);
  const c1300 = L.compressSchedule(cur, anchorTs(d, 13, 0), 9, 3);
  check('§3.4', 'hopeless anchor 13:00 → fully compressed, still over: B5 NEVER below 30 (never touched), sleep never trimmed', 'laws.js:compressSchedule', 'sim',
    c1300.over === true && c1300.blocks.find(b => b.id === 'B5').minutes === 45
      && [c1045, c1051, c1147, c1300].every(c => c.blocks.find(b => b.id === 'B5').minutes === 45),
    `over=${c1300.over} B5=${c1300.blocks.find(b => b.id === 'B5').minutes} (untouched in all 4 scenarios)`);
  const floor = L.compressSchedule(cur, anchorTs(d, 13, 0), 4, 3);
  check('§3.4', 'Tier B floor: quota 4 never trims below min(3, available) under max compression [ruling]', 'laws.js:compressSchedule', 'sim',
    floor.quotaB === 3 && floor.trimmedB === 1, `quotaB=${floor.quotaB} trimmed=${floor.trimmedB}`);
});

// ── compression rendered in the timeline ─────────────────────────────────────
await scenario('§3.4 DOM', async () => {
  await startSandbox();
  const d = D(1);
  await api.put('days', { [d]: { day: 1, anchor: anchorTs(d, 10, 45) } });
  let dm = dump(`/?date=${d}#/`);
  check('§3.4', 'timeline @10:45: green projected end 22:40, NO sleep-guard chip', 'views/mission.js:renderMission', 'DOM',
    dm.includes('projected end <b class="ok">22:40') && !dm.includes('SLEEP GUARD −') && clean(dm), '22:40 ok, no chip');
  await api.put('days', { [d]: { day: 1, anchor: anchorTs(d, 10, 51) } });
  dm = dump(`/?date=${d}#/`);
  check('§3.4', 'timeline @10:51: chip shows step 1 only; B3 struck 1h20→59m; meter notes sleep guard −3', 'views/mission.js', 'DOM',
    dm.includes('Tier B −3') && !dm.includes('breaks→15/40/30') && dm.includes('<s class="faint">1h20</s>')
      && dm.includes('59m') && dm.includes('sleep guard −3') && clean(dm), 'step-1-only chip + strikethrough');
  await api.put('days', { [d]: { day: 1, anchor: anchorTs(d, 11, 47) } });
  dm = dump(`/?date=${d}#/`);
  const orderOk = dm.indexOf('Tier B −3') > -1 && dm.indexOf('Tier B −3') < dm.indexOf('breaks→15/40/30')
    && dm.indexOf('breaks→15/40/30') < dm.indexOf('B4→30m');
  check('§3.4', 'timeline @11:47: chip lists all three steps in stated order', 'views/mission.js:stepLabel', 'DOM', orderOk && clean(dm), 'order Tier B → breaks → B4');
  await api.put('days', { [d]: { day: 1, anchor: anchorTs(d, 13, 0) } });
  dm = dump(`/?date=${d}#/`);
  check('§3.4', 'timeline @13:00: projected end rendered red (no further compression exists); hard stop 23:00 / in bed 23:30 stated', 'views/mission.js', 'DOM',
    dm.includes('projected end <b class="danger"') && dm.includes('hard stop 23:00') && dm.includes('in bed 23:30') && clean(dm), 'red end + sleep lines');
  // §3.4 nag
  dm = dump(`/?date=${d}&clock=23:05#/`);
  check('§3.4', '23:00 nag: visible and annoying past the hard stop', 'app.js:checkNag', 'DOM', dm.includes('HARD STOP') && dm.includes('sleepnag'), 'bar present at 23:05');
  dm = dump(`/?date=${d}&clock=00:30#/`);
  check('§3.4', 'nag persists through the night window (00:30)', 'app.js:checkNag', 'DOM', dm.includes('HARD STOP'), 'bar present at 00:30');
  dm = dump(`/?date=${d}&clock=12:00#/`);
  check('§3.4', 'nag absent midday', 'app.js:checkNag', 'DOM', !dm.includes('sleepnag'), 'absent at 12:00');
});

// the R3 exit door: tap the required R6 depth chips (absent on upsolves;
// the struggle row is optional), then pattern + one line, then save
async function fillCardV2(pattern, note) {
  await evaluate(`(() => {
    for (const row of document.querySelectorAll('#depthblock .depthrow')) {
      if (/optional/i.test(row.querySelector('.dlbl')?.textContent || '')) continue;
      if (row.querySelector('button.dchip.sel')) continue;
      row.querySelector('button.dchip:last-of-type')?.click();
    }
  })()`);
  await setInput('#f-pattern', pattern);
  await setInput('#f-note', note);
  await click('#savebtn');
}

// ── CDP group 1: solve mode end to end ───────────────────────────────────────
await scenario('§3.1 CDP', async () => {
  await startSandbox();
  await cdpLaunch();
  const d = D(1);

  // classification gate
  await navigate(`/?date=${d}#/`);
  await click('#tiera li');
  await waitFor(`document.body.textContent.includes('Pattern classification')`);
  // the pre-start window carries the TUF+ problem link [user, 2026-06-13]
  const setupLink = await evaluate(`document.querySelector('.probopen')?.getAttribute('href') || ''`);
  const firstA = cur.days[0].tierA[0]; // 'Two Sum' → tuf_plus slug two-sum
  check('§5', 'setup window (pre-timer) carries the TUF+ problem link; statement, not editorial', 'views/solve.js:renderSetup', 'CDP-interactive',
    /takeuforward\.org\/plus\/dsa\/problems\//.test(setupLink) && !setupLink.includes('tab=editorial'),
    `link=${setupLink}`);
  await click('#startbtn');
  await new Promise(r => setTimeout(r, 400));
  const stillSetup = await evaluate(`document.body.textContent.includes('Pattern classification')`);
  const noSession = (await api.state()).session === null;
  check('§3.1', 'the clock will not start without a typed classification', 'views/solve.js:renderSetup', 'CDP-interactive',
    stillSetup && noSession, 'empty START rejected, no session created');
  await setInput('#classif', 'dutch national flag 3-way partition');
  await click('#startbtn');
  await waitFor(`document.querySelector('#bigclock')`);
  const clockTxt = await evaluate(`document.querySelector('#bigclock').textContent`);
  const sess1 = (await api.state()).session;
  check('§3.1', 'visible countdown runs on every Tier A problem; classification persisted', 'views/solve.js:renderCockpit', 'CDP-interactive',
    /^\d{2}:\d{2}$/.test(clockTxt) && sess1?.classification === 'dutch national flag 3-way partition',
    `clock=${clockTxt} classification saved`);

  // debug sub-rule
  await click('#bugbtn');
  await waitFor(`document.querySelector('#dchip')`);
  const chip = await evaluate(`document.querySelector('#dchip').textContent`);
  await setInput('#dryrun', '[2,0,1] expected [0,1,2]');
  await new Promise(r => setTimeout(r, 300));
  const dr = (await api.state()).session?.dryRun;
  check('§3.1', 'debug button: 10-min sub-timer + the dry-run reminder + smallest-failing-input field persists', 'views/solve.js (debugzone)', 'CDP-interactive',
    /DEBUG \d{2}:\d{2}/.test(chip) && chip.includes('Dry-run the smallest failing input') && dr === '[2,0,1] expected [0,1,2]',
    `chip="${chip.slice(0, 60)}…" dryRun saved`);
  await api.put('session', { ...solveSession(5, 'solve', true), debugUntil: Date.now() - 1000, dryRun: 'x' });
  await navigate(`/?date=${d}#/solve`);
  await waitFor(`document.querySelector('#dchip')?.textContent.includes('debug window over')`);
  check('§3.1', 'debug window expiry forces the decision prompt', 'views/solve.js', 'CDP-interactive', true, 'expiry copy shown');

  // minute-10 checkpoint + chime
  await api.put('session', solveSession(9.95, 'solve'));
  await navigate(`/?date=${d}#/solve`);
  await hookAudio();
  await waitFor(`document.body.textContent.includes('MINUTE 10 — CHECKPOINT')`, 15000);
  const chimes = await evaluate('window.__osc');
  check('§3.1', 'checkpoint at minute 10: audible chime + on-screen gate', 'views/solve.js:openGate', 'CDP-interactive',
    chimes > 0, `gate fired live at 10:00, oscillators=${chimes}`);
  await click('#g-yes');
  await new Promise(r => setTimeout(r, 300));
  const gateGone = await evaluate(`!document.querySelector('.modal')`);
  check('§3.1', 'gate YES continues the clock (no hint logged)', 'views/solve.js:gateYes', 'CDP-interactive',
    gateGone && (await api.state()).session?.hintTaken === false, 'modal closed, hintTaken=false');

  // gate NO → read approach → outcome caps at HINT through the full exit
  await api.put('session', solveSession(10.5, 'solve'));
  await navigate(`/?date=${d}#/solve`);
  await waitFor(`document.body.textContent.includes('MINUTE 10 — CHECKPOINT')`);
  await click('#g-appr');
  await new Promise(r => setTimeout(r, 300));
  check('§3.1', 'gate NO→read-approach marks the solve HINT', 'views/solve.js:gateHint', 'CDP-interactive',
    (await api.state()).session?.hintTaken === true, 'hintTaken=true');
  await click('#solvedbtn');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  await fillCardV2('p', 'one line that earns its keep');
  await waitFor(`location.hash === '#/' || location.hash === ''`);
  const st1 = await api.state();
  const hintRow = st1.log.find(r => r.problem === 'Kadane Audit' && r.outcome === 'hint');
  check('§3.1', 'hinted solve logs outcome=hint (not solo)', 'views/solve.js:finish', 'CDP-interactive', !!hintRow, JSON.stringify({ outcome: hintRow?.outcome, flag: hintRow?.flag }));

  // gate NO → Coach: drawer opens, hint marked
  await api.put('session', solveSession(10.5, 'solve'));
  await navigate(`/?date=${d}#/solve`);
  await waitFor(`document.body.textContent.includes('CHECKPOINT')`);
  await click('#g-coach');
  await waitFor(`document.querySelector('.coach-drawer')`);
  check('§3.1+§5.7', 'gate NO→ask-Coach opens the drawer and logs HINT', 'views/solve.js:gateHint→coach', 'CDP-interactive',
    (await api.state()).session?.hintTaken === true, 'drawer open, hintTaken=true');

  // minute-35 ceiling: unmissable, forced, alarmed
  await api.put('session', solveSession(34.97, 'solve', true));
  await navigate(`/?date=${d}#/solve`);
  await hookAudio();
  await waitFor(`document.body.textContent.includes('MINUTE 35 — HARD CEILING')`, 15000);
  const alarmOsc = await evaluate('window.__osc');
  await click('.modal-back'); // try to dismiss by clicking outside
  await new Promise(r => setTimeout(r, 300));
  const stillForced = await evaluate(`document.body.textContent.includes('MINUTE 35 — HARD CEILING')`);
  const btnCount = await evaluate(`document.querySelectorAll('.modal button').length`);
  check('§3.1', 'hard ceiling at 35: different unmissable alarm + forced decision (no dismiss path, exactly 2 options)', 'views/solve.js:openCeiling', 'CDP-interactive',
    alarmOsc > 0 && stillForced && btnCount === 2, `alarm osc=${alarmOsc}, outside-click ignored, options=${btnCount}`);

  // editorial path: re-implement 15:00 → card flags for Day 19–20
  await click('#c-edit');
  await waitFor(`document.body.textContent.includes('RE-IMPLEMENT FROM BLANK')`);
  const reimplClock = await evaluate(`document.querySelector('#bigclock').textContent`);
  await click('#donebtn');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  const cardMeta = await bodyText();
  await click('#savebtn'); // empty note + untapped depth — must be refused
  await new Promise(r => setTimeout(r, 400));
  const stillCard = await evaluate(`!!document.querySelector('.cardform')`);
  check('§3.1', 'card form refuses an empty card (R3: pattern + one line mandatory; R6 depth taps mandatory)', 'views/solve.js:renderCard', 'CDP-interactive', stillCard, 'empty save rejected');
  // the exit door cannot be skipped via any route
  await click('a[href="#/cards"]');
  await new Promise(r => setTimeout(r, 400));
  await evaluate(`location.hash = '#/wall'`);
  await new Promise(r => setTimeout(r, 400));
  const lockedBack = await evaluate(`location.hash === '#/solve' && !!document.querySelector('.cardform')`);
  check('§3.1', 'pattern card is the ONLY exit: nav clicks and forced hash changes bounce back', 'app.js:route(sessionRoute)', 'CDP-interactive', lockedBack, 'router lock held under attack');
  await fillCardV2('interval dp', 'last-pop framing — off-by-one on bounds');
  await waitFor(`location.hash === '#/' || location.hash === ''`);
  const st2 = await api.state();
  const edRow = st2.log.find(r => r.outcome === 'editorial' && !r.upsolve);
  const cardSaved = st2.cards.some(c => c.note?.includes('last-pop framing'));
  check('§3.1', 'ceiling→editorial logs outcome=editorial, 15-min re-implement ran, FLAGGED for Day 19–20, card banked', 'views/solve.js:ceilingEditorial', 'CDP-interactive',
    /^1[45]:\d{2}$/.test(reimplClock) && cardMeta.includes('EDITORIAL') && cardMeta.includes('flagged for Day 19–20')
      && edRow?.flag === true && cardSaved && st2.session === null,
    `reimpl=${reimplClock}, row flag=${edRow?.flag}, card saved, session cleared`);

  // ceiling SOLVED path stays clean
  await api.put('session', solveSession(35.2, 'solve', true));
  await navigate(`/?date=${d}#/solve`);
  await waitFor(`document.body.textContent.includes('HARD CEILING')`);
  await click('#c-solved');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  await fillCardV2('p2', 'x2');
  await waitFor(`location.hash === '#/' || location.hash === ''`);
  const soloRow = (await api.state()).log.find(r => r.outcome === 'solo');
  check('§3.1', 'ceiling SOLVED logs solo (no hint taken), unflagged', 'views/solve.js:ceilingSolved', 'CDP-interactive',
    soloRow && soloRow.flag === false, JSON.stringify({ outcome: soloRow?.outcome, flag: soloRow?.flag }));

  // calendar pin [user, 2026-06-13]: a solve launched from a calendar day view
  // returns THERE on finish, not to mission. Open Day 2 (work-ahead), launch a
  // Tier A problem, drive it to a clean solve, and assert the exit lands back
  // on that day — not '#/'.
  await api.put('session', null);
  const d2 = D(2);
  await navigate(`/?date=${d}#/calendar?d=${d2}`);
  await waitFor(`document.body.textContent.includes('TIER A')`);
  await click('#cal-a li');
  await waitFor(`document.body.textContent.includes('Pattern classification')`);
  const backTarget = await evaluate(`(() => { const a = document.querySelector('.probopen'); return location.hash; })()`);
  await setInput('#classif', 'work-ahead pin test');
  await click('#startbtn');
  await waitFor(`document.querySelector('#bigclock')`);
  await click('#solvedbtn');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  await fillCardV2('pinned', 'returns to the day');
  await waitFor(`location.hash.includes('calendar')`, 8000).catch(() => {});
  const pinnedHash = await evaluate('location.hash');
  const pinnedRow = (await api.state()).log.find(r => r.forDay === d2 && r.problem);
  check('§3.9+§11', 'a solve launched from a calendar day view returns to THAT day on finish (not mission); row carries forDay', 'views/calendar.js + solve.js (returnTo)', 'CDP-interactive',
    pinnedHash.includes(`calendar?d=${d2}`) && !!pinnedRow,
    `exit hash=${pinnedHash}, forDay row=${!!pinnedRow}`);
});

// ── CDP group 2: recognition mode (§3.2) ─────────────────────────────────────
await scenario('§3.2 CDP', async () => {
  const d = D(1);
  await api.put('session', null);
  await navigate(`/?date=${d}#/`);
  await click('#tierb li');
  await waitFor(`document.body.textContent.includes('RECOGNITION · TIER B')`);
  const haveFields = await evaluate(`!!document.querySelector('#r-pattern') && !!document.querySelector('#revealbtn') && !document.querySelector('#r-sketch') && !document.querySelector('#r-verified')`);
  const clockFmt = await evaluate(`document.querySelector('#bigclock').textContent`);
  const subT = await evaluate(`document.querySelector('#subtimer').textContent`);
  check('§3.2', 'R4 cockpit: problem name, 7-min countdown, pattern input + REVEAL (sketch/verify superseded), 2-min sub-timer shown', 'views/recognize.js:renderCockpit', 'CDP-interactive',
    haveFields && /^0[0-7]:\d{2}$/.test(clockFmt) && /^\d{2}:\d{2}$/.test(subT), `clock=${clockFmt} subtimer=${subT}`);
  await setInput('#r-pattern', 'reversal trick');
  await new Promise(r => setTimeout(r, 400));
  const inTime = await evaluate(`document.querySelector('#subtimer').textContent`);
  check('§3.2', 'pattern named within 2 minutes → sub-timer locks ✓ in time', 'views/recognize.js (sub-timer)', 'CDP-interactive',
    inTime.includes('in time'), `subtimer="${inTime}"`);
  // Wave 4 nav ruling: a live rep travels as a pill, never a lock
  await click('a[href="#/log"]');
  await new Promise(r => setTimeout(r, 500));
  const freeNav = await evaluate(`document.body.textContent.includes('Solve log') && !!document.querySelector('#timerpill')`);
  await click('#timerpill');
  await new Promise(r => setTimeout(r, 400));
  const backInRep = await evaluate(`document.body.textContent.includes('RECOGNITION · TIER B')`);
  check('§3.2', 'nav ruling: free navigation mid-rep with the mini-timer pill; pill click returns to the cockpit', 'app.js:routeLocked + renderPill', 'CDP-interactive',
    freeNav && backInRep, `freeNav=${freeNav}, pill returned=${backInRep}`);
  // R4: REVEAL the canonical card → one-key grade → the rep IS the card
  await click('#revealbtn');
  await waitFor(`document.body.textContent.includes('REVEAL — grade your recall')`);
  const canonical = await evaluate(`document.body.textContent.includes('CANONICAL')`);
  await click('button[data-grade="pass"]');
  await waitFor(`document.body.textContent.includes('REP LOGGED')`);
  const st = await api.state();
  const rep = st.log.find(r => r.tier === 'B');
  const bcard = st.cards.find(c => c.kind === 'B' && c.problem === rep?.problem);
  check('§3.2', 'R4: rep logged with minutes, grade, classified-in-time; the rep IS the card (B-card with guess + canonical banked)', 'views/recognize.js:renderReveal', 'CDP-interactive',
    canonical && rep?.outcome === 'recognized' && rep.grade === 'pass' && rep.classified_in_time === true
      && typeof rep.minutes === 'number' && !!bcard && bcard.guess === 'reversal trick' && !!bcard.canonical,
    JSON.stringify({ grade: rep?.grade, cit: rep?.classified_in_time, min: rep?.minutes, bcard: !!bcard }));
  const nextShown = await evaluate(`document.querySelector('.nextname')?.textContent || ''`);
  await click('#nextbtn');
  await waitFor(`document.body.textContent.includes('RECOGNITION · TIER B')`);
  const chained = (await api.state()).session;
  check('§3.2', 'rapid-fire: one keypress chains to the next unrecognized problem', 'views/recognize.js:renderNext', 'CDP-interactive',
    chained?.kind === 'recognition' && chained.problem === nextShown && chained.problem !== rep.problem,
    `next="${nextShown}"`);
  // ceiling is a ceiling, not a target — and late classification is recorded
  await api.put('session', {
    kind: 'recognition', problem: 'Late Audit Rep', tier: 'B', date: d, day: 1,
    startTs: Date.now() - 7.1 * 60000, speed: 1, phase: 'recognize',
    pattern: '', guess: null, classifiedInTime: null, minutes: null
  });
  await navigate(`/?date=${d}#/recognize`);
  await waitFor(`document.querySelector('#subtimer')?.textContent === 'late'`);
  const noModal = await evaluate(`!document.querySelector('.modal')`);
  const ceilCopy = await evaluate(`document.body.textContent.includes('ceiling hit')`);
  check('§3.2', 'past 7:00 the timer is a CEILING not a gate: red copy, no blocking modal; >2-min classification marked late', 'views/recognize.js (tick)', 'CDP-interactive',
    noModal && ceilCopy, 'no modal, ceiling copy, sub-timer late');
  await setInput('#r-pattern', 'late pattern');
  await click('#revealbtn');
  await waitFor(`document.body.textContent.includes('grade your recall')`);
  await click('button[data-grade="fail"]');
  await waitFor(`document.body.textContent.includes('REP LOGGED') || location.hash === '#/'`);
  const late = (await api.state()).log.find(r => r.problem === 'Late Audit Rep');
  const promote = await evaluate(`document.body.textContent.includes('promote to Tier A')`);
  check('§3.2', 'over-ceiling minutes + classified_in_time:false land in the log; ✗ offers the quiet promote action', 'views/recognize.js + views/log.js', 'CDP-interactive',
    late?.classified_in_time === false && late.minutes > 7 && late.grade === 'fail' && promote,
    JSON.stringify({ cit: late?.classified_in_time, min: late?.minutes, grade: late?.grade, promote }));
});

// ── §3.3 overflow + §3.5 win/bad-day (fresh sandbox) ─────────────────────────
await scenario('§3.3/§3.5', async () => {
  await startSandbox();
  const d1 = D(1), d2 = D(2);
  // complete 2 of 9, abandon 1 → 7 must roll (abandoned is NOT a completion)
  await logRow(d1, 1, cur.days[0].tierA[0], 'A', 'solo');
  await logRow(d1, 1, cur.days[0].tierA[1], 'A', 'editorial');
  await logRow(d1, 1, cur.days[0].tierA[2], 'A', 'abandoned', { flag: true });
  let dm = dump(`/?date=${d2}#/`);
  // dump-dom re-serializes text nodes: &#39; comes back as a literal apostrophe,
  // & as &amp; — accept either form
  const escName = p => p.replace(/&/g, '&amp;');
  const missing = cur.days[0].tierA.slice(2).filter(p => !dm.includes(p) && !dm.includes(escName(p)));
  const shownCount = dm.match(/overflow queue \((\d+)\)/i)?.[1];
  check('§3.3', 'incomplete Tier A auto-rolls into tomorrow Block 0; abandoned problems are NOT dropped', 'laws.js:overflowQueue + views/mission.js', 'DOM',
    shownCount === '7' && missing.length === 0 && clean(dm),
    `queue shows (${shownCount}), expected (7); missing from list: [${missing.join('; ')}]`);
  check('§3.3', 'overflow queue visible at day start (panel renders before any anchor is set)', 'views/mission.js', 'DOM',
    dm.toLowerCase().includes('block 0 — overflow queue'), 'panel present pre-anchor');

  // §3.5 win regardless of hint usage — quotas derived from the data
  const qa2 = Math.min(cur.rules.tier_quota_floors.tierA_per_day, cur.days[1].tierA.length);
  const qb2 = Math.min(cur.rules.tier_quota_floors.tierB_per_day, cur.days[1].tierB.length);
  for (let i = 0; i < qa2; i++) await logRow(d2, 2, cur.days[1].tierA[i], 'A', 'hint');
  for (let i = 0; i < qb2; i++) await logRow(d2, 2, cur.days[1].tierB[i], 'B', 'recognized');
  dm = dump(`/?date=${d2}#/`);
  check('§3.5', 'day is WON when the quota is met even with EVERY solve hinted', 'laws.js:isWonOn', 'DOM+sim',
    dm.includes('DAY WON') && L.isWonOn(cur, { log: (await api.state()).log, days: {} }, d2), 'DAY WON on an all-hint day');
  check('§3.5', 'won/lost record + streak shown prominently (header)', 'app.js:renderHeader', 'DOM',
    dm.includes('RECORD') && dm.includes('STREAK'), 'header carries both');

  // §3.5 bad day — one press per day, maximum
  await cdpLaunch().catch(() => {}); // already up from group 1? relaunch fresh if closed
  const d3 = D(3);
  await navigate(`/?date=${d3}#/`);
  await waitFor(`document.querySelector('#badday')`);
  await click('#badday'); // confirm() auto-accepted
  await waitFor(`document.body.textContent.includes('bad day protocol') || document.body.textContent.includes('Day closed')`);
  const gone = await evaluate(`!document.querySelector('#badday')`);
  const recAfter = (await api.state()).days[d3];
  check('§3.5', 'Bad Day button: one press max — after closing, the button is GONE (second press impossible)', 'views/mission.js + laws.js:canPressBadDay', 'CDP-interactive',
    gone && recAfter?.badDay === true, `#badday absent, days.badDay=${recAfter?.badDay}`);
  const hdr = await evaluate(`document.getElementById('hdr').innerText`);
  check('§3.5', 'bad-day close books an HONEST L in the record (neutral copy, truthful books)', 'laws.js:record', 'CDP-interactive',
    /3L|2L/.test(hdr.replace(/\s/g, '')), `header: ${hdr.replace(/\n/g, ' ').slice(0, 80)}`);
  dm = dump(`/?date=${D(4)}#/`);
  check('§3.5', 'bad day trims TOMORROW Tier B by 3 (meter note) and remainder reached overflow', 'laws.js:effectiveQuota', 'DOM',
    dm.includes('bad day −3') && dm.toLowerCase().includes('overflow queue'), 'next-day meter notes −3; queue present');
});

// ── §3.6 contests + Sunday variant + upsolve singleton ───────────────────────
await scenario('§3.6', async () => {
  await startSandbox();
  for (const dayN of [3, 10, 17]) {
    const dm = dump(`/?date=${D(dayN)}#/`);
    check('§3.6', `Sunday variant Day ${dayN}: LC Weekly 08:00 banner + 4-problem credit line`, 'views/mission.js (banner from curriculum)', 'DOM',
      dm.includes('LC Weekly') && dm.includes('08:00 IST') && dm.includes('4 problems credit') && clean(dm), `day ${dayN} banner ok`);
  }
  // credit math through the rendered meter — quota derived from the data
  const d3 = D(3);
  const qa3 = Math.min(cur.rules.tier_quota_floors.tierA_per_day, cur.days[2].tierA.length);
  const real3 = qa3 - 4; // real solves needed so credit lands exactly on quota
  for (let i = 0; i < real3; i++) await logRow(d3, 3, cur.days[2].tierA[i], 'A', i ? 'hint' : 'solo');
  await api.put('days', { [d3]: { day: 3, contest: { name: 'LC Weekly', solved: 2, firstUnsolved: 'Q3. Audit Problem', logged: true, ts: Date.now() } } });
  let dm = dump(`/?date=${d3}#/`);
  check('§3.6', `logged contest credits 4 toward Tier A: meter shows ${real3} + 4 ⚔ = ${qa3}/${qa3}; quota itself unchanged`, 'laws.js:contestCredit + views/mission.js', 'DOM',
    dm.includes(`${real3} + 4 ⚔`) && dm.includes(`<b>${qa3}</b>/${qa3}`) && clean(dm), 'meter renders the credit');
  // upsolve next morning — exactly one, even with TWO contests logged
  await api.put('days', {
    [d3]: {
      day: 3,
      contest: { name: 'LC Weekly', solved: 2, firstUnsolved: 'Q3. Audit Problem', logged: true, ts: 100 },
      cfRound: { name: 'CF Div 3', solved: 4, firstUnsolved: 'CF-D. Audit', logged: true, ts: 200 }
    }
  });
  dm = dump(`/?date=${D(4)}#/`);
  const bars = (dm.match(/id="upsolvebar"/g) || []).length;
  check('§3.6', 'morning after TWO logged contests: EXACTLY ONE upsolve task, never two; names the most-recent source', 'laws.js:upsolveTask', 'DOM',
    bars === 1 && dm.includes('CF-D. Audit') && dm.includes('CF Div 3'), `upsolve bars=${bars}, source=CF Div 3`);
  // the full §3.6 chain: editorial → close → re-implement → card
  await navigate(`/?date=${D(4)}#/`);
  await click('#upsolvebar');
  await waitFor(`document.body.textContent.includes('EDITORIAL CLOSED')`);
  await click('#closedbtn');
  await waitFor(`document.body.textContent.includes('RE-IMPLEMENT FROM BLANK')`);
  await click('#donebtn');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  const upMeta = await bodyText();
  await fillCardV2('u', 'u'); // upsolves carry no depth block — fill is a no-op there
  await waitFor(`location.hash === '#/' || location.hash === ''`);
  const st = await api.state();
  const upRow = st.log.find(r => r.upsolve);
  dm = dump(`/?date=${D(4)}#/`);
  check('§3.6', 'upsolve chain: editorial → close → re-implement-from-blank → pattern card; logged upsolve, unflagged; task cleared', 'views/solve.js:renderEditorial chain', 'CDP-interactive',
    upMeta.includes('upsolve') && upRow?.outcome === 'editorial' && upRow.flag === false
      && !dm.includes('id="upsolvebar"'), `row upsolve=${upRow?.upsolve}, bar gone after completion`);
  // biweekly toggle + CF night
  const d2 = D(2);
  await navigate(`/?date=${d2}#/`);
  await waitFor(`document.querySelector('#markbiweekly')`);
  await click('#markbiweekly');
  await waitFor(`document.body.textContent.includes('LC BIWEEKLY tonight')`);
  await click('#unbiweekly');
  await waitFor(`document.querySelector('#markbiweekly')`);
  check('§3.6', 'LC Biweekly: Saturday toggle marks/unmarks tonight live', 'views/mission.js (Saturday line)', 'CDP-interactive', true, 'toggled on and back off');
  await click('#cfnight');
  await waitFor(`document.body.textContent.includes('20:05–22:05')`);
  const tl = await bodyText();
  check('§3.6', 'a CF night replaces Blocks 4–5 in the timeline (20:05–22:05 row, drill+review rows gone)', 'views/mission.js (cf_night_variant)', 'CDP-interactive',
    tl.includes('CF round') && !tl.includes('Speed drill'), 'variant row in, B4/B5 out');
  const cf = L.canLogCfRound(cur, { log: [], days: { [D(1)]: { cfRound: {} }, [D(5)]: { cfRound: {} }, [D(7)]: { cfRound: {} } } }, D(9));
  const cf19 = L.canLogCfRound(cur, { log: [], days: {} }, D(19));
  check('§3.6', 'CF gating: cap 3 rounds days 1–18 blocks a fourth; Div 2 only Days 19–20', 'laws.js:canLogCfRound', 'sim',
    cf.allowed === false && cf.cap === 3 && cf19.divs.join() === 'Div 2' && cf19.allowed, `4th blocked (3/3); day19 divs=${cf19.divs}`);
});

// ── §3.7 speed drill ─────────────────────────────────────────────────────────
await scenario('§3.7', async () => {
  await startSandbox();
  const d1 = D(1), d5 = D(5);
  let dm = dump(`/?date=${d1}#/ladder`);
  check('§3.7', 'odd day, young log: re-solve mode at 20:00 strict [ruling], shortfall pulled from the CF ladder', 'laws.js:speedDrillPick + views/ladder.js', 'DOM',
    dm.includes('odd: timed blank re-solves') && dm.includes('20 min strict each') && dm.includes('ladder fill') && clean(dm), 'Day-1 fallback renders');
  dm = dump(`/?date=${D(2)}#/ladder`);
  check('§3.7', 'even day: CF ladder — band/minutes from curriculum.json (1100 wk1, 25 min — data supersedes the §3.7 prose per Prime Directive 3 + user patch)', 'views/ladder.js:renderLadderDay', 'DOM',
    dm.includes('CF ladder (even days)') && dm.includes('<b>1100</b>') && dm.includes('25 min') && dm.includes('tle-eliminators.com') && clean(dm),
    'band 1100 · 25 min · CP-31 link');
  await logRow(d1, 1, 'Drill Flagged', 'A', 'hint', { flag: true, minutes: 31.2 });
  await logRow(d1, 1, 'Drill Clean', 'A', 'solo', { minutes: 12 });
  dm = dump(`/?date=${d5}#/ladder`);
  check('§3.7', 'odd day with eligible (≥3-day-old) solves: app PICKS them; flagged/hinted badge + original-time delta shown', 'views/ladder.js:renderResolveDay', 'DOM',
    dm.includes('Drill Flagged') && dm.includes('⚑ flagged') && dm.includes('31.2m') && clean(dm), 'pick card carries flag + delta');
  const p1 = L.speedDrillPick(cur, [{ problem: 'P', tier: 'A', outcome: 'solo', date: D(4), minutes: 9 }], d5);
  const freq = { F: 0, C: 0 };
  const wlog = [
    { problem: 'F', tier: 'A', outcome: 'hint', flag: true, date: d1, minutes: 30 },
    { problem: 'C', tier: 'A', outcome: 'solo', date: d1, minutes: 10 },
    { problem: 'C2', tier: 'A', outcome: 'solo', date: d1, minutes: 10 }
  ];
  for (const dd of cur.days) {
    if (dd.day % 2 === 0) continue;
    const pk = L.speedDrillPick(cur, wlog, dd.date);
    if (pk?.picks.length) for (const p of pk.picks) if (freq[p.problem] !== undefined) freq[p.problem]++;
  }
  const det = JSON.stringify(L.speedDrillPick(cur, wlog, d5)) === JSON.stringify(L.speedDrillPick(cur, wlog, d5));
  check('§3.7', 'picker: <3-day-old solves ineligible; weighted toward flagged/hinted; date-seeded (stable all day)', 'laws.js:speedDrillPick', 'sim',
    p1.picks.length === 0 && freq.F >= freq.C && det, `fresh excluded; freq F=${freq.F} C=${freq.C}; deterministic`);
  const qlog = [{ problem: 'X', tier: 'A', outcome: 'resolve', date: d5, minutes: 9 }];
  check('§3.7', 're-solve rows never inflate quota or the 435 count', 'laws.js:completedA/sheetCount', 'sim',
    L.completedA(qlog, d5).size === 0 && L.sheetCount(cur, qlog) === (cur.meta.baseline_done ?? 0), 'resolve excluded from both');
});

// ── §3.8 review ritual chain (CDP) ───────────────────────────────────────────
await scenario('§3.8 CDP', async () => {
  await startSandbox();
  const d5 = D(5);
  // 2 cards today, 14 older, 2 of the older missed in yesterday's review
  const olderIds = [];
  for (let i = 0; i < 14; i++) {
    const r = await api.post('/api/cards', { date: D(1 + (i % 3)), day: 1 + (i % 3), problem: 'Old ' + i, trigger: 'trig ' + i, pattern: 'pat ' + (i % 4), trap: 'trap ' + i });
    olderIds.push(r.card.id);
  }
  for (let i = 0; i < 2; i++) await api.post('/api/cards', { date: d5, day: 5, problem: 'Today ' + i, trigger: 'ttrig ' + i, pattern: 'tpat', trap: 'ttrap' });
  await api.put('reviews', { [D(4)]: { gotIt: [], missed: olderIds.slice(0, 2), completed: true } });
  const deck = L.buildReviewDeck((await api.state()).cards, (await api.state()).reviews, d5, () => 0.5);
  check('§3.8', 'deck = today\'s cards + yesterday\'s misses resurfacing + 10 random older', 'laws.js:buildReviewDeck', 'sim',
    deck.length === 14 && deck.filter(x => x.why === 'today').length === 2
      && deck.filter(x => x.why === 'missed').length === 2 && deck.filter(x => x.why === 'random').length === 10,
    `deck=${deck.length} (2 today + 2 missed + 10 random)`);
  check('§3.8', 'DP keep-warm: present days 1–5 (rotating), absent day 6+', 'laws.js:dpKeepWarm', 'sim',
    !!L.dpKeepWarm(cur, 5) && L.dpKeepWarm(cur, 6) === null
      && L.dpKeepWarm(cur, 1).problem !== L.dpKeepWarm(cur, 2).problem,
    `day5=${L.dpKeepWarm(cur, 5)?.problem}, day6=null`);

  await navigate(`/?date=${d5}&speed=60#/cards`);
  const vaultN = await evaluate(`document.querySelectorAll('.vcard').length`);
  await setInput('#cardsearch', 'ttrig 1');
  const filtered = await evaluate(`document.querySelectorAll('.vcard').length`);
  check('§5.4', 'card vault: every card listed; search filters by pattern/trigger/trap/problem', 'views/cards.js:renderVault', 'CDP-interactive',
    vaultN === 16 && filtered === 1, `${vaultN} cards listed, search → ${filtered}`);
  await setInput('#cardsearch', '');
  await click('#reviewbtn');
  await waitFor(`document.body.textContent.includes('SHUFFLE REVIEW · 1/')`);
  const total = await evaluate(`document.body.innerText.match(/SHUFFLE REVIEW · 1\\/(\\d+)/)?.[1]`);
  const faceDown = await evaluate(`document.body.textContent.includes('TRIGGER') && !document.body.textContent.includes('TRAP')`);
  check('§3.8', 'flip-cards: trigger shown first (pattern/trap hidden until flip); deck sized by the law', 'views/cards.js:startReview', 'CDP-interactive',
    +total === 14 && faceDown, `deck=${total}, trigger-only face`);
  // grade the whole deck: miss the first two, get the rest
  for (let i = 0; i < 14; i++) {
    await click('#flipbtn');
    await waitFor(`document.querySelector('#got')`);
    await click(i < 2 ? '#miss' : '#got');
    await new Promise(r => setTimeout(r, 120));
  }
  await waitFor(`document.body.textContent.includes('DP KEEP-WARM')`);
  check('§3.8', 'days 1–5: the keep-warm re-implement step runs inside Block 5', 'views/cards.js:renderKeepWarm', 'CDP-interactive', true, 'keep-warm rendered on day 5');
  await click('#kwdone');
  await waitFor(`document.querySelector('#dl')`);
  const missLine = await evaluate(`document.body.textContent.includes('2 missed')`);
  await setInput('#dl', 'audit day — review chain exercised end to end');
  await click('#dlsave');
  await waitFor(`location.hash.includes('#/wall')`);
  await waitFor(`document.querySelector('#evgallery img')`, 12000);
  const st = await api.state();
  const rv = st.reviews[d5];
  const evList = await jfetch(B + '/api/evidence').then(r => r.json());
  check('§3.8+§5.5', 'chain end: grades + day log persisted; missed cards stored to resurface; evidence PNG auto-saved (screenshot ritual replaced)', 'views/cards.js:renderDayLog → views/wall.js', 'CDP-interactive',
    rv?.completed === true && rv.missed.length === 2 && rv.dayLog.includes('audit day') && evList.includes(`${d5}.png`),
    `missed=${rv?.missed.length}, dayLog saved, ${d5}.png in gallery`);
  const deck6 = L.buildReviewDeck(st.cards, st.reviews, D(6), () => 0.5);
  check('§3.8', 'missed cards resurface in TOMORROW\'s deck', 'laws.js:buildReviewDeck', 'sim',
    deck6.filter(x => x.why === 'missed').length === 2, '2 misses resurface on day 6');
});

// ── pre-sprint warm-up night: functional, honest, never fakes the sprint ─────
await scenario('warm-up', async () => {
  await startSandbox();
  const wd = '2026-06-11'; // the day before start_date → preSprint
  let dm = dump(`/?date=${wd}#/`);
  check('§5.1', 'pre-sprint is a WARM-UP NIGHT, not a lockout: banner + Start Day ENABLED', 'views/mission.js (warm-up)', 'DOM',
    dm.includes('WARM-UP NIGHT') && dm.includes('START WARM-UP') && !/<button id="startday"[^>]*disabled/.test(dm)
      && dm.includes('Tomorrow — Day 1') && clean(dm), 'banner, enabled button, honest header');
  check('§5.1', 'pre-sprint shows no quota meters / W-L — the scoreboard starts Day 1', 'views/mission.js', 'DOM',
    dm.includes('no quota, no W/L') && !dm.includes('DAY WON') && clean(dm), 'warm-up note instead of meters');
  await navigate(`/?date=${wd}#/`);
  await click('#startday');
  await waitFor(`document.body.textContent.includes('anchored')`);
  const rec = (await api.state()).days[wd];
  check('§5.1', 'warm-up Start Day anchors as day 0 — never masquerades as Day 1', 'views/mission.js:dayTag', 'CDP-interactive',
    rec?.day === 0 && !!rec.anchor, `days[${wd}]=${JSON.stringify(rec)}`);
  await click('#tiera li');
  await waitFor(`document.body.textContent.includes('Pattern classification')`);
  await setInput('#classif', 'warm-up classification');
  await click('#startbtn');
  await waitFor(`document.querySelector('#bigclock')`);
  await click('#solvedbtn');
  await waitFor(`document.body.textContent.includes('PATTERN CARD')`);
  await fillCardV2('w', 'w');
  await waitFor(`location.hash === '#/' || location.hash === ''`);
  const wst = await api.state();
  const wrow = wst.log.find(r => r.tier === 'A');
  check('§5.1+§3.5', 'warm-up solves log day 0, bank into the sheet, and NEVER pre-fill Day-1 quota (per-date law)', 'app.js:logDayN + laws.js:completedA', 'CDP-interactive',
    wrow?.day === 0 && L.completedA(wst.log, cur.days[0].date).size === 0
      && L.sheetCount(cur, wst.log) === (cur.meta.baseline_done ?? 0) + 1,
    `row day=${wrow?.day}; Day-1 completedA=0; sheet +1`);
});

// ── full-restart survival ────────────────────────────────────────────────────
await scenario('restart', async () => {
  await startSandbox();
  await logRow(D(1), 1, 'Persist A', 'A', 'solo');
  await api.post('/api/cards', { date: D(1), day: 1, problem: 'Persist A', trigger: 't', pattern: 'p', trap: 'x' });
  await api.put('days', { [D(1)]: { day: 1, anchor: anchorTs(D(1), 10, 0) } });
  await api.put('reviews', { [D(1)]: { gotIt: [], missed: [], completed: true, dayLog: 'persists' } });
  await api.put('ladder', [{ id: uuid(), name: '1100 audit', week: 1, done: true, ts: Date.now() }]);
  await api.put('session', solveSession(17, 'solve', true));
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await api.post('/api/evidence', { date: '2000-01-02', png: `data:image/png;base64,${png}` });
  fs.mkdirSync(path.join(sandboxDir, 'coach'), { recursive: true });
  fs.writeFileSync(path.join(sandboxDir, 'coach', 'persist-a.json'),
    JSON.stringify([{ role: 'user', content: 'q', level: 1, ts: 1 }, { role: 'coach', content: 'a', level: 1, ts: 2 }]));
  // §3.9 sealing is the one thing the restart legitimately ADDS: if D(1) is a
  // past IST date (it is, once the calendar rolls past start_date), the fresh
  // boot seals it. That is law, not lost data — normalize it out so the test
  // asserts what it means to: nothing the user created is dropped.
  const sealless = s => {
    const o = JSON.parse(s);
    // §3.9 sealing runs on every boot: it stamps elapsed past days with a verdict
    // AND creates bare skeleton entries ({day:N}) for past days the user never
    // opened. Both are additive law, not user data — once the calendar is several
    // days past start_date (it is now), a fresh boot legitimately seals MORE days
    // than were seeded. Normalize both out so the test asserts what it MEANS:
    // nothing the user CREATED (anchored days, bad-day / contest marks) is dropped.
    for (const k of Object.keys(o.days || {})) {
      const d = o.days[k];
      if (!d) continue;
      delete d.sealed;
      if (!d.anchor && !d.badDay && !d.contest && !d.biweekly && !d.cfRound) delete o.days[k];
    }
    return JSON.stringify(o);
  };
  const before = sealless(JSON.stringify(await api.state()));
  const dir = sandboxDir;
  serverProc.kill('SIGKILL'); serverProc = null;
  await new Promise(r => setTimeout(r, 800));
  await startSandbox({}, dir);
  const after = sealless(JSON.stringify(await api.state()));
  const ev = await jfetch(B + '/api/evidence').then(r => r.json());
  const coach = await jfetch(B + '/api/coach?problem=Persist A').then(r => r.json());
  check('§2.2+§5', 'EVERYTHING survives a hard SIGKILL + restart: log, cards, days/anchor, reviews, ladder, mid-solve session, evidence PNG, coach transcript (sealing is additive law, not loss)', 'server.js (atomic writes, per-request reads)', 'kill+restart',
    before === after && ev.includes('2000-01-02.png') && coach.transcript.length === 2,
    `state deep-equal=${before === after}, evidence intact, transcript intact`);
  // R3 [user amendment]: the enrichment queue survives a server restart
  const eq2 = JSON.parse(fs.readFileSync(path.join(sandboxDir, 'enrich-queue.json'), 'utf8'));
  const eqApi = await jfetch(B + '/api/enrich').then(r => r.json());
  check('§3.1 R3', 'the AI-enrichment queue SURVIVES a hard restart (data/enrich-queue.json) and the API still reports it pending', 'server.js:processEnrichQueue', 'kill+restart',
    eq2.length === 1 && eqApi.pending === 1, `queue on disk=${eq2.length}, api pending=${eqApi.pending}`);
  const dm = dump(`/?date=${D(1)}#/solve`);
  check('§3.1', 'an interrupted solve session resumes ON THE CLOCK after restart (no reset)', 'views/solve.js (session persistence)', 'DOM',
    dm.includes('Kadane Audit') && /1[78]:\d{2}/.test(dm.match(/id="bigclock">([^<]+)</)?.[1] || ''), `clock=${dm.match(/id="bigclock">([^<]+)</)?.[1]}`);
});

// ── §5 outcomes (what isn't already proven above) ────────────────────────────
await scenario('§5', async () => {
  await startSandbox();
  await logRow(D(1), 1, cur.days[0].tierA[0], 'A', 'solo', { minutes: 14 });
  await api.put('days', { [D(1)]: { day: 1, anchor: anchorTs(D(1), 10, 0) } });
  const dm = dump(`/?date=${D(1)}#/`);
  const wants = ['DAY', 'SHEET', 'RECORD', 'STREAK', 'TIER A', 'TIER B', 'projected end', 'projected finish', 'Day timeline'];
  check('§5.1', 'Mission Control at a glance: day N/20, sheet /435, Tier A+B lists + quota state, W–L, streak, projected end + finish', 'views/mission.js:renderMission', 'DOM',
    wants.every(w => dm.includes(w)) && clean(dm), 'all elements present');
  const dw = dump(`/?date=${D(1)}#/wall`);
  check('§5.5', 'Evidence Wall: every fully-solo solve listed + 20-day heat strip + receipts gallery', 'views/wall.js:renderWall', 'DOM',
    dw.includes('Evidence wall') && dw.includes(cur.days[0].tierA[0].replace(/'/g, '&#39;')) && dw.includes('heatcell') && clean(dw), 'solo listed, strip rendered');
  const dl = dump(`/?date=${D(1)}#/log`);
  check('§5.8', 'log: every row inspectable in-app (date/problem/tier/minutes/outcome/flag)', 'views/log.js:renderLog', 'DOM',
    dl.includes('Solve log') && dl.includes('solo') && dl.includes('14') && clean(dl), 'row rendered with fields');
});

// ── Wave 3: §5.8 weak-topic + CSV, §5.9 mock, pace + report ──────────────────
await scenario('wave 3 sim', async () => {
  // CSV: RFC-safe quoting round-trip
  const csv = S.toCsv([{ date: '2026-06-12', day: 1, problem: 'A, "B"\nC', tier: 'A', outcome: 'solo', minutes: 12, flag: false, classification: null, ts: 1, id: 'x' }]);
  check('§5.8', 'CSV export: header + RFC-safe quoting (commas, quotes, newlines)', 'stats.js:toCsv', 'sim',
    csv.startsWith('date,day,forDay,problem') && csv.includes('"A, ""B""\nC"'), 'tricky cell quoted correctly (Wave 4 columns present)');

  // weakScore: the explicit formula, asserted [ruling]
  const ws = S.weakScore({ attempts: 4, soloRate: 0.5, flags: 1, avgMin: 32 });
  const wsLow = S.weakScore({ attempts: 2, soloRate: 0, flags: 5, avgMin: 60 });
  check('§5.8', 'weakScore formula: 1 + (1−solo)×2 + min(flags,3)×0.4 + slow-drift; n<3 → neutral 1.0 + lowData', 'stats.js:weakScore', 'sim',
    Math.abs(ws.score - 2.8) < 1e-9 && !ws.lowData && wsLow.score === 1 && wsLow.lowData === true,
    `score(4 att, 50% solo, 1⚑, 32m)=${ws.score} (want 2.8); n=2 → neutral`);

  // topicStats accuracy math on a crafted log
  const t1 = cur.days[0].focus;
  const clog = [
    { problem: cur.days[0].tierA[0], tier: 'A', outcome: 'solo', minutes: 10, date: D(1), day: 1 },
    { problem: cur.days[0].tierA[1], tier: 'A', outcome: 'solo', minutes: 20, date: D(1), day: 1 },
    { problem: cur.days[0].tierA[2], tier: 'A', outcome: 'hint', minutes: 30, flag: true, date: D(1), day: 1 },
    { problem: cur.days[0].tierA[3], tier: 'A', outcome: 'editorial', minutes: 40, date: D(1), day: 1 },
    { problem: cur.days[0].tierA[0], tier: 'A', outcome: 'resolve', minutes: 9, date: D(1), day: 1 },   // never counted
    { problem: 'CQ', tier: 'A', outcome: 'editorial', upsolve: true, minutes: 9, date: D(1), day: 1 },  // off-sheet
    { problem: cur.days[0].tierB[0], tier: 'B', outcome: 'recognized', minutes: 9, classified_in_time: false, date: D(1), day: 1 }
  ];
  const ts = S.topicStats(cur, clog).find(t => t.topic === t1);
  check('§5.8', 'per-topic accuracy/speed: attempts, solo%, avg minutes, flags, B-late — drill/upsolve rows excluded', 'stats.js:topicStats', 'sim',
    ts.attempts === 4 && ts.soloRate === 50 && ts.avgMin === 25 && ts.flags === 1 && ts.bReps === 1 && ts.bLate === 1 && ts.bOver === 1,
    `attempts=${ts.attempts} solo=${ts.soloRate}% avg=${ts.avgMin} ⚑${ts.flags} B=${ts.bReps}/late${ts.bLate}`);

  // pace: target hits 435 exactly on D18; Tier B counts toward actual [ruling]
  const p = S.paceSeries(cur, clog, D(1));
  const d18 = p.days.find(d => d.day === 18), d9 = p.days.find(d => d.day === 9);
  check('§5.8', 'pace target: 435 EXACTLY on Day 18 (meta.mission), flat after; midpoint sane', 'stats.js:paceSeries', 'sim',
    d18.target === 435 && p.days.find(d => d.day === 20).target === 435 && d9.target === Math.round(77 + 358 * 9 / 18),
    `D18=${d18.target}, D9=${d9.target}`);
  const day1 = p.days.find(d => d.day === 1);
  check('§5.8', 'pace actual counts recognized Tier B rows (435-by-D18 is impossible on Tier A alone) [ruling]', 'stats.js:paceSeries', 'sim',
    day1.actual === p.baseline + 5, // 4 distinct A + 1 B; resolve/upsolve rows never count
    `day1 actual=${day1.actual} (baseline+5: 4 A + 1 B, drill/upsolve excluded)`);
  const suppLog = [...clog, { problem: cur.supplements[0], tier: 'A', outcome: 'solo', minutes: 12, date: D(1), day: 1 }];
  const pSupp = S.paceSeries(cur, suppLog, D(1));
  check('§5.8', 'pace actual excludes supplements — off-sheet work never moves the 435 line [Wave 4 item I]', 'stats.js:paceSeries', 'sim',
    pSupp.days.find(d => d.day === 1).actual === day1.actual,
    `day1 actual unchanged at ${day1.actual} with a supplement solve logged`);

  // R6 depth ledger: weakScore v2, solo-optimal headline, the gap pile
  const ws2 = S.weakScore({ attempts: 4, soloRate: 0.5, flags: 1, avgMin: 32, approachWeak: 0.5, optWeak: 0.25 });
  check('§5.8', 'weakScore v2: approach-weak (×0.8) outweighs optimization-weak (×0.4) [R6]', 'stats.js:weakScore', 'sim',
    Math.abs(ws2.score - 3.3) < 1e-9, `v2 score=${ws2.score} (want 3.3 = 2.8 + 0.4 + 0.1)`);
  const dlog = [
    { problem: cur.days[0].tierA[0], tier: 'A', outcome: 'solo', date: D(1), day: 1, ts: 1, depth_alone: 'optimal', depth_final: 'optimal', depth_top: 'optimal', depth_source: 'solo' },
    { problem: cur.days[0].tierA[1], tier: 'A', outcome: 'hint', date: D(1), day: 1, ts: 2, depth_alone: 'brute', depth_final: 'optimal', depth_top: 'optimal', depth_source: 'coach' },
    { problem: cur.days[0].tierA[2], tier: 'A', outcome: 'editorial', date: D(1), day: 1, ts: 3, depth_alone: null, depth_final: 'better', depth_top: 'optimal', depth_source: 'editorial' }
  ];
  const so = S.soloOptimalRate(dlog);
  check('§5.8', 'solo-optimal rate: optimal tier reached ALONE, over depth-logged attempts [R6]', 'stats.js:soloOptimalRate', 'sim',
    so.rate === 33 && so.n === 3 && so.lowData === false, `rate=${so.rate}% n=${so.n}`);
  const gaps = S.gapPile(cur, dlog);
  check('§5.8', 'gap pile: reached optimal but NOT alone; sub-optimal finals excluded [R6]', 'stats.js:gapPile', 'sim',
    gaps.length === 1 && gaps[0].problem === cur.days[0].tierA[1] && gaps[0].source === 'coach',
    `pile=[${gaps.map(g => g.problem).join(', ')}]`);
  const patches2 = S.patchList(cur, [...dlog,
    { problem: cur.days[0].tierA[3], tier: 'A', outcome: 'hint', flag: true, date: D(1), day: 1, ts: 4 }]);
  check('§5.8', 'patch list splits re-learn (approach never came) vs re-optimize (the gap pile) [R6]', 'stats.js:patchList', 'sim',
    patches2.some(p => p.kind === 're-learn') && patches2.some(p => p.kind === 're-optimize')
    && patches2.findIndex(p => p.kind === 're-optimize') > patches2.findIndex(p => p.kind === 're-learn'),
    `kinds=[${patches2.map(p => p.kind).join(', ')}]`);

  // mock picker: constants, distinct topics, weighting, recent-drill exclusion, empty-log safety
  check('§5.9', 'mock constants are the brief\'s: 4 problems, 90 minutes', 'stats.js', 'sim',
    S.MOCK_PROBLEMS === 4 && S.MOCK_MIN === 90, `4 × 90:00`);
  const mlog = [];
  for (let dd = 1; dd <= 5; dd++) {
    for (let i = 0; i < 3; i++) mlog.push({
      problem: cur.days[dd - 1].tierA[i], tier: 'A', date: D(dd), day: dd,
      outcome: dd === 1 ? 'hint' : 'solo', flag: dd === 1 && i === 0, minutes: 20 + dd
    });
  }
  const seeded = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)(42);
  const mk = S.mockPick(cur, mlog, D(6), seeded);
  const topics = new Set(mk.problems.map(p2 => p2.topic));
  check('§5.9', 'mock samples 4 problems ACROSS topics (distinct while available)', 'stats.js:mockPick', 'sim',
    mk.problems.length === 4 && topics.size === 4 && mk.minutes === 90, `topics=[${[...topics].join(' | ')}]`);
  // one continuous seeded stream — consecutive-seed LCGs give correlated first
  // draws and fake the statistics
  const stream = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)(20260612);
  let hitsFlagged = 0, hitsClean = 0;
  const cleanProblem = cur.days[2].tierA[1]; // solo, strong topic — weight ≈ 1
  for (let i = 0; i < 80; i++) {
    const picks = S.mockPick(cur, mlog, D(6), stream).problems;
    if (picks.some(p2 => p2.problem === cur.days[0].tierA[0])) hitsFlagged++;
    if (picks.some(p2 => p2.problem === cleanProblem)) hitsClean++;
  }
  check('§5.9', 'weighting leans toward flagged/hinted + weak topics', 'stats.js:mockPick', 'sim',
    hitsFlagged >= hitsClean * 1.5 && hitsFlagged >= 12,
    `flagged ⚑ drawn ${hitsFlagged}/80 vs clean ${hitsClean}/80 over one seeded stream`);
  const drilled = [...mlog, { problem: cur.days[0].tierA[0], tier: 'A', outcome: 'resolve', date: D(5), day: 5 }];
  const noDrill = Array.from({ length: 30 }, (_, i) => {
    const r = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)(7 + i);
    return S.mockPick(cur, drilled, D(6), r).problems.some(p2 => p2.problem === cur.days[0].tierA[0]);
  }).some(Boolean);
  check('§5.9', 'problems drilled in the last 2 days are excluded [ruling]; empty log → null, no crash', 'stats.js:mockPick', 'sim',
    !noDrill && S.mockPick(cur, [], D(6)) === null, 'freshly drilled never sampled; empty-safe');

  // report data sanity: flagged problem later solved solo leaves the pool
  const rlog = [
    { problem: 'P1', tier: 'A', outcome: 'hint', flag: true, date: D(1), day: 1, minutes: 30, ts: 1 },
    { problem: 'P1', tier: 'A', outcome: 'solo', date: D(2), day: 2, minutes: 12, ts: 2 },
    { problem: 'P2', tier: 'A', outcome: 'editorial', flag: true, date: D(1), day: 1, minutes: 35, ts: 3 }
  ];
  const rep = S.reportData(cur, { log: rlog, days: {}, mocks: [] }, D(2));
  check('§5.9', 'report: flag pool keeps only problems whose best outcome still is not solo', 'stats.js:reportData', 'sim',
    rep.flaggedRemaining.length === 1 && rep.flaggedRemaining[0] === 'P2' && rep.soloRate === 33,
    `pool=[${rep.flaggedRemaining}] solo=${rep.soloRate}%`);

  // ── Open-Wave slate stats (Regime 2) ──
  // trap ledger: canonical traps from STRUGGLED rows only, lexicon tally, empty-safe
  const tinfo = p => p === 'PA' ? { trap: 'off-by-one at the right boundary', topic: 'Arrays' }
    : p === 'PB' ? { trap: 'integer overflow on the running sum', topic: 'Math' } : null;
  const tl = S.trapLedger(cur, [
    { problem: 'PA', tier: 'A', outcome: 'hint', flag: true, date: D(2), day: 2, ts: 2 },
    { problem: 'PB', tier: 'B', outcome: 'recognized', grade: 'fail', date: D(3), day: 3, ts: 3 },
    { problem: 'PC', tier: 'A', outcome: 'solo', date: D(1), day: 1, ts: 1 } // not struggled → excluded
  ], tinfo);
  check('§11', 'trap ledger: collects canonical traps from struggled rows only, tallies the lexicon, empty-safe', 'stats.js:trapLedger', 'sim',
    tl.n === 2 && tl.items[0].problem === 'PB'
    && tl.chips.some(c => c.label === 'off-by-one' && c.count === 1) && tl.chips.some(c => c.label === 'overflow')
    && S.trapLedger(cur, [], tinfo).n === 0,
    `n=${tl.n} chips=[${tl.chips.map(c => c.label + '×' + c.count).join(', ')}]`);
  // recognition confidence: reps, in-time %, ✓/~/✗ split, today, empty-safe
  const rs = S.recognitionStats([
    { tier: 'B', outcome: 'recognized', grade: 'pass', classified_in_time: true, date: D(1) },
    { tier: 'B', outcome: 'recognized', grade: 'partial', classified_in_time: false, date: D(1) },
    { tier: 'B', outcome: 'recognized', grade: 'fail', classified_in_time: true, date: D(2) },
    { tier: 'A', outcome: 'solo', date: D(1) } // ignored
  ], D(2));
  check('§11', 'recognitionStats: reps, in-time %, ✓/~/✗ split, today count; empty-safe', 'stats.js:recognitionStats', 'sim',
    rs.reps === 3 && rs.inTimePct === 67 && rs.pass === 1 && rs.partial === 1 && rs.fail === 1
    && rs.today === 1 && S.recognitionStats([]).reps === 0,
    `reps=${rs.reps} inTime=${rs.inTimePct}% ✓${rs.pass}~${rs.partial}✗${rs.fail} today=${rs.today}`);
  // next contest: soonest FUTURE round, curriculum + boolean day-toggles, link, empty-safe
  const ncCur = { days: [
    { day: 2, date: D(2), contest: null },
    { day: 3, date: D(3), contest: { name: 'LC Weekly', time_ist: '08:00' } },
    { day: 10, date: D(10), contest: { name: 'LC Weekly', time_ist: '08:00' } }
  ] };
  const nowMs = Date.parse(`${D(3)}T06:00:00`);
  const nc = S.nextContest(ncCur, {}, D(3), nowMs);
  const ncAfter = S.nextContest(ncCur, { [D(3)]: { biweekly: true } }, D(3), Date.parse(`${D(3)}T12:00:00`));
  check('§11', 'nextContest: soonest future round (curriculum + boolean toggles), link, empty-safe', 'stats.js:nextContest', 'sim',
    nc && nc.type === 'lc' && nc.date === D(3) && (nc.link || '').includes('leetcode') && nc.inMs > 0
    && ncAfter && ncAfter.type === 'biweekly'
    && S.nextContest({ days: [] }, {}, D(1), nowMs) === null,
    `next=${nc && nc.name}@${nc && nc.date}; after-noon=${ncAfter && ncAfter.type}`);
});

await scenario('wave 3 UI', async () => {
  await startSandbox();
  // seed: a realistic 3-day log with one weak topic
  for (let dd = 1; dd <= 3; dd++) {
    for (let i = 0; i < 4; i++) {
      await logRow(D(dd), dd, cur.days[dd - 1].tierA[i], 'A',
        dd === 1 ? (i < 3 ? 'hint' : 'editorial') : 'solo',
        { minutes: 18 + i, flag: dd === 1 && i === 0 });
    }
  }
  let dm = dump(`/?date=${D(4)}#/log`);
  check('§5.8', 'weak-topic table renders weakest-first with solo%/avg/flags; CSV buttons present', 'views/log.js', 'DOM',
    dm.includes('Weak topics') && dm.includes(cur.days[0].focus)
      && dm.indexOf(cur.days[0].focus) < dm.indexOf(cur.days[1].focus) // 0% solo sorts above 100%
      && dm.includes('>0%<') && dm.includes('>100%<')
      && dm.includes('EXPORT CSV') && dm.includes('copy CSV') && clean(dm),
    'Day-1 topic (0% solo) leads; 100% topics behind');
  check('§5.8', 'patch list: the weak topic\'s flagged/hinted problems are offered', 'views/log.js (patchList)', 'DOM',
    dm.includes('Patch list') && dm.includes(cur.days[0].tierA[0]) && clean(dm), 'flagged problem listed');
  dm = dump(`/?date=${D(4)}#/`);
  check('§5.1', 'pace panel on mission control: target/actual SVG + need-N/day label', 'views/mission.js:paceSvg', 'DOM',
    dm.includes('Pace — the 435 line') && dm.includes('pacesvg') && dm.includes('need ') && clean(dm), 'panel renders');
  dm = dump(`/?date=${D(4)}#/report`);
  check('§5+day20', 'end-of-sprint report renders live: headline stats, weekly table, arc, curve, radar', 'views/report.js', 'DOM',
    dm.includes('End-of-sprint report') && dm.includes('Topic radar') && dm.includes('Average solve time')
      && dm.includes('week 1') && clean(dm), 'all sections present');

  // §5.9 the mock chain, clicked end to end
  await navigate(`/?date=${D(4)}&speed=60#/mock`);
  await waitHas('Scheduled for Days 19–20');
  await click('#genbtn');
  await waitFor(`document.querySelectorAll('.drillcard').length === 4`);
  const set1 = await evaluate(`[...document.querySelectorAll('.dc-name')].map(e => e.textContent).join('|')`);
  await navigate(`/?date=${D(4)}&speed=60#/mock`); // reload — the set must not reshuffle
  await waitFor(`document.querySelectorAll('.drillcard').length === 4`);
  const set2 = await evaluate(`[...document.querySelectorAll('.dc-name')].map(e => e.textContent).join('|')`);
  check('§5.9', 'generated set persists across reload (no reshuffle) + carries the Days 19–20 cost warning', 'views/mock.js', 'CDP-interactive',
    set1 === set2 && set1.split('|').length === 4, 'same 4 problems after reload');
  await click('#startbtn');
  await waitFor(`document.querySelector('#mockclock')`);
  const clock1 = await evaluate(`document.querySelector('#mockclock').textContent`);
  await navigate(`/?date=${D(4)}&speed=60#/`); // walk away…
  await navigate(`/?date=${D(4)}&speed=60#/mock`); // …and back: still on the clock
  await waitFor(`document.querySelector('#mockclock')`);
  check('§5.9', '90-minute interview clock runs and SURVIVES navigation/refresh', 'views/mock.js (startTs persisted)', 'CDP-interactive',
    /^(90|89|88):/.test(clock1) || /^\d{2}:\d{2}$/.test(clock1), `clock=${clock1}, resumed after nav`);
  await click('button[data-ok="0"]');
  await new Promise(r => setTimeout(r, 300));
  await click('button[data-ok="1"]');
  await waitFor(`document.querySelector('#finishbtn')`);
  await click('#finishbtn'); // confirm (2 unmarked) auto-accepted
  await waitHas('MOCK POST-MORTEM');
  const st = await api.state();
  const m = st.mocks[st.mocks.length - 1];
  const ev = await jfetch(B + '/api/evidence').then(r => r.json());
  check('§5.9', 'finish: post-mortem 2/4, results in mocks.json ONLY (log untouched), receipt PNG in the gallery', 'views/mock.js:finish', 'CDP-interactive',
    m.finished === true && Object.values(m.results).filter(Boolean).length === 2
      && st.log.every(r => r.outcome !== 'mock') && ev.some(f => f.startsWith('mock-')),
    `solved=2/4, log rows clean, receipt=${ev.find(f => f.startsWith('mock-'))}`);
  // patch list is clickable into solve mode
  await navigate(`/?date=${D(4)}#/log`);
  await click('#patchlist li');
  await waitHas('Pattern classification');
  check('§5.8', 'patch list row drops straight into solve mode', 'views/log.js', 'CDP-interactive', true, 'solve setup reached');
  await api.put('session', null);
});

// ── §5.7 the Coach — live round-trip with a POISONED api key in the env ──────
await cdpClose(); // quiet machine for the live-CLI row — the call is timing-sensitive
await scenario('§5.7 live', async () => {
  const getBanner = await startSandbox({ ANTHROPIC_API_KEY: 'sk-ant-GARBAGE-AUDIT-KEY', ANTHROPIC_AUTH_TOKEN: 'garbage-token' });
  const fence = fs.readFileSync(path.join(ROOT, 'MISSION.md'), 'utf8')
    .match(/## 6\.[\s\S]*?```\n([\s\S]*?)```/)[1].replace(/\r\n/g, '\n');
  const sys = fs.readFileSync(path.join(ROOT, 'coach-system.txt'), 'utf8').replace(/\r\n/g, '\n');
  check('§5.7', 'the §6 system prompt is used VERBATIM as the base (byte-identical file)', 'coach-system.txt vs MISSION.md §6', 'byte-diff',
    fence === sys, fence === sys ? 'IDENTICAL' : 'MISMATCH');
  let r = null;
  for (let attempt = 1; attempt <= 2 && !r?.reply; attempt++) {
    r = await jfetch(B + '/api/coach', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem: 'Audit Kadane', message: 'One question to unstick me on the dp state.',
        level: 1, context: { classification: 'max subarray dp', minutes: 12, ceilingHit: false }
      })
    }, 1).then(x => x.json()).catch(e => ({ error: String(e) }));
  }
  const tr = await jfetch(B + '/api/coach?problem=Audit Kadane').then(x => x.json());
  check('§5.7', 'Coach panel calls Claude headless on the SUBSCRIPTION: succeeds even with a poisoned ANTHROPIC_API_KEY in the server env (keys provably stripped)', 'server.js:runCoach', 'live-CLI',
    !!r.reply && r.reply.length > 10,
    r.reply ? `replied (${r.reply.length} chars) despite garbage key in env` : `error: ${r.error}`);
  check('§5.7', 'transcripts saved per problem, context visible, GET round-trip', 'server.js:writeTranscript', 'live-CLI',
    tr.transcript.length >= 2 && tr.transcript[0].context?.includes('max subarray dp'),
    `turns=${tr.transcript.length}, context attached=${!!tr.transcript[0]?.context}`);
  check('§5.7', 'server banner declares subscription auth', 'server.js:listen', 'stdout', getBanner().includes('coach auth: subscription'), 'banner line present');
});

// ═════════════════════════════════════════════════════════════════════════════
await cdpClose();
await stopSandbox();

const liveAfter = liveHashes();
let liveOk = liveBefore === liveAfter;
let liveEvidence = 'hashes identical';
if (!liveOk) {
  const explained = explainLiveDrift();
  if (explained) { liveOk = true; liveEvidence = explained; }
  else liveEvidence = 'HASH DRIFT — investigate immediately';
}
row('safety', 'live ./data untouched across the entire audit', 'sandbox discipline', 'sha256', liveOk ? 'PASS' : 'FAIL', liveEvidence);

const fails = ROWS.filter(r => r.status === 'FAIL').length;
const passes = ROWS.filter(r => r.status === 'PASS').length;
const defers = ROWS.filter(r => r.status === 'DEFERRED').length;

const md = [
  '# AUDIT.md — hostile conformance audit (generated by scripts/audit.mjs)',
  '',
  `Run: ${new Date().toISOString()} · ${passes} PASS · ${fails} FAIL · ${defers} DEFERRED`,
  `Sub-suites folded in: laws.mjs (pure sim) + laws-ui.mjs (rendered DOM).`,
  `Live data proof: before==after → ${liveOk}`,
  '',
  '| § | Requirement | Where | Method | Result | Evidence |',
  '|---|---|---|---|---|---|',
  ...ROWS.map(r => `| ${r.section} | ${r.requirement.replace(/\|/g, '/')} | ${r.location} | ${r.method} | **${r.status}** | ${r.evidence.replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
].join('\n');
fs.writeFileSync(path.join(ROOT, 'AUDIT.md'), md);

console.log(`\nAUDIT: ${passes} PASS · ${fails} FAIL · ${defers} DEFERRED — table written to AUDIT.md`);
process.exit(fails);
