// WAR ROOM — stats.js: the §5 stats engine (weak topics, pace, CSV, mock
// picker, end-of-sprint report). Pure functions, no DOM, no fetch — the
// browser and the audit (scripts/audit.mjs) run the same code. Regime 1 math
// stays in laws.js; this file may read its constants but never redefines law.
import { COMPLETIONS, OUTCOME_RANK, TIERB_CEIL_MIN, supplementSet } from './laws.js';

// §5.9 brief-fixed numbers: "4 problems … 90-minute interview-style timer"
export const MOCK_PROBLEMS = 4;
export const MOCK_MIN = 90;
// Topics with fewer Tier A attempts than this get a NEUTRAL weakScore and an
// (n<3) low-data mark everywhere they appear [user amendment 2026-06-12].
export const MIN_ATTEMPTS_FOR_SCORE = 3;

// a Tier A attempt row: real sheet work — never drill re-solves or upsolves
const isAttempt = r => r.tier === 'A' && r.outcome !== 'resolve' && !r.upsolve
  && (COMPLETIONS.has(r.outcome) || r.outcome === 'abandoned');

// ── problem → topic, from the curriculum lists ───────────────────────────────
export function topicIndex(cur) {
  const map = new Map();
  for (const d of cur.days) {
    for (const p of [...(d.tierA || []), ...(d.tierB || [])]) {
      if (!map.has(p)) map.set(p, { topic: d.focus, phase: d.phase, day: d.day });
    }
  }
  return map;
}

// ── weakScore v2: ONE documented definition of "weak", shared by the view,
// the radar and the mock picker [user amendment 2026-06-12; v2 = Wave 4 R6].
//   n < 3 Tier A attempts        → neutral 1.0, lowData: true
//   otherwise:
//     score = 1
//           + (1 − soloRate) × 2          // accuracy is the main signal (0..+2)
//           + min(flags, 3) × 0.4         // flagged problems pull up (0..+1.2)
//           + max(0, avgMin − 20) / 30    // chronic slowness drifts up
//           + approachWeak × 0.8          // R6: no working approach alone (0..+0.8)
//           + optWeak × 0.4               // R6: approach yes, optimal only with help (0..+0.4)
//     clamped to [0.5, 4]
// approachWeak/optWeak are rates over depth-known rows (old rows = unknown,
// excluded). approach-weak ≫ optimization-weak in cost: re-LEARN beats
// re-OPTIMIZE on Days 19–20, hence the 2× factor. Constants reviewed at the
// Day 15–16 recalibration checkpoint (PROGRESS.md).
export function weakScore({ attempts, soloRate, flags, avgMin, approachWeak = 0, optWeak = 0 }) {
  if (attempts < MIN_ATTEMPTS_FOR_SCORE) return { score: 1, lowData: true };
  const s = 1
    + (1 - soloRate) * 2
    + Math.min(flags, 3) * 0.4
    + Math.max(0, (avgMin ?? 0) - 20) / 30
    + approachWeak * 0.8
    + optWeak * 0.4;
  return { score: Math.min(4, Math.max(0.5, s)), lowData: false };
}

// ── R6 depth ledger derivations ──────────────────────────────────────────────
// A row carries depth when Wave 4's exit flow stamped it: depth_alone (null =
// no working approach alone), depth_final, depth_top (the problem's deepest
// tier), depth_source (editorial > coach > approach-read > solo).
const hasDepth = r => !!r.depth_top;

// the headline: how often does he reach the OPTIMAL tier completely alone?
export function soloOptimalRate(log) {
  const rows = log.filter(r => isAttempt(r) && hasDepth(r));
  const solo = rows.filter(r => r.depth_alone === r.depth_top).length;
  return {
    rate: rows.length ? Math.round(solo / rows.length * 100) : null,
    n: rows.length,
    lowData: rows.length < MIN_ATTEMPTS_FOR_SCORE
  };
}

// the gap pile: reached optimal, but not alone — each one is a named trick
// away from being interview-ready (trick = card.ai.optimal_insight when the
// enrichment layer has it)
export function gapPile(cur, log, cards = []) {
  const idx = topicIndex(cur);
  const latest = new Map(); // problem -> most recent depth-stamped attempt
  for (const r of log) {
    if (!isAttempt(r) || !hasDepth(r)) continue;
    const prev = latest.get(r.problem);
    if (!prev || (r.ts || 0) > (prev.ts || 0)) latest.set(r.problem, r);
  }
  const out = [];
  for (const [problem, r] of latest) {
    if (r.depth_final === r.depth_top && r.depth_alone !== r.depth_top) {
      const card = cards.filter(c => c.problem === problem && c.ai?.optimal_insight).pop();
      out.push({
        problem, topic: idx.get(problem)?.topic ?? 'off-sheet',
        source: r.depth_source ?? null, trick: card?.ai?.optimal_insight ?? null
      });
    }
  }
  return out;
}

// ── per-topic accuracy / speed readout (§5.8) ────────────────────────────────
export function topicStats(cur, log) {
  const idx = topicIndex(cur);
  const topics = new Map();
  const get = name => {
    if (!topics.has(name)) topics.set(name, {
      topic: name, attempts: 0, solo: 0, hint: 0, editorial: 0, abandoned: 0,
      mins: [], flags: 0, bReps: 0, bLate: 0, bOver: 0,
      depthN: 0, noApproach: 0, notOptimalAlone: 0
    });
    return topics.get(name);
  };
  for (const r of log) {
    const home = idx.get(r.problem);
    if (!home) continue; // off-sheet (ladder fills, contest upsolves)
    const t = get(home.topic);
    if (isAttempt(r)) {
      t.attempts++;
      t[r.outcome]++;
      if (typeof r.minutes === 'number') t.mins.push(r.minutes);
      if (r.flag) t.flags++;
      if (hasDepth(r)) { // R6: approach-weak vs optimization-weak
        t.depthN++;
        if (!r.depth_alone) t.noApproach++;
        else if (r.depth_alone !== r.depth_top) t.notOptimalAlone++;
      }
    } else if (r.tier === 'B' && r.outcome === 'recognized') {
      t.bReps++;
      if (r.classified_in_time === false) t.bLate++;
      if (typeof r.minutes === 'number' && r.minutes > TIERB_CEIL_MIN) t.bOver++;
    }
  }
  const rows = [];
  for (const t of topics.values()) {
    const soloRate = t.attempts ? t.solo / t.attempts : 0;
    const avgMin = t.mins.length ? t.mins.reduce((a, b) => a + b, 0) / t.mins.length : null;
    const approachWeak = t.depthN ? t.noApproach / t.depthN : 0;
    const optWeak = t.depthN ? t.notOptimalAlone / t.depthN : 0;
    const { score, lowData } = weakScore({ attempts: t.attempts, soloRate, flags: t.flags, avgMin, approachWeak, optWeak });
    rows.push({
      ...t, mins: undefined,
      soloRate: t.attempts ? Math.round(soloRate * 100) : null,
      avgMin: avgMin == null ? null : Math.round(avgMin * 10) / 10,
      weak: score, lowData,
      approachWeak: Math.round(approachWeak * 100), optWeak: Math.round(optWeak * 100),
      weakKind: !t.depthN ? null : approachWeak >= optWeak && approachWeak > 0 ? 'approach-weak'
        : optWeak > 0 ? 'optimization-weak' : null
    });
  }
  // weakest first; low-data topics sink below scored ones, then by activity
  rows.sort((a, b) => (a.lowData !== b.lowData) ? (a.lowData ? 1 : -1)
    : (b.weak - a.weak) || (b.attempts - a.attempts));
  return rows;
}

// the §5.8 purpose: "decides what Days 19–20 patch" — the weakest topics'
// flagged/hinted problems, ready to click into solve mode. Wave 4 splits it:
// re-LEARN (no working approach — flagged/hinted/editorial rows) vs
// re-OPTIMIZE (the gap pile — reached optimal, but only with help).
export function patchList(cur, log, topN = 3) {
  const idx = topicIndex(cur);
  const weakTopics = topicStats(cur, log).filter(t => !t.lowData).slice(0, topN).map(t => t.topic);
  const best = new Map();
  for (const r of log) {
    if (!isAttempt(r)) continue;
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]
      || (r.flag && !prev.flag)) best.set(r.problem, r);
  }
  // a struggling problem is re-OPTIMIZE when the gap pile owns it (approach
  // came alone, optimal needed help) — re-LEARN otherwise; gap problems are
  // hint/editorial rows by definition, so membership decides, not outcome
  const gaps = new Set(gapPile(cur, log).map(g => g.problem));
  const out = [];
  for (const [problem, r] of best) {
    const home = idx.get(problem);
    if (!home || !weakTopics.includes(home.topic)) continue;
    if (r.flag || r.outcome === 'hint' || r.outcome === 'editorial' || r.outcome === 'abandoned') {
      out.push({
        problem, topic: home.topic, outcome: r.outcome, flag: !!r.flag,
        kind: gaps.has(problem) ? 're-optimize' : 're-learn'
      });
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 're-learn' ? -1 : 1)
    || (b.flag - a.flag) || ((OUTCOME_RANK[a.outcome] ?? 0) - (OUTCOME_RANK[b.outcome] ?? 0)));
  return out;
}

// ── pace: the 435 line vs actual ─────────────────────────────────────────────
// Target: baseline → 435 hitting 435 ON DAY 18 (meta.mission: "Sheet 100%
// touched by end of Day 18"), flat through 19–20. Actual: cumulative DISTINCT
// touched problems by date — Tier B recognitions count (435-by-D18 is
// impossible on Tier A alone) [user amendment 2026-06-12]; abandoned rows,
// drill re-solves, upsolves and supplements never count (sheetCount's rules).
export function paceSeries(cur, log, todayStr) {
  const baseline = cur.meta.baseline_done ?? 0;
  const supp = supplementSet(cur);
  const touchDates = new Map(); // problem -> first qualifying date
  for (const r of log) {
    if (r.outcome === 'abandoned' || r.outcome === 'resolve' || r.upsolve || supp.has(r.problem)) continue;
    const prev = touchDates.get(r.problem);
    if (!prev || r.date < prev) touchDates.set(r.problem, r.date);
  }
  const days = [{ day: 0, date: null, target: baseline, actual: baseline }];
  let cum = baseline;
  const byDate = new Map();
  for (const d of touchDates.values()) byDate.set(d, (byDate.get(d) || 0) + 1);
  // warm-up work (dated before day 1) lands on the day-0 point
  let warm = 0;
  for (const [date, n] of byDate) if (date < cur.days[0].date) warm += n;
  cum += warm;
  days[0].actual = cum;
  for (const d of cur.days) {
    const target = d.day <= 18
      ? Math.round(baseline + (435 - baseline) * d.day / 18)
      : 435;
    let actual = null;
    if (d.date <= todayStr) {
      cum += byDate.get(d.date) || 0;
      actual = cum;
    }
    days.push({ day: d.day, date: d.date, target, actual });
  }
  const sheet = cum;
  const todayN = Math.max(0, Math.min(20,
    Math.floor((Date.parse(todayStr) - Date.parse(cur.meta.start_date)) / 864e5) + 1));
  const daysLeft = Math.max(1, 18 - todayN + 1);
  const remaining = Math.max(0, 435 - sheet);
  return { baseline, days, sheet, todayN, required: { perDay: Math.ceil(remaining / daysLeft), daysLeft, remaining } };
}

// ── CSV export (§5.8) ────────────────────────────────────────────────────────
const CSV_COLS = ['date', 'day', 'forDay', 'problem', 'tier', 'outcome', 'minutes', 'flag',
  'classification', 'sketch', 'verified', 'classified_in_time', 'beat',
  'pause_count', 'paused_minutes', 'upsolve', 'source', 'dry_run', 'ts', 'id'];

export function toCsv(log) {
  const cell = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLS.join(','), ...log.map(r => CSV_COLS.map(c => cell(r[c])).join(','))].join('\n');
}

// ── readiness map (slate #4): forward-looking "interview-ready %" per topic ──
// The weak-topic table says what to PATCH (backward). Readiness says whether a
// topic is placement-ready (forward): the solo-OPTIMAL rate (the interview
// signal), discounted for thin data and stale practice, plus the single thing
// to fix next. Sorted least-ready first.
export function readiness(cur, log, todayStr) {
  const idx = topicIndex(cur);
  const stats = topicStats(cur, log);
  const gaps = gapPile(cur, log);
  const lastDate = new Map();
  const flagBest = new Map(); // topic -> a problem whose best outcome isn't solo
  const best = new Map();
  for (const r of log) {
    if (!isAttempt(r)) continue;
    const t = idx.get(r.problem)?.topic;
    if (t && (!lastDate.has(t) || r.date > lastDate.get(t))) lastDate.set(t, r.date);
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome] || (r.flag && !prev.flag)) best.set(r.problem, r);
  }
  for (const [problem, r] of best) {
    const t = idx.get(problem)?.topic;
    if (t && !flagBest.has(t) && (r.flag || r.outcome === 'hint' || r.outcome === 'editorial' || r.outcome === 'abandoned')) flagBest.set(t, problem);
  }
  const out = [];
  for (const t of stats) {
    if (!t.attempts) continue;
    const soloOpt = t.depthN ? (t.depthN - t.noApproach - t.notOptimalAlone) / t.depthN : (t.soloRate ?? 0) / 100;
    const conf = Math.max(0.4, Math.min(1, t.attempts / 4));
    const days = lastDate.has(t.topic) ? Math.round((Date.parse(todayStr) - Date.parse(lastDate.get(t.topic))) / 864e5) : 99;
    const rec = days <= 3 ? 1 : days <= 7 ? 0.9 : 0.8;
    const ready = Math.round(100 * soloOpt * conf * rec);
    const gap = gaps.find(g => g.topic === t.topic);
    const fix = gap ? { problem: gap.problem, kind: 're-optimize', trick: gap.trick }
      : flagBest.has(t.topic) ? { problem: flagBest.get(t.topic), kind: 're-learn' } : null;
    out.push({ topic: t.topic, ready, soloOpt: Math.round(soloOpt * 100), attempts: t.attempts, lowData: t.lowData, staleDays: days, fix });
  }
  out.sort((a, b) => a.ready - b.ready);
  return out;
}

// ── §5.9 mock picker: 4 problems across topics, weighted weak/flagged ────────
// Pool: distinct logged Tier A attempts (sheet work only). Problem weight =
// (flag 4 / editorial 3 / hint 2 / solo 1) × its topic's weakScore (neutral if
// low-data) × 1.25 if it sits in the R6 gap pile (optimal only with help).
// Problems drilled (re-solved) within the last 2 days are excluded
// [user amendment]. Topics stay distinct while enough distinct topics remain.
export function mockPick(cur, log, todayStr, rand = Math.random) {
  const idx = topicIndex(cur);
  const tstats = new Map(topicStats(cur, log).map(t => [t.topic, t]));
  const gapSet = new Set(gapPile(cur, log).map(g => g.problem));
  const recentDrill = new Set();
  for (const r of log) {
    if (r.outcome === 'resolve' && Date.parse(todayStr) - Date.parse(r.date) <= 2 * 864e5)
      recentDrill.add(r.problem);
  }
  const best = new Map();
  for (const r of log) {
    if (!isAttempt(r)) continue;
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]) best.set(r.problem, { ...r, flag: r.flag || prev?.flag });
    else if (r.flag) prev.flag = true;
  }
  const pool = [];
  for (const [problem, r] of best) {
    if (recentDrill.has(problem)) continue;
    const home = idx.get(problem);
    const topic = home?.topic ?? 'off-sheet';
    const struggle = r.flag ? 4 : r.outcome === 'editorial' ? 3 : r.outcome === 'hint' ? 2 : 1;
    const tw = tstats.get(topic);
    const weight = struggle * (tw && !tw.lowData ? tw.weak : 1) * (gapSet.has(problem) ? 1.25 : 1);
    const why = r.flag ? '⚑ flagged' : gapSet.has(problem) ? 'gap: optimal via help'
      : r.outcome !== 'solo' ? r.outcome
      : tw && !tw.lowData && tw.weak > 1.6 ? 'weak topic' : 'solo';
    pool.push({ problem, topic, weight, why });
  }
  if (!pool.length) return null;
  const picks = [];
  const usedTopics = new Set();
  while (picks.length < MOCK_PROBLEMS && pool.length) {
    let candidates = pool.filter(p => !usedTopics.has(p.topic));
    if (!candidates.length) candidates = pool; // fewer topics than slots: fill anyway
    let t = rand() * candidates.reduce((s, p) => s + p.weight, 0);
    let pick = candidates[candidates.length - 1];
    for (const p of candidates) { if ((t -= p.weight) <= 0) { pick = p; break; } }
    picks.push({ problem: pick.problem, topic: pick.topic, why: pick.why });
    usedTopics.add(pick.topic);
    pool.splice(pool.indexOf(pick), 1);
  }
  return { problems: picks, minutes: MOCK_MIN };
}

// ── Architect export (Wave 4 feature 7): one compact status block ────────────
// day, pace, W–L, weak topics (v2 split), top-5 gap list, flags, anomalies —
// markdown, ready to paste into the architect chat.
export function architectExport(cur, state, todayStr, Laws) {
  const log = state.log;
  const p = paceSeries(cur, log, todayStr);
  const rec = Laws.record(cur, state, todayStr);
  const topics = topicStats(cur, log).filter(t => !t.lowData).slice(0, 4);
  const gaps = gapPile(cur, log, state.cards).slice(0, 5);
  const so = soloOptimalRate(log);
  const attempts = log.filter(isAttempt);
  const flags = [...new Set(log.filter(r => r.flag).map(r => r.problem))];
  const anomalies = [];
  const heavyPause = log.filter(r => Laws.pauseMarker(r)).length;
  if (heavyPause) anomalies.push(`${heavyPause} heavy-pause rows (⏸)`);
  const late = log.filter(r => r.classified_in_time === false).length;
  if (late) anomalies.push(`${late} late classifications`);
  const overB = log.filter(r => r.tier === 'B' && r.minutes > 7).length;
  if (overB) anomalies.push(`${overB} B reps over the 7:00 ceiling`);
  const abandoned = log.filter(r => r.outcome === 'abandoned').length;
  if (abandoned) anomalies.push(`${abandoned} abandoned`);
  return [
    `## P435 status — Day ${p.todayN}/20 (${todayStr})`,
    `- sheet: **${p.sheet}/435** (target ${p.days.find(d => d.day === Math.min(p.todayN, 20))?.target ?? 435}) · need ${p.required.perDay}/day · ${p.required.daysLeft}d to D18`,
    `- record: **${rec.wins}W–${rec.losses}L** · streak ${rec.streak} · solo rate ${attempts.length ? Math.round(attempts.filter(r => r.outcome === 'solo').length / attempts.length * 100) : 0}% (${attempts.length} attempts) · solo-OPTIMAL ${so.rate ?? '—'}%${so.lowData ? ` (n=${so.n})` : ''}`,
    `- weak topics: ${topics.length ? topics.map(t => `${t.topic} (${t.weak.toFixed(1)}${t.weakKind ? `, ${t.weakKind}` : ''})`).join(' · ') : 'all n<3 — neutral'}`,
    `- gap list (optimal via help): ${gaps.length ? gaps.map(g => g.problem).join(' · ') : 'empty'}`,
    `- flags for D19–20: ${flags.length ? `${flags.length} — ${flags.slice(0, 8).join(' · ')}${flags.length > 8 ? ' …' : ''}` : 'none'}`,
    `- anomalies: ${anomalies.length ? anomalies.join(' · ') : 'none'}`
  ].join('\n');
}

// ── boss pile (slate #3): the Day 19–20 gauntlet ────────────────────────────
// Every flagged problem + every gap-pile problem is a "boss" until it falls to
// a clean solo solve. Returns the standing bosses (hardest — flagged/struggle —
// first), the count already cleared, and the total. Pure; the view adds the
// canonical-pattern fallback for the trick.
export function bossPile(cur, log, cards = []) {
  const idx = topicIndex(cur);
  const best = new Map(), struggle = new Map(), flaggedEver = new Set();
  for (const r of log) {
    if (!isAttempt(r)) continue;
    if (r.flag) flaggedEver.add(r.problem);
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]) best.set(r.problem, r);
    if (r.struggle) struggle.set(r.problem, r.struggle);
  }
  const gaps = new Map(gapPile(cur, log, cards).map(g => [g.problem, g]));
  const candidates = new Set([...flaggedEver, ...gaps.keys()]);
  const bosses = []; let cleared = 0;
  for (const p of candidates) {
    const b = best.get(p);
    if (b?.outcome === 'solo') { cleared++; continue; }
    bosses.push({
      problem: p, topic: idx.get(p)?.topic ?? 'off-sheet',
      lastOutcome: b?.outcome ?? 'unknown', flagged: flaggedEver.has(p),
      struggle: struggle.get(p) ?? null, trick: gaps.get(p)?.trick ?? null,
      kind: gaps.has(p) && !flaggedEver.has(p) ? 'gap' : 'flag'
    });
  }
  bosses.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'flag' ? -1 : 1)
    || (b.struggle ? 1 : 0) - (a.struggle ? 1 : 0));
  return { bosses, cleared, total: bosses.length + cleared };
}

// ── Day 20 end-of-sprint report data (curriculum day-20 note) ────────────────
export function reportData(cur, state, todayStr) {
  const log = state.log;
  const attempts = log.filter(isAttempt);
  const solo = attempts.filter(r => r.outcome === 'solo').length;
  const byWeek = [1, 2, 3].map(w => {
    const rows = attempts.filter(r => r.day >= (w - 1) * 7 + 1 && r.day <= w * 7);
    const s = rows.filter(r => r.outcome === 'solo').length;
    return { week: w, attempts: rows.length, soloRate: rows.length ? Math.round(s / rows.length * 100) : null };
  });
  const curve = cur.days.map(d => {
    const mins = attempts.filter(r => r.date === d.date && typeof r.minutes === 'number').map(r => r.minutes);
    return { day: d.day, avg: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length * 10) / 10 : null };
  });
  const radar = topicStats(cur, log)
    .filter(t => t.attempts > 0)
    .sort((a, b) => b.attempts - a.attempts).slice(0, 8)
    .map(t => ({ topic: t.topic, soloRate: t.soloRate ?? 0, n: t.attempts, lowData: t.lowData }));
  // flagged pool remaining: flagged problems whose best outcome still isn't solo
  const best = new Map();
  let flaggedEver = new Set();
  for (const r of log) {
    if (!isAttempt(r)) continue;
    if (r.flag) flaggedEver.add(r.problem);
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]) best.set(r.problem, r);
  }
  const flaggedRemaining = [...flaggedEver].filter(p => best.get(p)?.outcome !== 'solo');
  const contests = Object.entries(state.days || {})
    .flatMap(([date, rec]) => [rec?.contest, rec?.biweekly, rec?.cfRound]
      .filter(c => c?.logged).map(c => ({ date, name: c.name, solved: c.solved })));
  const mocks = (state.mocks || []).filter(m => m.finished).map(m => ({
    ts: m.ts, solved: Object.values(m.results || {}).filter(Boolean).length,
    total: m.problems.length, usedMin: m.usedMin ?? null
  }));
  return {
    totalAttempts: attempts.length,
    distinctA: best.size,
    bReps: log.filter(r => r.tier === 'B' && r.outcome === 'recognized').length,
    soloRate: attempts.length ? Math.round(solo / attempts.length * 100) : null,
    byWeek, curve, radar,
    pace: paceSeries(cur, log, todayStr),
    flaggedRemaining,
    contests, mocks
  };
}

// ── Personal Trap Ledger (Open-Wave slate): the canonical traps he ACTUALLY
// walked into. Retrospective only — never shown pre-solve, so failure mode #2 is
// safe. "Struggled" = a Tier A row flagged/hinted/editorial/abandoned, or a
// Tier B rep graded ~ (close) / ✗ (missed). The trap text is the canonical one
// from problems.json, passed in as infoFn so this file stays pure. A small fixed
// CP lexicon tallies the recurring KINDS for the headline; the full list (most
// recent first) sits beneath. Empty-safe.
const TRAP_LEXICON = [
  ['off-by-one', /off.?by.?one|off-by|fence ?post/i],
  ['overflow', /overflow|long ?long|int ?max|1e9|10\^9|integer limit/i],
  ['empty / edge', /empty|edge ?case|base ?case|\bnull\b|no elements|single element|size ?0|\bn ?= ?0\b/i],
  ['duplicates', /duplicat|repeat/i],
  ['indexing 0/1', /0-?index|1-?index|0-?based|1-?based|index out|out of bounds/i],
  ['negatives / sign', /negativ|\bsign\b|\babs\b/i],
  ['modulo', /modul|\bmod\b|10\^9\+7/i],
  ['recursion base', /stack ?overflow|recursion depth|infinite ?recursion/i],
];
export function trapLedger(cur, log, infoFn) {
  const idx = topicIndex(cur);
  const struggled = r => isAttempt(r)
    ? (r.flag || r.outcome === 'hint' || r.outcome === 'editorial' || r.outcome === 'abandoned')
    : (r.tier === 'B' && r.outcome === 'recognized' && (r.grade === 'partial' || r.grade === 'fail'));
  const stamp = r => r.ts || Date.parse(r.date) || 0;
  const latest = new Map(); // problem -> most recent struggling row
  for (const r of log) {
    if (!struggled(r)) continue;
    const prev = latest.get(r.problem);
    if (!prev || stamp(r) > stamp(prev)) latest.set(r.problem, r);
  }
  const items = [];
  for (const [problem, r] of latest) {
    const info = infoFn ? infoFn(problem) : null;
    const trap = info?.trap;
    if (!trap) continue; // no canonical trap on file → nothing to ledger
    items.push({
      problem, trap,
      topic: idx.get(problem)?.topic ?? info?.topic ?? 'off-sheet',
      date: r.date,
      why: r.tier === 'B' ? (r.grade === 'fail' ? '✗ missed' : '~ close')
        : r.flag ? '⚑ flagged' : r.outcome
    });
  }
  items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const chips = TRAP_LEXICON
    .map(([label, re]) => ({ label, count: items.filter(it => re.test(it.trap)).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);
  return { chips, items, n: items.length };
}

// ── Recognition confidence (Open-Wave slate): Tier B is most of the daily
// volume, but the Evidence Wall only celebrates solo Tier A solves. This is the
// plain evidence for the volume work — reps done, how often the pattern was
// named inside the 2:00 sub-timer, and the ✓/~/✗ recall split. Pure; empty-safe.
export function recognitionStats(log, todayStr = null) {
  const reps = log.filter(r => r.tier === 'B' && r.outcome === 'recognized');
  const timed = reps.filter(r => r.classified_in_time === true || r.classified_in_time === false);
  const inTime = timed.filter(r => r.classified_in_time === true).length;
  const graded = reps.filter(r => r.grade === 'pass' || r.grade === 'partial' || r.grade === 'fail');
  const pass = graded.filter(r => r.grade === 'pass').length;
  const partial = graded.filter(r => r.grade === 'partial').length;
  const fail = graded.filter(r => r.grade === 'fail').length;
  const byDate = new Map();
  for (const r of reps) byDate.set(r.date, (byDate.get(r.date) || 0) + 1);
  const recent = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7).map(([date, n]) => ({ date, reps: n }));
  return {
    reps: reps.length,
    inTimePct: timed.length ? Math.round(inTime / timed.length * 100) : null,
    inTimeN: timed.length,
    pass, partial, fail, gradedN: graded.length,
    accuracyPct: graded.length ? Math.round(pass / graded.length * 100) : null,
    today: todayStr ? reps.filter(r => r.date === todayStr).length : null,
    recent
  };
}

// ── Next-contest countdown (Open-Wave slate): a calm planning card, not a live
// scoreboard. Merges the fixed curriculum schedule (LC Weekly D3/10/17, the
// D19–20 optional CF) with any biweekly / CF night the user toggled in the day
// state. Returns the soonest FUTURE round, or null. Times are the local (IST)
// wall clock; `now` (ms) is passed in to keep this pure. Empty-safe.
const CONTEST_LINK = {
  lc: 'https://leetcode.com/contest/', biweekly: 'https://leetcode.com/contest/',
  cf: 'https://codeforces.com/contests'
};
function contestType(name = '') {
  if (/biweekly/i.test(name)) return 'biweekly';
  if (/cf|codeforces|\bdiv\b/i.test(name)) return 'cf';
  if (/lc|weekly|leetcode/i.test(name)) return 'lc';
  return 'other';
}
export function nextContest(cur, days = {}, todayStr, now = 0) {
  const cands = [];
  const push = (name, date, timeIst, day) => {
    if (!date) return;
    const ms = Date.parse(`${date}T${timeIst || '00:00'}:00`);
    if (Number.isNaN(ms)) return;
    cands.push({ name: name || 'contest', date, day: day ?? null, timeIst: timeIst || null, ms, type: contestType(name) });
  };
  for (const d of (cur.days || [])) {
    if (d.contest) push(d.contest.name, d.date, d.contest.time_ist, d.day);
  }
  for (const [date, rec] of Object.entries(days || {})) {
    if (!rec) continue;
    const day = (cur.days || []).find(d => d.date === date)?.day ?? null;
    // defensive: biweekly/cfRound may be a boolean or an object
    if (rec.biweekly) push(rec.biweekly.name || 'LC Biweekly', date, rec.biweekly.time_ist || '20:00', day);
    if (rec.cfRound) push(rec.cfRound.name || 'CF Round', date, rec.cfRound.time_ist || '20:05', day);
  }
  const future = cands.filter(c => c.ms >= now).sort((a, b) => a.ms - b.ms);
  if (!future.length) return null;
  const c = future[0];
  return { ...c, link: CONTEST_LINK[c.type] || null, inMs: c.ms - now };
}

// ── AlgoArena strip (Season 2): the next N upcoming rounds, LC + CF ONLY ──────
// AtCoder/CodeChef/HackerRank are filtered out (the user's call). Reuses the same
// candidate-building as nextContest; the live source is the external AlgoArena app
// (deep-linked from the view). Pure; `now` injected. Empty-safe.
export function upcomingContests(cur, days = {}, todayStr, now = 0, n = 4) {
  const cands = [];
  const push = (name, date, timeIst, day) => {
    if (!date) return;
    const ms = Date.parse(`${date}T${timeIst || '00:00'}:00`);
    if (Number.isNaN(ms)) return;
    cands.push({ name: name || 'contest', date, day: day ?? null, timeIst: timeIst || null, ms, type: contestType(name) });
  };
  for (const d of (cur.days || [])) if (d.contest) push(d.contest.name, d.date, d.contest.time_ist, d.day);
  for (const [date, rec] of Object.entries(days || {})) {
    if (!rec) continue;
    const day = (cur.days || []).find(d => d.date === date)?.day ?? null;
    if (rec.biweekly) push(rec.biweekly.name || 'LC Biweekly', date, rec.biweekly.time_ist || '20:00', day);
    if (rec.cfRound) push(rec.cfRound.name || 'CF Round', date, rec.cfRound.time_ist || '20:05', day);
  }
  return cands
    .filter(c => c.ms >= now && ['lc', 'biweekly', 'cf'].includes(c.type))
    .sort((a, b) => a.ms - b.ms).slice(0, n)
    .map(c => ({ ...c, link: CONTEST_LINK[c.type] || null, inMs: c.ms - now }));
}

// ════════════════════════════════════════════════════════════════════════════
// SEASON 2 Wave 8 — the gap-creators' measurement layer (pure; the new scoreboard)
// ════════════════════════════════════════════════════════════════════════════

// ── crossTrackReadiness: the single interview-ready % + weakest-3-to-fix ──────
// Composes five independent per-track readiness numbers into ONE north-star,
// weighted to the §1 thesis (DSA + SysD are the deciders). Fixed targets keep it
// pure (no curriculum.s2 needed); cfData (cf.json) injected for the live rating.
const CT_WEIGHTS = { dsa: 0.35, sysd: 0.25, cf: 0.20, dp: 0.10, corecs: 0.10 };
const CT_LAUNCH = { dsa: '#/', dp: '#/arena', cf: '#/cf-ascent', corecs: '#/corecs', sysd: '#/sysd' }; // dp lane launches the blind Arena (S3)
const GRADEW = { pass: 1, partial: 0.5, fail: 0.2 };
export function crossTrackReadiness(cur, state, todayStr, cfData = null, targets = {}) {
  const T = { dp: 15, cf: state.cfAscent?.ratingTarget || 1850, corecs: 35, sysd: 12, ...targets };
  const log = state.log || [];
  const so = soloOptimalRate(log);
  const dpSolved = Object.keys(state.dp?.solved || {}).length;
  const cfr = cfBandReadiness(cfData, state.cfAscent, T.cf);
  const ccDone = Object.values(state.corecs?.done || {});
  const ccScore = ccDone.reduce((s, d) => s + (GRADEW[d.grade] ?? 0.5), 0);
  const sysdTopics = new Set((state.sysd?.artifacts || []).map(a => a.topic)).size;

  const rows = [
    { key: 'dsa', label: 'DSA (solo-optimal)', ready: so.rate ?? 0, lowData: so.lowData, detail: `${so.n} depth-logged`, fix: 'blank re-solve a flagged problem' },
    { key: 'sysd', label: 'System Design', ready: Math.min(100, Math.round(sysdTopics / T.sysd * 100)), lowData: sysdTopics < 3, detail: `${sysdTopics}/${T.sysd} designs`, fix: 'produce one LLD/HLD artifact' },
    { key: 'cf', label: 'CF band', ready: cfr.fightable != null ? Math.min(100, Math.round(cfr.fightable / T.cf * 100)) : 0, lowData: cfr.fightable == null, detail: `fightable ${cfr.fightable ?? '—'} / ${T.cf}`, fix: 'solve one band problem' },
    { key: 'dp', label: 'DP-from-LC', ready: Math.min(100, Math.round(dpSolved / T.dp * 100)), lowData: dpSolved < 3, detail: `${dpSolved}/${T.dp} hard reps`, fix: 'one hard LC DP' },
    { key: 'corecs', label: 'Core CS', ready: Math.min(100, Math.round(ccScore / T.corecs * 100)), lowData: ccDone.length < 3, detail: `${ccDone.length}/${T.corecs} produced`, fix: 'produce one core-CS topic' }
  ].map(r => ({ ...r, weight: CT_WEIGHTS[r.key], hash: CT_LAUNCH[r.key] }));

  const overall = Math.round(rows.reduce((s, r) => s + r.weight * r.ready, 0));
  const weakest = [...rows].sort((a, b) => a.ready - b.ready).slice(0, 3);
  return { overall, rows, weakest };
}

// ── adherenceMeter: reward hitting YOUR realistic load, not a fantasy quota ───
// Realistic load = median real-work items/day over the last 7 ACTIVE log days.
// "met" today = today's count ≥ 70% of that median (floored at 1). The streak is
// consecutive recent active days that met the bar. Anti-Season-1 over-scope.
export function adherenceMeter(cur, state, todayStr) {
  const log = state.log || [];
  const isWork = r => (isAttempt(r) && COMPLETIONS.has(r.outcome)) || (r.tier === 'B' && r.outcome === 'recognized');
  const byDate = new Map();
  for (const r of log) if (isWork(r)) byDate.set(r.date, (byDate.get(r.date) || 0) + 1);
  const dates = [...byDate.keys()].sort();
  const recent = dates.slice(-7).map(d => byDate.get(d));
  const sorted = [...recent].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const bar = Math.max(1, Math.round(median * 0.7));
  const today = byDate.get(todayStr) || 0;
  // streak: consecutive active days (most recent first) meeting the bar
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i--) { if (byDate.get(dates[i]) >= bar) streak++; else break; }
  return { median, bar, today, met: today >= bar, streak, activeDays: dates.length };
}

// ── produceGauntlet: 10 random OLD items across ALL kinds, reproduce from blank ─
// NOT buildReviewDeck (that is the frozen nightly deck with its own cap/logic).
// Spreads across kinds round-robin, then random fills; weighted toward the cards
// unseen longest. The truest interview predictor: durable skill, not coverage.
export function produceGauntlet(cards, reviews, todayStr, rand = Math.random, n = 10) {
  const lt = (reviews && reviews._leitner) || {};
  const pool = cards.filter(c => (c.date || todayStr) < todayStr);
  const staleOf = c => lt[c.id]?.due ? (Date.parse(todayStr) - Date.parse(lt[c.id].due)) : (Date.parse(todayStr) - Date.parse(c.date || todayStr));
  const byKind = new Map();
  for (const c of pool) { const k = c.kind || 'dsa'; (byKind.get(k) || byKind.set(k, []).get(k)).push(c); }
  for (const arr of byKind.values()) arr.sort((a, b) => staleOf(b) - staleOf(a) + (rand() - 0.5) * 1e6);
  const kinds = [...byKind.keys()];
  const out = [];
  let k = 0;
  while (out.length < n && kinds.some(kk => byKind.get(kk).length)) {
    const arr = byKind.get(kinds[k % kinds.length]); k++;
    if (arr.length) out.push(arr.shift());
  }
  return out.map(card => ({ card }));
}

// ── catch-up ledger (Focus Day idea 3) ───────────────────────────────────────
// Make-up grind made VISIBLE without touching a sealed W/L: completions tagged
// for an earlier day (forDay) that, under §3.9, credited their real day — i.e.
// missed-day problems cleared later. A row counts iff forDay is strictly before
// the day it actually happened (that is exactly catch-up; work-ahead has
// forDay >= date). Counts the trailing 7 days + all-time + distinct days helped.
export function catchUpLedger(log, todayStr) {
  const cutoff = Date.parse(todayStr) - 7 * 864e5;
  let total = 0, week = 0;
  const days = new Set();
  for (const r of log) {
    if (r.upsolve || !COMPLETIONS.has(r.outcome)) continue;
    if (!r.forDay || !(r.forDay < r.date)) continue;
    total++;
    days.add(r.forDay);
    if (Date.parse(r.date) >= cutoff) week++;
  }
  return { total, week, daysTouched: days.size };
}

// ════════════════════════════════════════════════════════════════════════════
// SEASON 2 (Regime 2, additive) — pure stats for the second attempt + durability.
// All read-only over the existing log/cards/reviews; never redefine any §3 law.
// ════════════════════════════════════════════════════════════════════════════

// ── campaign day status: the second-attempt WIN [user 2026-06-30] ────────────
// A curriculum day is WON when every Tier A problem has ≥1 COMPLETION row and
// every Tier B problem has ≥1 recognition row ANYWHERE in the log — so existing
// Season-1 solves count and you finish only what remains. Matched by problem
// name (rows store the curriculum name). Decoupled from §3.9 seal/credit
// (post-Day-20 those collapse) — the campaign keeps its own honest scoreboard.
export function campaignDayStatus(dayEntry, log) {
  const tierA = dayEntry?.tierA || [];
  const tierB = dayEntry?.tierB || [];
  const doneA = new Set(), doneB = new Set();
  for (const r of log) {
    if (r.upsolve) continue;
    if (r.tier === 'A' && COMPLETIONS.has(r.outcome)) doneA.add(r.problem);
    else if (r.tier === 'B' && r.outcome === 'recognized') doneB.add(r.problem);
  }
  const remainingA = tierA.filter(p => !doneA.has(p));
  const remainingB = tierB.filter(p => !doneB.has(p));
  const aDone = tierA.length - remainingA.length;
  const bDone = tierB.length - remainingB.length;
  const tot = tierA.length + tierB.length;
  return {
    day: dayEntry?.day ?? null,
    aDone, aTotal: tierA.length, bDone, bTotal: tierB.length,
    remainingA, remainingB,
    won: remainingA.length === 0 && remainingB.length === 0,
    pct: tot ? Math.round((aDone + bDone) / tot * 100) : 100
  };
}

// ── retention: per-kind production rate + Leitner box distribution ───────────
// The instrument behind the durability objective. A card's Leitner box (0 = never
// drilled, 1/2/3 = climbed via produce-from-blank ✓) is the retention signal;
// "retained" = the share of DRILLED cards that survived past box 1 (reproduced
// after a real gap). solve-cards (kind undefined) read as 'dsa'. Pure; empty-safe.
export function retention(cards, reviews, dateStr) {
  const lt = (reviews && reviews._leitner) || {};
  const kinds = {};
  for (const c of cards) {
    const k = c.kind || 'dsa';
    const e = kinds[k] || (kinds[k] = { kind: k, total: 0, seen: 0, boxes: [0, 0, 0, 0], due: 0 });
    e.total++;
    const box = Math.min(lt[c.id]?.box || 0, 3);
    e.boxes[box]++;
    if (box > 0) e.seen++;
    if (lt[c.id]?.due && lt[c.id].due <= dateStr) e.due++;
  }
  const rows = Object.values(kinds).map(e => ({
    ...e,
    retained: e.seen ? Math.round((e.boxes[2] + e.boxes[3]) / e.seen * 100) : null
  })).sort((a, b) => b.total - a.total);
  const seen = rows.reduce((s, r) => s + r.seen, 0);
  const deep = rows.reduce((s, r) => s + r.boxes[2] + r.boxes[3], 0);
  return {
    kinds: rows, total: cards.length, seen,
    due: rows.reduce((s, r) => s + r.due, 0),
    retained: seen ? Math.round(deep / seen * 100) : null
  };
}

// ── decay risk: the make-forgetting-VISIBLE list ─────────────────────────────
// Cards overdue for spaced review, or never drilled and older than X days,
// weighted by kind importance (the deciders decay most expensively). Feeds the
// durability dashboard AND the morning B0 resurface. Pure; sorted most-at-risk first.
const DECAY_WEIGHT = { dsa: 1, sysd: 1, synth: 0.95, dp: 0.9, graph: 0.9, mix: 0.9, cp: 0.85, B: 0.8, corecs: 0.7, star: 0.6, project: 0.6 }; // graph/mix = SEASON 3 arena
export function decayRisk(cards, reviews, dateStr, X = 7) {
  const lt = (reviews && reviews._leitner) || {};
  const today = Date.parse(dateStr);
  const out = [];
  for (const c of cards) {
    const k = c.kind || 'dsa';
    const st = lt[c.id];
    let staleDays, why;
    if (st?.due) { staleDays = Math.round((today - Date.parse(st.due)) / 864e5); why = 'overdue'; }
    else { staleDays = Math.round((today - Date.parse(c.date || dateStr)) / 864e5); why = 'never drilled'; }
    if (staleDays < X) continue;
    out.push({
      id: c.id, problem: c.problem || c.topic || '(card)', kind: k,
      staleDays, why, risk: staleDays * (DECAY_WEIGHT[k] ?? 0.8)
    });
  }
  out.sort((a, b) => b.risk - a.risk);
  return out;
}

// ── CF-Ascent OA-band readiness ──────────────────────────────────────────────
// "Fightable rating" toward the 1800-1900 OA band: the max of the live CF rating
// (cf.json, server-maintained) and the average of the top-5 highest-rated CF
// problems actually SOLVED in the climb (cf-ascent.json attempts). Pure — cf +
// cfState are passed in. Empty-safe.
export function cfBandReadiness(cf, cfState, target = 1850) {
  const current = cf?.current ?? null;
  const solved = (cfState?.attempts || []).filter(a => a.solved);
  const topRatings = solved.map(a => a.rating).filter(Boolean).sort((a, b) => b - a).slice(0, 5);
  const topBand = topRatings.length ? Math.round(topRatings.reduce((s, r) => s + r, 0) / topRatings.length) : null;
  const fightable = (current != null || topBand != null) ? Math.max(current ?? 0, topBand ?? 0) : null;
  const aboveCurrent = current != null ? solved.filter(a => a.rating && a.rating >= current).length : 0;
  return {
    current, target, fightable, topBand,
    solvedN: solved.length, aboveCurrent,
    gap: fightable != null ? target - fightable : null,
    ready: fightable != null && fightable >= target
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SEASON 3 — evidence-gated readiness (THE GAP). Six gates, each a minimum
// evidence sample; the overall state is CAPPED BY THE WEAKEST GATE and reads
// INSUFFICIENT EVIDENCE until every minimum exists. Cold + delayed performance
// move it; reading and box-checking cannot. Pure — state in, rows out.
// ════════════════════════════════════════════════════════════════════════════
// Every project id you have touched in the Grill Room, in stable order.
export function grillProjectIds(gr = {}) {
  const ids = new Set();
  for (const k of Object.keys(gr.pitches || {})) ids.add(k);
  for (const d of gr.drilled || []) if (d.project) ids.add(d.project);
  for (const bag of [gr.whiteboard, gr.landmines, gr.ownership]) {
    for (const k of Object.keys(bag || {})) {
      const id = String(k).split('-')[0];
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function evidenceGates(state, dateStr, projectIds = null) {
  const capf = (...fr) => Math.min(...fr.map(f => (isFinite(f) ? Math.max(f, 0) : 0)));
  const attempts = state.arena?.attempts || [];
  const blindDone = attempts.filter(a => a.mode === 'blind' && a.outcome);
  const resolves = attempts.filter(a => a.mode === 'resolve' && a.outcome);
  const recalls = state.doctrine?.recalls || [];
  const delayed = recalls.filter(r => r.delayed);
  const subjects = new Set(recalls.map(r => r.subject).filter(Boolean));
  const builds = state.doctrine?.builds || [];
  const coldLld = builds.filter(b => b.kind === 'lld' && b.cold).length;
  const coldHld = builds.filter(b => b.kind === 'hld' && b.cold).length;
  const gr = state.grill || {};
  // Project ids come from YOUR dossier file (grill.s3.json), not a fixed list.
  // Callers that have the dossier loaded pass the ids in; otherwise we infer
  // them from whatever you have already worked on.
  const ids = (projectIds && projectIds.length) ? projectIds : grillProjectIds(gr);
  const grillDetail = ids.map(p => {
    const pitched = !!(gr.pitches?.[p]?.s30 && gr.pitches?.[p]?.m2);
    const answered = (gr.drilled || []).filter(d => d.project === p).length;
    const wb = Object.keys(gr.whiteboard || {}).filter(k => k.startsWith(p + '-')).length;
    const lm = Object.keys(gr.landmines || {}).filter(k => k.startsWith(p + '-')).length;
    return { p, pitched, answered, wb, lm, ok: pitched && answered >= 10 && wb >= 1 && lm >= 3 };
  });
  const grillOk = grillDetail.filter(g => g.ok).length;
  const oas = (state.oaSims || []).filter(o => o.finished).length;
  const mocks = (state.interviews || []).filter(m => m.finished).length;
  const stars = (state.cards || []).filter(c => c.kind === 'star').length;

  const gates = [
    { key: 'blind', label: 'Blind DSA', hash: '#/arena',
      have: `${blindDone.length}/12 blind · ${resolves.length}/6 delayed`,
      need: '12 full-blind attempts + 6 delayed re-solves',
      frac: capf(blindDone.length / 12, resolves.length / 6) },
    { key: 'theory', label: 'Theory', hash: '#/doctrine',
      have: `${recalls.length}/80 recalls · ${delayed.length}/30 delayed · ${subjects.size}/4 subjects`,
      need: '80 scored recalls incl. 30 delayed, across ≥4 subjects',
      frac: capf(recalls.length / 80, delayed.length / 30, subjects.size / 4) },
    { key: 'design', label: 'Design', hash: '#/doctrine',
      have: `${coldLld}/2 cold LLD · ${coldHld}/1 cold HLD`,
      need: '2 cold LLD + 1 cold HLD artifacts',
      frac: capf(coldLld / 2, coldHld / 1) },
    { key: 'project', label: 'Project/paper', hash: '#/grill',
      have: ids.length ? `${grillOk}/${ids.length} dossiers cleared` : 'no dossiers yet',
      need: 'per dossier: both pitches + 10 answers + 1 whiteboard + 3 landmines',
      frac: ids.length ? grillOk / ids.length : 0 },
    { key: 'pressure', label: 'Pressure', hash: '#/oa',
      have: `${oas}/1 OA · ${mocks}/2 mocks`,
      need: '1 OA + 2 full mocks with autopsies',
      frac: capf(oas / 1, mocks / 2) },
    { key: 'behavioral', label: 'Behavioral', hash: '#/command',
      have: `${stars}/6 STAR stories`,
      need: '6 truthful STAR stories banked',
      frac: stars / 6 }
  ].map(g => ({ ...g, pct: Math.min(100, Math.round(g.frac * 100)) }));
  const weakest = gates.reduce((w, g) => (g.pct < w.pct ? g : w), gates[0]);
  const sufficient = gates.every(g => g.pct >= 100);
  return { gates, weakest, overall: weakest.pct, sufficient, grillDetail };
}
