// WAR ROOM — zero-dependency server: static files + JSON persistence API.
// All data lives in ./data as human-readable JSON. curriculum.json is read-only here.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as Laws from './public/laws.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
// P435_DATA lets tests run against a sandbox dir; live data stays untouchable
const DATA = process.env.P435_DATA ? path.resolve(process.env.P435_DATA) : path.join(ROOT, 'data');
const EVIDENCE = path.join(DATA, 'evidence');
const PORT = process.env.P435_PORT || process.env.PORT || 4350;
// Loopback by default: the API has no auth, so it must not be reachable from
// the network unless you ask for it. P435_HOST=0.0.0.0 opens it to your LAN.
const HOST = process.env.P435_HOST || '127.0.0.1';

const DOCS = {
  log: { file: 'log.json', def: [] },        // append-only solve rows
  cards: { file: 'cards.json', def: [] },    // append-only pattern cards
  days: { file: 'days.json', def: {} },      // per-date: { day, anchor }
  ladder: { file: 'ladder.json', def: [] },  // CP-31 checkoffs
  mocks: { file: 'mocks.json', def: [] },    // §5.9 mock sessions + results
  session: { file: 'session.json', def: null }, // active solve, survives restarts
  reviews: { file: 'reviews.json', def: {} }, // per-date Block 5 review state
  enrich: { file: 'enrich-queue.json', def: [] }, // R3 AI-layer queue, survives restarts
  candidates: { file: 'candidates.json', def: [] }, // R4 ✗-promote suggestions
  // ── SEASON 2 (Regime 2, additive) ──────────────────────────────────────────
  // The self-paced "second attempt" cursor + per-day win state + the no-reset
  // baseline. A NEW presentation lane over the FROZEN calendar — it never mutates
  // a sealed past day and never touches log/cards/days. mode 'off' until the user
  // presses START (keeps fresh boots/audits classic).
  campaign: { file: 'campaign.json', def: { season: 2, schema: 1, mode: 'off', pointer: 2, started: null, completed: [], perDay: {}, baseline: null } },
  // SEASON 2 Wave 6 — DSA production tracks (off-sheet; never enter sheetCount).
  dp: { file: 'dp-lc.json', def: { solved: {}, upsolve: [] } },              // hard DP-from-LeetCode
  cfAscent: { file: 'cf-ascent.json', def: { attempts: [], ratingTarget: 1850 } }, // CF rating climb (1800-1900)
  // SEASON 2 Wave 7 — core-CS recall + System Design (off-sheet; own files).
  corecs: { file: 'corecs.json', def: { done: {}, cursor: {} } },            // RecallArena core-CS progress
  sysd: { file: 'sysd.json', def: { artifacts: [] } },                       // LLD/HLD artifacts
  // SEASON 2 Wave 8 — gap-creators (off-sheet; own files).
  oaSims: { file: 'oa-sims.json', def: [] },        // OA simulator sessions (1800-1900, 90 min)
  interviews: { file: 'interviews.json', def: [] }, // multi-round live mock sessions
  companies: { file: 'companies.json', def: [] },   // user target-company shortlist (tiers are in curriculum.s2.json)
  // ── SEASON 3 (Regime 2, additive) — THE GAP: evidence-first final crunch ────
  // Four NEW files; log/cards/sealed days stay untouched (§0 prime directive).
  // arena.attempts is APPEND-ONLY history — every attempt is retained forever;
  // activeSession is server-side so a rep survives refresh/browser/restart.
  arena: { file: 'arena.json', def: { activeSession: null, attempts: [], resolveQueue: [] } },
  doctrine: { file: 'doctrine.json', def: { read: {}, probes: {}, recalls: [], builds: [] } },
  grill: { file: 'grill.json', def: { ownership: {}, drilled: [], whiteboard: {}, landmines: {}, pitches: {}, mocks: [] } },
  warplan: { file: 'warplan.json', def: { checked: {}, diagnostic: {} } }
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

fs.mkdirSync(DATA, { recursive: true });

const CURRICULUM = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum.json'), 'utf8'));

// ── your setup: data/config.json ─────────────────────────────────────────────
// The shipped curriculum.json / warplan.s3.json carry TEMPLATE dates. Your real
// start date, display name, timezone and starting problem count live in
// data/config.json — created on first boot, never committed. Both plans are
// re-based onto your start date IN MEMORY, so the shipped files stay pristine
// and `git pull` never conflicts with your personal setup.
//
// Without this, a fresh clone would compute "today" as day 40-something of a
// 20-day plan and instantly seal every day as a loss. Day 1 is your day 1.
const CONFIG_FILE = path.join(DATA, 'config.json');

const isoDate = (ts, tz) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(ts));

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortWeekday = dateStr => new Date(dateStr + 'T00:00:00Z')
  .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

function loadConfig() {
  const machineTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const defaults = {
    user: '',                                  // your name — shown in the UI and used by the Coach
    timezone: machineTz,                       // the day rolls over at midnight in THIS zone
    start_date: isoDate(Date.now(), machineTz),// day 1 of the 20-day plan
    baseline_done: 0,                          // problems you had already solved before day 1
    warplan_start: null,                       // Season 3 crunch day 1 (null = same as start_date)
    cf_handle: '',                             // Codeforces handle for live rating sync ('' = off)
    language: 'C++'
  };
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { /* first run — written below */ }
  const cfg = { ...defaults, ...saved };
  if (JSON.stringify(cfg) !== JSON.stringify(saved)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
    if (!Object.keys(saved).length) {
      console.log(`\n  first run — wrote ${path.relative(ROOT, CONFIG_FILE)}`);
      console.log(`  day 1 = ${cfg.start_date} (${cfg.timezone}). Edit that file or run`);
      console.log('  `npm run setup` to change your start date, name or baseline.\n');
    }
  }
  return cfg;
}

const CONFIG = loadConfig();
const TZ = CONFIG.timezone || CURRICULUM.meta?.timezone || 'UTC';
// How the Coach and the interviewer address you. Leave `user` blank in
// config.json and they fall back to a neutral, non-gendered noun.
const USER_NAME = CONFIG.user?.trim() || 'the candidate';

// Re-base the 20-day plan onto CONFIG.start_date. Weekday labels are recomputed
// from the real dates, so they never lie about what day it is.
CURRICULUM.meta.user = CONFIG.user;
CURRICULUM.meta.timezone = TZ;
CURRICULUM.meta.language = CONFIG.language;
CURRICULUM.meta.baseline_done = CONFIG.baseline_done;
CURRICULUM.meta.start_date = CONFIG.start_date;
CURRICULUM.days.forEach((d, i) => {
  d.date = addDays(CONFIG.start_date, i);
  d.weekday = shortWeekday(d.date);
});
CURRICULUM.meta.end_date = CURRICULUM.days[CURRICULUM.days.length - 1].date;
delete CURRICULUM.meta.start_state;

// Season 3's 10-day war plan gets the same treatment.
const WARPLAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'warplan.s3.json'), 'utf8'));
{
  const wpStart = CONFIG.warplan_start || CONFIG.start_date;
  WARPLAN.meta.start = wpStart;
  WARPLAN.days.forEach((d, i) => { d.date = addDays(wpStart, i); });
  WARPLAN.meta.end = WARPLAN.days[WARPLAN.days.length - 1].date;
}

// ── CF auto-sync (Wave 4 feature 2) — codeforces.com/api ─────────────────────
// Set cf_handle in data/config.json to switch this on; '' disables it entirely
// and the CF panels simply show nothing to sync. user.status + user.rating,
// cached 10 min in memory + data/cf.json (offline fallback). Auto-checks ladder
// items by the problem code in their names; detects 48h contest participation —
// surfaced as a banner that PREFILLS the LOG CONTEST modal (your confirmation
// feeds the §3.6 upsolve law; the sync never writes contest records itself).
const CF_HANDLE = CONFIG.cf_handle || '';
let cfMem = { ts: 0, data: null };
async function cfFetch() {
  if (!CF_HANDLE) {
    return { handle: '', rating: [], current: null, autoChecked: 0, recentContests: [], disabled: true };
  }
  const get = async u => {
    const r = await fetch(u, { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'project435-local' } });
    const j = await r.json();
    if (j.status !== 'OK') throw new Error(j.comment || 'CF API not OK');
    return j.result;
  };
  const [status, ratingHist] = await Promise.all([
    get(`https://codeforces.com/api/user.status?handle=${CF_HANDLE}&from=1&count=300`),
    get(`https://codeforces.com/api/user.rating?handle=${CF_HANDLE}`)
  ]);
  const okSet = new Set(status.filter(s => s.verdict === 'OK')
    .map(s => `${s.problem.contestId}${s.problem.index}`));
  const ladder = readDoc('ladder');
  let autoChecked = 0;
  for (const item of ladder) {
    if (item.done) continue;
    const m = String(item.name).match(/(\d{3,5})\s*([A-H]\d?)\b/);
    if (m && okSet.has(`${m[1]}${m[2]}`)) {
      item.done = true; item.ts = Date.now(); item.auto = 'cf-sync';
      autoChecked++;
    }
  }
  if (autoChecked) writeDoc('ladder', ladder);
  const cutoff = Date.now() / 1000 - 48 * 3600;
  const live = status.filter(s => s.author?.participantType === 'CONTESTANT' && s.creationTimeSeconds >= cutoff);
  const byContest = new Map();
  for (const s of live) {
    const c = byContest.get(s.problem.contestId) || { contestId: s.problem.contestId, solved: new Set(), tried: new Set() };
    c.tried.add(s.problem.index);
    if (s.verdict === 'OK') c.solved.add(s.problem.index);
    byContest.set(s.problem.contestId, c);
  }
  const recentContests = [...byContest.values()].map(c => ({
    contestId: c.contestId,
    solved: c.solved.size,
    firstUnsolved: [...c.tried].filter(i => !c.solved.has(i)).sort()[0] || null
  }));
  const data = {
    handle: CF_HANDLE,
    rating: ratingHist.map(r => ({ at: r.ratingUpdateTimeSeconds, contest: r.contestName, newRating: r.newRating })),
    current: ratingHist.length ? ratingHist[ratingHist.length - 1].newRating : null,
    autoChecked, recentContests, fetchedAt: Date.now()
  };
  const p = path.join(DATA, 'cf.json');
  fs.writeFileSync(p + '.tmp', JSON.stringify(data, null, 2));
  fs.renameSync(p + '.tmp', p);
  return data;
}
async function cfSync(force) {
  if (!force && cfMem.data && Date.now() - cfMem.ts < 10 * 60000) return cfMem.data;
  try {
    cfMem = { ts: Date.now(), data: await cfFetch() };
    return cfMem.data;
  } catch (e) {
    try { return { ...JSON.parse(fs.readFileSync(path.join(DATA, 'cf.json'), 'utf8')), stale: true, error: String(e.message || e) }; }
    catch { return { handle: CF_HANDLE, rating: [], current: null, autoChecked: 0, recentContests: [], offline: true, error: String(e.message || e) }; }
  }
}

// ── §3.9 sealing — once an IST date passes, its result freezes [R5] ──────────
// Runs at boot and on the first /api/state of each new IST day. A sealed
// snapshot is never recomputed; later log edits cannot reach it.
let lastSealCheck = '';
function sealPastDays() {
  const today = Laws.istDate(Date.now(), TZ);
  if (today === lastSealCheck) return;
  lastSealCheck = today;
  const days = readDoc('days');
  const state = { log: readDoc('log'), days };
  let changed = false;
  for (const d of CURRICULUM.days) {
    if (d.date >= today) break;
    // Only seal a day you actually showed up for. Without this, setting a start
    // date in the past would back-date a wall of losses you never had a chance
    // to play — and a sealed verdict is permanent by design.
    const played = days[d.date]?.anchor || state.log.some(r => Laws.creditDate(r) === d.date);
    if (!played) continue;
    const rec = days[d.date] || (days[d.date] = { day: d.day });
    if (rec.sealed) continue;
    rec.sealed = Laws.sealDay(CURRICULUM, state, d.date);
    changed = true;
    console.log(`  §3.9 sealed ${d.date} (Day ${d.day}): ${rec.sealed.won ? 'W' : 'L'} — A ${rec.sealed.a}/${rec.sealed.quotaA}, B ${rec.sealed.b}/${rec.sealed.quotaB}`);
  }
  if (changed) writeDoc('days', days);
}

// ── the Coach (§5.7 option B, §6) — headless `claude -p` on the subscription ──
// User ruling 2026-06-11: NO Anthropic API key, anywhere, ever. Auth keys are
// deleted from the child env on every call; flaky headless = stop, no fallback.
// {{USER}} in either system prompt becomes your configured name.
const fillName = s => s.replace(/\{\{USER\}\}/g, USER_NAME);
// Missing/!broken coach files must never take the whole app down — the AI layer
// is optional, so it degrades to "coach unavailable" instead of a boot crash.
const readOr = (file, fallback) => {
  try { return fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { return fallback; }
};
const COACH_SYSTEM = fillName(readOr('coach-system.txt', ''));
let COACH_CFG;
try { COACH_CFG = JSON.parse(readOr('coach.config.json', 'null')) || {}; } catch { COACH_CFG = {}; }
COACH_CFG = {
  command: 'claude',
  models: { l1_3: 'sonnet', l4_5: 'opus' },
  timeout_ms: 90000,
  max_context_turns: 10,
  ...COACH_CFG
};
const COACH_DIR = path.join(DATA, 'coach');

// Your project dossiers are private: grill.s3.json is gitignored. Until you
// write your own, the shipped examples keep the Grill Room fully usable.
const dossierFile = () => fs.existsSync(path.join(ROOT, 'grill.s3.json'))
  ? path.join(ROOT, 'grill.s3.json')
  : path.join(ROOT, 'grill.example.json');

const coachSlug = problem => String(problem).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'problem';

function readTranscript(slug) {
  try { return JSON.parse(fs.readFileSync(path.join(COACH_DIR, slug + '.json'), 'utf8')); } catch { return []; }
}
function writeTranscript(slug, t) {
  fs.mkdirSync(COACH_DIR, { recursive: true });
  const p = path.join(COACH_DIR, slug + '.json');
  fs.writeFileSync(p + '.tmp', JSON.stringify(t, null, 2));
  fs.renameSync(p + '.tmp', p);
}

function runCoach(systemPrompt, userPrompt, model) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;        // no-key rule, enforced in code
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDECODE;               // escape any nested Claude Code session
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SSE_PORT;
    // NEVER shell:true here. With a shell, Node concatenates argv into one
    // UNESCAPED command line (DEP0190) — a coach message containing `& cmd`
    // would then execute. Everything you type is untrusted input to this call.
    // Windows: an npm-installed `claude` is a .cmd shim, which cannot be
    // spawned without a shell, so point `command` at a real executable or at
    // ["node", "<path>/cli.js"] instead.
    const cmd = Array.isArray(COACH_CFG.command) ? COACH_CFG.command : [COACH_CFG.command];
    if (/\.(cmd|bat)$/i.test(cmd[0])) {
      return reject(new Error('coach.config.json: "command" must not be a .cmd/.bat shim '
        + '(it cannot be launched safely). Use claude.exe, or ["node", "<path>/cli.js"] — see the README.'));
    }
    const [bin, ...pre] = cmd;
    const child = spawn(bin, [
      ...pre,
      '-p', userPrompt,
      '--system-prompt', systemPrompt,
      '--model', model,
      '--tools', '',                     // pure text coach — no tools
      '--no-session-persistence'
    ], { env, cwd: os.tmpdir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const killer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`coach timed out after ${COACH_CFG.timeout_ms}ms`));
    }, COACH_CFG.timeout_ms || 90000);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(killer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(err.trim() || `coach exited with code ${code}`));
    });
    child.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

function localNow() {
  return new Date().toLocaleString('en-GB', {
    timeZone: TZ, hour12: false,
    weekday: 'short', hour: '2-digit', minute: '2-digit'
  }) + ` (${TZ})`;
}

// ── R3 enrichment worker — the AI layer, never merged into user fields ───────
// Serial queue in data/enrich-queue.json (survives restarts); each item is one
// `claude -p` call producing {trigger, trap, optimal_insight} → card.ai.
// Offline or failing → exponential backoff, 6 attempts, then parked as dead
// (the card stays user-only; POST /api/enrich/retry revives the parked ones).
let PROBLEMS = [];
try { PROBLEMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'problems.json'), 'utf8')); } catch {}
const problemEntry = name => {
  const k = String(name || '').toLowerCase();
  return PROBLEMS.find(p => p.canonical_name.toLowerCase() === k
    || (p.aliases || []).some(a => a.toLowerCase() === k)) || null;
};

let enrichBusy = false;
async function processEnrichQueue() {
  if (process.env.P435_NO_ENRICH) return; // sandboxed audits: queue mechanics only, no model calls
  if (enrichBusy) return;
  enrichBusy = true;
  try {
    for (;;) {
      const queue = readDoc('enrich');
      const item = queue.find(q => !q.dead && (!q.nextTry || q.nextTry <= Date.now()));
      if (!item) break;
      const cards = readDoc('cards');
      const card = cards.find(c => c.id === item.cardId);
      if (!card || card.ai) { // gone or already enriched — drop the item
        writeDoc('enrich', queue.filter(q => q !== item));
        continue;
      }
      const entry = problemEntry(card.problem);
      const ctx = item.context || {};
      const prompt = `You are the enrichment layer of Project 435's pattern-card system for a competitive programmer (C++). Given his solve of a DSA problem, produce the canonical card fields he did NOT write himself. Output ONLY a JSON object, no fences, no prose:
{"trigger": "<ONE line: what in a problem statement screams this pattern>",
 "trap": "<ONE line: the classic mistake / edge case that kills solutions>",
 "optimal_insight": "<ONE line: the NAMED trick that unlocks the optimal tier>"}

Problem: ${card.problem}
${entry ? `Canonical sheet entry: trigger=${JSON.stringify(entry.trigger)}, pattern=${JSON.stringify(entry.pattern)}, trap=${JSON.stringify(entry.trap)}, depth_tiers=${JSON.stringify(entry.depth_tiers)}` : 'Canonical sheet entry: none on file'}
His pattern: ${card.pattern || '—'}
His classification at solve start: ${ctx.classification || '—'}
His one-line observation: ${card.note || card.trap || '—'}
Outcome: ${ctx.outcome || '—'}${ctx.minutes != null ? ` in ${ctx.minutes} min` : ''}
${ctx.depth ? `Depth result: alone=${ctx.depth.alone ?? 'none'}, final=${ctx.depth.final}, source=${ctx.depth.source}` : ''}`;
      try {
        const raw = await runCoach('You produce strict JSON card enrichments. JSON only.', prompt, COACH_CFG.models.l1_3);
        const m = raw.match(/\{[\s\S]*\}/);
        const ai = JSON.parse(m ? m[0] : raw);
        if (!ai.trigger || !ai.trap || !ai.optimal_insight) throw new Error('incomplete enrichment');
        card.ai = {
          trigger: String(ai.trigger), trap: String(ai.trap),
          optimal_insight: String(ai.optimal_insight),
          model: COACH_CFG.models.l1_3, ts: Date.now()
        };
        writeDoc('cards', cards);
        writeDoc('enrich', readDoc('enrich').filter(q => q.cardId !== item.cardId));
        console.log(`  card.ai ✓ ${card.problem}`);
      } catch (e) {
        const q2 = readDoc('enrich');
        const it = q2.find(q => q.cardId === item.cardId);
        if (it) {
          it.attempts = (it.attempts || 0) + 1;
          if (it.attempts >= 6) { it.dead = true; console.log(`  card.ai parked (dead) for ${card.problem}: ${e.message}`); }
          else it.nextTry = Date.now() + Math.min(60, 2 ** it.attempts) * 60000;
          writeDoc('enrich', q2);
        }
        if (!it || it.dead) continue;
        break; // backoff window — the interval timer will return here
      }
    }
  } finally {
    enrichBusy = false;
  }
}

function readDoc(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, DOCS[name].file), 'utf8'));
  } catch {
    return structuredClone(DOCS[name].def);
  }
}

function writeDoc(name, doc) {
  const p = path.join(DATA, DOCS[name].file);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, p);
}

// ── SEASON 2 no-reset guard (Regime 2, additive) ─────────────────────────────
// Proves the live record is never reset or mutated by the second attempt. On the
// first Season-2 boot it captures a baseline (original log ids + aggregate sig,
// card ids + sig SANS .ai, per-sealed-day snapshot hash) into campaign.json.
// Every later boot re-verifies: every original log id still present + unchanged,
// cards changed ONLY by gaining .ai, no sealed past day altered. READ-ONLY w.r.t.
// the guarded files — it writes ONLY campaign.json, surfaces drift as a banner,
// and NEVER repairs/rewrites data. Mirrors audit.mjs explainLiveDrift.
let s2drift = null;
const h16 = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const ROWSIG = r => `${r.id}|${r.problem}|${r.date}|${r.tier}|${r.outcome}|${r.forDay || ''}|${r.upsolve ? 1 : 0}`;
const CARDSIG = c => `${c.id}|${c.problem || c.topic || ''}|${c.kind || ''}|${c.pattern || ''}`; // excludes .ai (async layer)
const aggSig = (arr, fn, idSet) => h16(arr.filter(x => !idSet || idSet.has(x.id)).map(fn).sort().join('\n'));
function captureBaseline(log, cards, days) {
  const sealed = {};
  for (const d of Object.keys(days)) if (days[d]?.sealed) sealed[d] = h16(JSON.stringify(days[d].sealed));
  return {
    capturedAt: Date.now(),
    logIds: log.map(r => r.id), logSig: aggSig(log, ROWSIG),
    cardIds: cards.map(c => c.id), cardSig: aggSig(cards, CARDSIG),
    sealed
  };
}
function season2Guard() {
  const camp = readDoc('campaign');
  const log = readDoc('log'), cards = readDoc('cards'), days = readDoc('days');
  if (!camp.baseline) {
    camp.baseline = captureBaseline(log, cards, days);
    writeDoc('campaign', camp);
    console.log(`  §S2 no-reset baseline captured: ${log.length} log rows, ${cards.length} cards, ${Object.keys(camp.baseline.sealed).length} sealed days.`);
    return;
  }
  const b = camp.baseline;
  const drift = [];
  const haveLog = new Set(log.map(r => r.id)), haveCard = new Set(cards.map(c => c.id));
  const goneLog = (b.logIds || []).filter(id => !haveLog.has(id));
  const goneCard = (b.cardIds || []).filter(id => !haveCard.has(id));
  if (goneLog.length) drift.push(`${goneLog.length} original log row(s) removed`);
  else if (aggSig(log, ROWSIG, new Set(b.logIds)) !== b.logSig) drift.push('an original log row was edited');
  if (goneCard.length) drift.push(`${goneCard.length} original card(s) removed`);
  else if (aggSig(cards, CARDSIG, new Set(b.cardIds)) !== b.cardSig) drift.push('an original card was edited');
  for (const d of Object.keys(b.sealed || {})) {
    if (!days[d]?.sealed) drift.push(`sealed day ${d} lost`);
    else if (h16(JSON.stringify(days[d].sealed)) !== b.sealed[d]) drift.push(`sealed day ${d} changed`);
  }
  s2drift = drift.length ? drift.join('; ') : null;
  console.log(s2drift ? `  §S2 DRIFT WARNING: ${s2drift}` : '  §S2 no-reset guard: live Season-1 record intact ✓');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : null); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  const payload = (typeof body === 'string' || Buffer.isBuffer(body)) ? body : JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'   // stored bytes are never re-sniffed as script
  });
  res.end(payload);
}

async function handleApi(req, res, url) {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /api/state') {
    sealPastDays();
    return send(res, 200, {
      log: readDoc('log'), cards: readDoc('cards'), days: readDoc('days'),
      ladder: readDoc('ladder'), session: readDoc('session'), reviews: readDoc('reviews'),
      mocks: readDoc('mocks'), candidates: readDoc('candidates'),
      campaign: readDoc('campaign'), s2drift, // SEASON 2: cursor doc + no-reset drift banner
      dp: readDoc('dp'), cfAscent: readDoc('cfAscent'), // SEASON 2 W6: track state
      corecs: readDoc('corecs'), sysd: readDoc('sysd'), // SEASON 2 W7: track state
      oaSims: readDoc('oaSims'), interviews: readDoc('interviews'), companies: readDoc('companies'), // SEASON 2 W8
      arena: readDoc('arena'), doctrine: readDoc('doctrine'), grill: readDoc('grill'), warplan: readDoc('warplan') // SEASON 3
    });
  }

  if (route === 'POST /api/log') {
    const row = await readBody(req);
    row.id = row.id || crypto.randomUUID();
    row.ts = row.ts || Date.now();
    const log = readDoc('log');
    log.push(row);
    writeDoc('log', log);
    return send(res, 200, { ok: true, row });
  }

  if (route === 'POST /api/log/delete') {
    const { id } = await readBody(req);
    const log = readDoc('log').filter(r => r.id !== id);
    writeDoc('log', log);
    return send(res, 200, { ok: true });
  }

  if (route === 'POST /api/cards') {
    const card = await readBody(req);
    card.id = card.id || crypto.randomUUID();
    card.ts = card.ts || Date.now();
    const context = card.enrich; // queue context rides the request, not the card
    delete card.enrich;
    const cards = readDoc('cards');
    cards.push(card);
    writeDoc('cards', cards);
    // SEASON 2 enrichment allow-list: only DSA solve-cards (kind undefined) and
    // dp-cards get the async card.ai layer. B-cards are already canonical; the
    // produce-from-blank kinds (corecs/sysd/cp/star/project/synth) carry their
    // own answer text and must NOT fire a claude -p round-trip on save.
    // SEASON 3: cards that arrive WITH a shipped canonical (arena reps) need no
    // AI layer either — the bank already carries the definitive answer.
    if ((!card.kind || card.kind === 'dp') && !card.canonical) {
      const queue = readDoc('enrich');
      queue.push({ cardId: card.id, context: context || null, attempts: 0, ts: Date.now() });
      writeDoc('enrich', queue);
      processEnrichQueue(); // fire and forget — save stays instant
    }
    return send(res, 200, { ok: true, card });
  }

  if (route === 'GET /api/cf') {
    return send(res, 200, await cfSync(url.searchParams.get('force') === '1'));
  }

  if (route === 'GET /api/enrich') {
    const queue = readDoc('enrich');
    return send(res, 200, {
      pending: queue.filter(q => !q.dead).length,
      dead: queue.filter(q => q.dead).length
    });
  }

  if (route === 'POST /api/enrich/retry') { // revive parked items (offline → retry queue)
    const queue = readDoc('enrich');
    for (const q of queue) { delete q.dead; delete q.nextTry; q.attempts = 0; }
    writeDoc('enrich', queue);
    processEnrichQueue();
    return send(res, 200, { ok: true, pending: queue.length });
  }

  if (req.method === 'PUT' && /^\/api\/(days|ladder|session|reviews|mocks|candidates|campaign|dp|cfAscent|corecs|sysd|oaSims|interviews|companies|arena|doctrine|grill|warplan)$/.test(url.pathname)) {
    const name = url.pathname.split('/')[2];
    writeDoc(name, await readBody(req));
    return send(res, 200, { ok: true });
  }

  // evidence cards: shareable end-of-day PNGs, kept like the data files
  if (route === 'POST /api/evidence') {
    const { date, png } = await readBody(req);
    // receipt names: day cards (2026-06-12) and mock cards (mock-1-2026-06-12)
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(date || '')) return send(res, 400, { error: 'bad name' });
    const b64 = String(png || '').replace(/^data:image\/png;base64,/, '');
    fs.mkdirSync(EVIDENCE, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE, `${date}.png`), Buffer.from(b64, 'base64'));
    return send(res, 200, { ok: true, file: `${date}.png` });
  }

  if (route === 'GET /api/evidence') {
    let files = [];
    try { files = fs.readdirSync(EVIDENCE).filter(f => f.endsWith('.png')).sort().reverse(); } catch {}
    return send(res, 200, files);
  }

  if (route === 'GET /api/coach') {
    const slug = coachSlug(url.searchParams.get('problem') || '');
    return send(res, 200, { transcript: readTranscript(slug) });
  }

  if (route === 'POST /api/coach') {
    const { problem, message, level = 1, context = {} } = await readBody(req) || {};
    if (!problem || !message) return send(res, 400, { error: 'problem and message required' });
    const slug = coachSlug(problem);
    const transcript = readTranscript(slug);

    // context auto-attached by the app — visible in the saved transcript
    const ctxLines = [
      `Problem: ${problem}`,
      context.classification ? `Their pattern classification: ${context.classification}` : null,
      context.minutes != null ? `Minutes on the clock: ${context.minutes} of 35` : null,
      context.ceilingHit ? 'The 35-minute ceiling HAS been hit.' : 'The 35-minute ceiling has NOT been hit yet.',
      context.dryRun ? `Their smallest failing input (debug): ${context.dryRun}` : null,
      `Escalation level explicitly granted: L${level} — respond at exactly this level, never above.`,
      `Their current local time: ${localNow()}`
    ].filter(Boolean).join('\n');

    const history = transcript.slice(-(COACH_CFG.max_context_turns || 10))
      .map(m => `${m.role === 'coach' ? 'Coach' : USER_NAME}: ${m.content}`).join('\n\n');
    const userPrompt = (history ? `Previous exchanges on this problem:\n\n${history}\n\n` : '')
      + `${USER_NAME} (L${level}): ${message}`;
    const system = `${COACH_SYSTEM}\n=== Live session context (auto-attached by the app) ===\n${ctxLines}`;

    const model = level >= 4 ? COACH_CFG.models.l4_5 : COACH_CFG.models.l1_3;
    try {
      const reply = await runCoach(system, userPrompt, model);
      transcript.push(
        { role: 'user', content: message, level, ts: Date.now(), context: ctxLines },
        { role: 'coach', content: reply, level, model, ts: Date.now() }
      );
      writeTranscript(slug, transcript);
      return send(res, 200, { reply, transcript });
    } catch (e) {
      return send(res, 502, { error: String(e.message || e) });
    }
  }

  // SEASON 3 — the Grill Room's Socratic project interviewer. Same keyless
  // claude -p path as the Coach, but a project-defense persona (grill-system.txt)
  // with the project's dossier brief injected server-side from grill.s3.json.
  // Transcripts live beside coach transcripts: data/coach/grill-<project>.json.
  if (route === 'GET /api/grill/coach') {
    const slug = coachSlug('grill ' + (url.searchParams.get('project') || ''));
    return send(res, 200, { transcript: readTranscript(slug) });
  }

  if (route === 'POST /api/grill/coach') {
    const { project, message, hard = false } = await readBody(req) || {};
    if (!project || !message) return send(res, 400, { error: 'project and message required' });
    let sys = null, brief = null, pname = project;
    try { sys = fillName(fs.readFileSync(path.join(ROOT, 'grill-system.txt'), 'utf8')); } catch {}
    if (!sys) return send(res, 500, { error: 'grill-system.txt missing' });
    try {
      // Same fallback as the static route: your private dossiers if you wrote
      // them, the shipped examples otherwise — so the mock interviewer always
      // has a brief to work from.
      const g = JSON.parse(fs.readFileSync(dossierFile(), 'utf8'));
      const p = (g.projects || []).find(x => x.id === project);
      brief = p?.coach_brief || null; pname = p?.name || project;
    } catch {}
    const slug = coachSlug('grill ' + project);
    const transcript = readTranscript(slug);
    const history = transcript.slice(-(COACH_CFG.max_context_turns || 10))
      .map(m => `${m.role === 'grill' ? 'Interviewer' : USER_NAME}: ${m.content}`).join('\n\n');
    const system = `${sys}\n=== The project under grilling: ${pname} ===\n${brief || "(no dossier brief on file — grill from the candidate's own statements)"}`;
    const userPrompt = (history ? `Previous exchanges:\n\n${history}\n\n` : '') + `${USER_NAME}: ${message}`;
    const model = hard ? COACH_CFG.models.l4_5 : COACH_CFG.models.l1_3;
    try {
      const reply = await runCoach(system, userPrompt, model);
      transcript.push(
        { role: 'user', content: message, ts: Date.now() },
        { role: 'grill', content: reply, model, ts: Date.now() }
      );
      writeTranscript(slug, transcript);
      return send(res, 200, { reply, transcript });
    } catch (e) {
      return send(res, 502, { error: String(e.message || e) });
    }
  }

  // Coach nightly debrief (Wave 4 feature 6): ONE call, three lines —
  // what drifted, what held, tomorrow's watch-item (threads into the
  // next morning's briefing). Saved at reviews[date].debrief.
  if (route === 'POST /api/debrief') {
    const { date, summary } = await readBody(req) || {};
    if (!date || !summary) return send(res, 400, { error: 'date and summary required' });
    const prompt = `You are Coach (War Room) closing ${USER_NAME}'s training day. Below is the day's summary. Output ONLY a JSON object, no fences:
{"drifted": "<ONE blunt line: what drifted today>",
 "held": "<ONE line: what held / worked>",
 "watch": "<ONE line: tomorrow's single watch-item, concrete>"}

${summary}`;
    try {
      const raw = await runCoach('You produce strict JSON debriefs. JSON only. Blunt, specific, no cheerleading.', prompt, COACH_CFG.models.l1_3);
      const m = raw.match(/\{[\s\S]*\}/);
      const j = JSON.parse(m ? m[0] : raw);
      if (!j.drifted || !j.held || !j.watch) throw new Error('incomplete debrief');
      const reviews = readDoc('reviews');
      reviews[date] = { ...(reviews[date] || {}), debrief: { drifted: String(j.drifted), held: String(j.held), watch: String(j.watch), model: COACH_CFG.models.l1_3, ts: Date.now() } };
      writeDoc('reviews', reviews);
      return send(res, 200, { ok: true, debrief: reviews[date].debrief });
    } catch (e) {
      return send(res, 502, { error: String(e.message || e) });
    }
  }

  // takeover protocol: a newer instance asks this one to hand over the port.
  // The custom header keeps cross-origin browser pages from triggering it.
  if (route === 'POST /api/shutdown') {
    if (req.headers['x-p435'] !== 'takeover') return send(res, 403, { error: 'forbidden' });
    send(res, 200, { ok: true, bye: true });
    console.log('  a newer WAR ROOM instance is taking the port — bye.');
    setTimeout(() => {
      server.closeAllConnections?.();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1000).unref(); // belt and braces
    }, 50);
    return;
  }

  return send(res, 404, { error: 'not found' });
}

function serveStatic(res, url) {
  let file;
  // The two date-bearing plans are served from memory, re-based onto your
  // start date (see loadConfig) — the files on disk are never rewritten.
  if (url.pathname === '/curriculum.json') {
    return send(res, 200, CURRICULUM);
  } else if (url.pathname === '/warplan.s3.json') {
    return send(res, 200, WARPLAN);
  } else if (url.pathname === '/grill.s3.json') {
    file = dossierFile();
  } else if (url.pathname === '/problems.json') {
    file = path.join(ROOT, 'problems.json'); // the trigger bank (Wave 4 item J)
  } else if (url.pathname === '/curriculum.s2.json') {
    file = path.join(ROOT, 'curriculum.s2.json'); // SEASON 2 static config — frozen curriculum.json stays pristine
  } else if (['/arena.s3.json', '/doctrine.s3.json'].includes(url.pathname)) {
    file = path.join(ROOT, url.pathname.slice(1)); // SEASON 3 shipped content — exact whitelist, never a wildcard
  } else if (url.pathname.startsWith('/evidence/')) {
    file = path.join(EVIDENCE, path.basename(url.pathname)); // saved evidence PNGs
  } else {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    file = path.join(PUBLIC, path.normalize(rel));
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, { error: 'forbidden' });
  }
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, { error: 'not found' });
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
  });
}

// The API has no auth, so two things must be impossible: a random web page you
// happen to visit driving it from your own browser (drive-by CSRF — a POST with
// text/plain needs no preflight, so CORS alone does NOT stop writes), and an
// attacker's domain re-pointing at 127.0.0.1 to become same-origin (DNS
// rebinding) and read your whole record. A missing Origin (curl, the test
// harness, the port-takeover ping) is fine — browsers always send one.
function originOk(req) {
  const host = String(req.headers.host || '');
  const name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (HOST === '127.0.0.1' && !['localhost', '127.0.0.1', '::1'].includes(name)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (!originOk(req)) return send(res, 403, { error: 'cross-origin request refused' });
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(res, url);
  } catch (e) {
    console.error(e);                       // details stay in your terminal
    send(res, 500, { error: 'internal error' });
  }
});

// ── EADDRINUSE, once and for all ─────────────────────────────────────────────
// A stale WAR ROOM instance (yesterday's terminal, a hidden window) gets
// asked to hand over the port; anything foreign gets a clear message instead
// of a stack trace. `npm start` should simply always work.
let takeoverTried = false;
server.on('error', async err => {
  if (err.code !== 'EADDRINUSE') { console.error(err); process.exit(1); }
  if (takeoverTried) {
    console.error(`\n  :${PORT} is still busy after a takeover attempt — the old`);
    console.error('  instance would not die. Find it:');
    console.error(`    Get-NetTCPConnection -LocalPort ${PORT} -State Listen\n`);
    process.exit(1);
  }
  takeoverTried = true;
  let ours = false;
  try {
    const r = await fetch(`http://localhost:${PORT}/api/state`, {
      signal: AbortSignal.timeout(2500), headers: { connection: 'close' }
    });
    const j = await r.json();
    ours = Array.isArray(j?.log) && 'session' in j;
  } catch {}
  if (!ours) {
    console.error(`\n  :${PORT} is held by something that is NOT a WAR ROOM server.`);
    console.error(`  Either stop it, or run on another port:  $env:P435_PORT='4351'; npm start\n`);
    process.exit(1);
  }
  console.log(`  an older WAR ROOM server holds :${PORT} — taking over…`);
  try {
    await fetch(`http://localhost:${PORT}/api/shutdown`, {
      method: 'POST', headers: { 'x-p435': 'takeover', connection: 'close' },
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
  for (let i = 0; i < 30; i++) { // wait for the port to actually free up
    await new Promise(r => setTimeout(r, 200));
    try {
      await fetch(`http://localhost:${PORT}/api/state`, { signal: AbortSignal.timeout(300), headers: { connection: 'close' } });
    } catch { break; } // connection refused = port is ours
  }
  server.listen(PORT, HOST);
});

server.on('listening', () => {
  sealPastDays();
  season2Guard(); // SEASON 2: capture/verify the no-reset baseline after sealing
  processEnrichQueue(); // the queue survives restarts — resume it [amendment]
  setInterval(processEnrichQueue, 90000).unref();
  console.log('');
  console.log('  PROJECT WAR ROOM');
  console.log(`  http://localhost:${PORT}`);
  // There is NO authentication on any endpoint, so by default we listen on
  // loopback only — nothing on your network can reach your record. Opening it
  // up is an explicit, deliberate act: P435_HOST=0.0.0.0.
  if (HOST === '127.0.0.1') {
    console.log('  (local only. To reach it from your phone: P435_HOST=0.0.0.0 — same Wi-Fi, trusted network only.)');
  } else {
    for (const addrs of Object.values(os.networkInterfaces()))
      for (const a of addrs || [])
        if (a.family === 'IPv4' && !a.internal)
          console.log(`  http://${a.address}:${PORT}   (LAN — add ?pwa=1 on phone to install)`);
    console.log('  ⚠  OPEN TO THE NETWORK — no password, no auth. Anyone who can reach');
    console.log('     this address can read and change your record. Trusted Wi-Fi only;');
    console.log('     never on campus/café/hotel networks. Off Wi-Fi? use tailscale.');
  }
  console.log('');
});
server.listen(PORT, HOST);
