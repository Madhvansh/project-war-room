// Machine audit of the Regime 1 laws (MISSION.md §3 / curriculum.json rules)
// against public/laws.js — the same module the app runs. Pure; no server.
// Usage: npm test   (exit 1 on any failed assertion)
// Card-form unskippability is DOM-level and asserted by scripts/laws-ui.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../public/laws.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum.json'), 'utf8'));
const ORDER = cur.schedule_template.sleep_guard.compression_order;

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.error('  FAIL  ' + name)); };
const eq = (got, want, name) =>
  ok(JSON.stringify(got) === JSON.stringify(want), `${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const ts = (dateStr, h, m = 0) => {
  const [Y, M, D] = dateStr.split('-').map(Number);
  return new Date(Y, M - 1, D, h, m).getTime();
};
const hm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
let seed = 42;
const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

const day1 = cur.days[0], day2 = cur.days[1];
const row = (problem, tier, outcome, date) => ({ id: crypto.randomUUID(), problem, tier, outcome, date });
const aRows = (names, date, outcome = 'solo') => names.map(p => row(p, 'A', outcome, date));
const bRows = (names, date) => names.map(p => row(p, 'B', 'recognized', date));

// ── §3.5 binary win condition ────────────────────────────────────────────────
{
  const won = { log: [...aRows(day1.tierA.slice(0, 8), day1.date), ...bRows(day1.tierB.slice(0, 9), day1.date)], days: {} };
  ok(L.isWonOn(cur, won, day1.date), 'win: 8 A + 9 B meets day-1 quota');
  const hinted = { log: [...aRows(day1.tierA.slice(0, 8), day1.date, 'hint'), ...bRows(day1.tierB.slice(0, 9), day1.date)], days: {} };
  ok(L.isWonOn(cur, hinted, day1.date), 'win: hint outcomes count — "regardless of how many solves needed hints"');
  const shortA = { log: [...aRows(day1.tierA.slice(0, 7), day1.date), ...bRows(day1.tierB.slice(0, 9), day1.date)], days: {} };
  ok(!L.isWonOn(cur, shortA, day1.date), 'win: 7 A is a loss');
  const shortB = { log: [...aRows(day1.tierA.slice(0, 8), day1.date), ...bRows(day1.tierB.slice(0, 8), day1.date)], days: {} };
  ok(!L.isWonOn(cur, shortB, day1.date), 'win: 8 B is a loss');
}

// ── quota floors from data ───────────────────────────────────────────────────
{
  eq(L.baseQuota(cur, day1), { a: 8, b: 9 }, 'quota: day 1 floors 8/9');
  const day6 = cur.days.find(d => d.day === 6);
  eq(L.baseQuota(cur, day6).a, 6, 'quota: DP-completion day floor 6');
}

// ── §3.3 overflow engine ─────────────────────────────────────────────────────
{
  const log = [...aRows(day1.tierA.slice(0, 7), day1.date), row(day1.tierA[7], 'A', 'abandoned', day1.date)];
  const q = L.overflowQueue(cur, log, 2);
  eq(q.map(o => o.problem).sort(), [...day1.tierA.slice(7)].sort(), 'overflow: exactly the 2 uncompleted (abandoned still rolls)');
  ok(q.every(o => o.fromDay === 1), 'overflow: fromDay recorded');
  eq(L.overflowQueue(cur, log, 1).length, 0, 'overflow: nothing before day 1');
  eq(L.overflowQueue(cur, [], 3).length, day1.tierA.length + day2.tierA.length, 'overflow: nothing silently dropped across days');
}

// ── §3.4 sleep guard compression ─────────────────────────────────────────────
{
  const comp = (h, m, qB = 9, fB = 3) => L.compressSchedule(cur, ts(day1.date, h, m), qB, fB);
  const b = (c, id) => c.blocks.find(x => x.id === id).minutes;

  const c0 = comp(10, 0);
  eq(c0.steps, [], 'compress: anchor 10:00 → end 21:55, untouched');
  eq(hm(c0.projectedEnd), '21:55', 'compress: projection math');

  const c1 = comp(11, 0);
  eq(c1.steps, ORDER.slice(0, 1), 'compress: anchor 11:00 → step 1 only, exact order');
  eq([c1.quotaB, c1.trimmedB, b(c1, 'B3')], [6, 3, 59], 'compress: step 1 = quota −3, B3 80→59 (7×3=21 min)');
  eq(hm(c1.projectedEnd), '22:34', 'compress: stops once ≤ 22:45');
  eq([b(c1, 'BREAK1'), b(c1, 'B4')], [20, 45], 'compress: later steps untouched when not needed');

  const c2 = comp(11, 30);
  eq(c2.steps, ORDER.slice(0, 2), 'compress: anchor 11:30 → steps 1+2, exact order');
  eq([b(c2, 'BREAK1'), b(c2, 'LUNCH'), b(c2, 'DINNER'), b(c2, 'B4')], [15, 40, 30, 45], 'compress: breaks to minimums 15/40/30, B4 spared');
  eq(hm(c2.projectedEnd), '22:39', 'compress: two-step projection');

  const c3 = comp(12, 0);
  eq(c3.steps, ORDER, 'compress: anchor 12:00 → all three steps, exact order');
  eq(b(c3, 'B4'), 30, 'compress: step 3 = B4 → 30');
  ok(c3.over && hm(c3.projectedEnd) === '22:54', 'compress: fully compressed yet still over → flagged red, never trims more');
  for (const c of [c0, c1, c2, c3]) ok(b(c, 'B5') >= 30, 'compress: B5 never below 30 (never trimmed at all)');

  const cf = comp(12, 0, 4, 3);
  eq([cf.quotaB, cf.trimmedB, b(cf, 'B3')], [3, 1, 73], 'compress: floor min(3, available) caps step 1');

  const cNull = L.compressSchedule(cur, null, 9, 3);
  eq([cNull.steps.length, cNull.quotaB, cNull.projectedEnd, cNull.over], [0, 9, null, false], 'compress: no stored anchor → uncompressed, no crash');

  const curMutant = structuredClone(cur);
  curMutant.schedule_template.sleep_guard.compression_order = ['mystery_step', ...ORDER];
  const cm = L.compressSchedule(curMutant, ts(day1.date, 12, 0), 9, 3);
  ok(!cm.steps.includes('mystery_step') && cm.steps.length === 3, 'compress: unknown data token skipped, never misapplied');
}

// ── §3.5 bad-day protocol ────────────────────────────────────────────────────
{
  const st = { log: [], days: { [day1.date]: { day: 1, badDay: true } } };
  const q2 = L.effectiveQuota(cur, st, day2.date);
  eq([q2.badDayTrim, q2.b], [3, Math.min(9, day2.tierB.length) - 3], 'bad day: tomorrow Tier B −3');
  ok(!L.canPressBadDay(st, day1.date) && L.canPressBadDay(st, day2.date), 'bad day: one press per day, maximum');

  st.days[day2.date] = { day: 2, anchor: ts(day2.date, 11, 0) };
  const qStack = L.effectiveQuota(cur, st, day2.date);
  ok(qStack.b >= Math.min(3, day2.tierB.length), 'bad day + compression stack: floor min(3, available) holds');
  const afterBad = Math.min(9, day2.tierB.length) - 3;
  const expComp = Math.min(3, Math.max(0, afterBad - 3));
  eq([qStack.badDayTrim, qStack.compTrim, qStack.b], [3, expComp, afterBad - expComp],
    'bad day + compression stack: −3 then compression down toward the floor');

  const rec = L.record(cur, { log: [], days: { [day2.date]: { day: 2, badDay: true } } }, day2.date);
  eq([rec.wins, rec.losses], [0, 2], 'bad day: closes today as an honest L (yesterday lost too)');

  const wonToday = { log: [...aRows(day1.tierA.slice(0, 8), day1.date), ...bRows(day1.tierB.slice(0, 9), day1.date)], days: {} };
  eq(L.record(cur, wonToday, day1.date).streak, 1, 'record: undecided won today extends streak');
}

// ── no-anchor fallback in the win record ─────────────────────────────────────
{
  const q = L.effectiveQuota(cur, { log: [], days: {} }, day1.date);
  eq([q.b, q.compTrim, q.comp.steps.length], [9, 0, 0], 'effective quota: past day without anchor = uncompressed base');
}

// ── §3.8 review deck ─────────────────────────────────────────────────────────
{
  const card = (i, date) => ({ id: 'c' + i + '-' + date, date, trigger: 't', pattern: 'p', trap: 'x' });
  const older = Array.from({ length: 15 }, (_, i) => card(i, day1.date));
  const todays = Array.from({ length: 3 }, (_, i) => card(i, day2.date));
  const reviews = { [day1.date]: { missed: [older[0].id, older[1].id] } };
  const deck = L.buildReviewDeck([...older, ...todays], reviews, day2.date, rand);
  eq(deck.length, 3 + 2 + 10, 'review: today(3) + missed(2) + 10 random old');
  eq(new Set(deck.map(d => d.card.id)).size, 15, 'review: no duplicates');
  eq(deck.filter(d => d.why === 'missed').map(d => d.card.id).sort(),
    [older[0].id, older[1].id].sort(), 'review: missed cards resurface tomorrow');
  ok(todays.every(c => deck.some(d => d.card.id === c.id)), 'review: every new card served');

  const small = L.buildReviewDeck([...older.slice(0, 4), ...todays], { [day1.date]: { missed: [older[0].id] } }, day2.date, rand);
  eq(small.length, 3 + 1 + 3, 'review: pool smaller than 10 → take what exists');

  // ── R7 [author-authorized]: Leitner fills the old-card slots first ──
  eq(L.LEITNER_DAYS, [1, 3, 7], 'R7: the spacing ladder is 1/3/7 days');
  eq(L.leitnerNext(undefined, true, day1.date), { box: 1, due: day2.date }, 'R7: first ✓ → box 1, due tomorrow');
  eq(L.leitnerNext({ box: 1 }, true, '2026-06-13').due, '2026-06-16', 'R7: second ✓ → box 2, due in 3 days');
  eq(L.leitnerNext({ box: 3 }, true, '2026-06-13'), { box: 3, due: '2026-06-20' }, 'R7: box 3 ✓ stays at 7-day spacing');
  eq(L.leitnerNext({ box: 3 }, false, day1.date), { box: 1, due: day2.date }, 'R7: ✗ → tomorrow + full reset, from any box');

  // required assertion (a): an ✗-graded card ALWAYS appears in the next day's deck
  const lt = { [older[5].id]: L.leitnerNext({ box: 3 }, false, day1.date) };
  const reviewsX = { [day1.date]: { missed: [older[5].id] }, _leitner: lt };
  const deckNext = L.buildReviewDeck(older, reviewsX, day2.date, rand);
  ok(deckNext.some(d => d.card.id === older[5].id), 'R7 (a): the ✗-graded card is in the next day\'s deck — the old guarantee survives');

  // due-first fill: 3 due cards always make the deck; cap untouched
  const lt3 = {};
  for (const c of older.slice(0, 3)) lt3[c.id] = { box: 1, due: day2.date };
  const deckDue = L.buildReviewDeck([...older, ...todays], { _leitner: lt3 }, day2.date, rand);
  ok(older.slice(0, 3).every(c => deckDue.some(d => d.card.id === c.id && d.why === 'due')),
    'R7: every due card fills an old-card slot before any random one');
  // required assertion (b): the deck never exceeds the cap, even with 15 due
  const ltAll = {};
  for (const c of older) ltAll[c.id] = { box: 1, due: day1.date };
  const deckCap = L.buildReviewDeck([...older, ...todays], { _leitner: ltAll }, day2.date, rand);
  eq(deckCap.length, 3 + 10, 'R7 (b): old-card slots never exceed the UNCHANGED cap of 10');
}

// ── rules.dp_keep_warm rotation ──────────────────────────────────────────────
{
  const names = [1, 2, 3, 4, 5].map(n => L.dpKeepWarm(cur, n).problem);
  eq(names, ['climbing stairs', 'frog jump', 'grid paths', 'climbing stairs', 'frog jump'], 'keep-warm: days 1–5 rotate the three DP problems');
  eq([L.dpKeepWarm(cur, 6), L.dpKeepWarm(cur, 0)], [null, null], 'keep-warm: days 1–5 only');
  eq(L.dpKeepWarm(cur, 1).minutes, 15, 'keep-warm: 15-minute re-implement');
}

// ── sheet count from baseline_done ───────────────────────────────────────────
{
  const log = [row('X', 'A', 'solo', day1.date), row('Y', 'B', 'recognized', day1.date),
    row('Z', 'A', 'abandoned', day1.date), row('X', 'A', 'hint', day1.date)];
  eq(L.sheetCount(cur, log), (cur.meta.baseline_done ?? 0) + 2, 'sheet: baseline + distinct non-abandoned touches');
  eq(Number.isInteger(cur.meta.baseline_done) && cur.meta.baseline_done >= 0, true,
    'sheet: meta.baseline_done is a non-negative integer');
}

// ── Wave 4 item I: supplements are off-sheet — never move 435 ────────────────
{
  const supp = cur.supplements[0]; // a real supplement name from the data
  const sheetItem = day1.tierA[0];
  const log = [row(supp, 'A', 'solo', day1.date), row(sheetItem, 'A', 'solo', day1.date)];
  eq(L.sheetCount(cur, log), (cur.meta.baseline_done ?? 0) + 1,
    'supplements: a supplement solve never moves the sheet count');
  eq(L.sheetCount(cur, [row(sheetItem, 'A', 'solo', day1.date)]), (cur.meta.baseline_done ?? 0) + 1,
    'supplements: sheet items still count');
  const allListed = new Map();
  for (const d of cur.days) for (const p of [...(d.tierA || []), ...(d.tierB || [])])
    allListed.set(p, (allListed.get(p) || 0) + 1);
  ok([...cur.supplements, ...cur.read_only].every(p => allListed.get(p) === 1),
    'supplements/read_only: every name appears in exactly one day list (sets stay in sync with the plan)');
}

// ── §3.9 the credit rule [R5] ────────────────────────────────────────────────
{
  eq(L.creditDate({ date: day1.date, forDay: day2.date }), day2.date,
    'credit: forDay in the future credits forDay (work-ahead)');
  eq(L.creditDate({ date: day2.date, forDay: day1.date }), day2.date,
    'credit: forDay in the past credits the real day (catch-up lands on today)');
  eq(L.creditDate({ date: day1.date }), day1.date, 'credit: no forDay → the real day');

  // no row credits two days — a work-ahead row is invisible to its real date
  const wa = { ...row(day2.tierA[0], 'A', 'solo', day1.date), forDay: day2.date };
  ok(!L.completedA([wa], day1.date).has(day2.tierA[0]) && L.completedA([wa], day2.date).has(day2.tierA[0]),
    'credit: a work-ahead row credits exactly ONE day — its forDay, never its date');
  const cu = { ...row(day1.tierA[0], 'A', 'solo', day2.date), forDay: day1.date };
  ok(L.completedA([cu], day2.date).has(day1.tierA[0]) && !L.completedA([cu], day1.date).has(day1.tierA[0]),
    'credit: a catch-up row credits today only — the past day is untouchable');
  const credited = cur.days.filter(d => L.completedA([wa], d.date).size > 0);
  eq(credited.length, 1, 'credit: across all 20 days, one row credits exactly one day');
  const bwa = { ...row(day2.tierB[0], 'B', 'recognized', day1.date), forDay: day2.date };
  ok(L.recognizedB([bwa], day2.date).has(day2.tierB[0]) && !L.recognizedB([bwa], day1.date).has(day2.tierB[0]),
    'credit: Tier B recognitions route identically');

  // sealed immutability — the snapshot outranks any later log evidence
  const sealedL = { log: [...aRows(day1.tierA.slice(0, 8), day1.date), ...bRows(day1.tierB.slice(0, 9), day1.date)],
    days: { [day1.date]: { day: 1, sealed: { won: false, a: 2, b: 3, quotaA: 8, quotaB: 9, ts: 1 } } } };
  ok(!L.isWonOn(cur, sealedL, day1.date), 'seal: a sealed L stands even when later rows would win the day');
  const sealedW = { log: [], days: { [day1.date]: { day: 1, sealed: { won: true, a: 8, b: 9, quotaA: 8, quotaB: 9, ts: 1 } } } };
  ok(L.isWonOn(cur, sealedW, day1.date), 'seal: a sealed W stands even if the rows vanish');
  const recSealed = L.record(cur, sealedW, day2.date);
  eq(recSealed.wins, 1, 'seal: the record reads sealed snapshots for past days');

  // sheetCount is independent of credit routing
  eq(L.sheetCount(cur, [wa]), L.sheetCount(cur, [{ ...wa, forDay: undefined }]),
    'credit: sheetCount independent of credit routing (forDay moves quota, never the sheet)');

  // dayNumber is a pure function of the IST date — no counter anywhere
  eq(L.istDate(Date.parse('2026-06-11T20:00:00Z')), '2026-06-12', 'ist: 20:00Z = 01:30 IST next day');
  eq(L.istDate(Date.parse('2026-06-12T17:00:00Z')), '2026-06-12', 'ist: 17:00Z = 22:30 IST same day');
  eq(L.sealDay(cur, { log: [...aRows(day1.tierA.slice(0, 8), day1.date), ...bRows(day1.tierB.slice(0, 9), day1.date)], days: {} }, day1.date).won,
    true, 'seal: sealDay snapshots the live §3.5 result');
}

// ── R1 pause: every gate fires on SOLVE time only ────────────────────────────
{
  const now = Date.now();
  // 12 wall minutes, 5 of them paused → 7 solve minutes: the 10-min gate has NOT fired
  const s1 = { startTs: now - 12 * 60000, pausedMs: 5 * 60000, pausedAt: null, speed: 1 };
  ok(L.solveElapsedMin(s1, now) < L.SOLO_MIN, 'R1: paused minutes never advance the 10-minute gate');
  eq(Math.round(L.solveElapsedMin(s1, now)), 7, 'R1: solve time = wall − paused');
  // a LIVE pause freezes the clock entirely
  const s2 = { startTs: now - 40 * 60000, pausedMs: 0, pausedAt: now - 10 * 60000, speed: 1 };
  eq(Math.round(L.solveElapsedMin(s2, now)), 30, 'R1: an open pause freezes the solve clock');
  ok(L.solveElapsedMin(s2, now) < L.CEIL_MIN, 'R1: the 35-minute ceiling waits out a pause');
  // 38 wall, 4 paused → 34 solve: ceiling not yet; at 39 wall it fires
  const s3 = { startTs: now - 38 * 60000, pausedMs: 4 * 60000, pausedAt: null, speed: 1 };
  ok(L.solveElapsedMin(s3, now) < L.CEIL_MIN && L.solveElapsedMin({ ...s3, startTs: now - 39.5 * 60000 }, now) >= L.CEIL_MIN,
    'R1: the ceiling fires on solve time, not wall time');
  // Tier B: 8 wall, 2 paused → 6 solve: under the 7-min ceiling; classify gate same math
  const sb = { startTs: now - 8 * 60000, pausedMs: 2 * 60000, pausedAt: null, speed: 1 };
  ok(L.solveElapsedMin(sb, now) < L.TIERB_CEIL_MIN, 'R1: Tier B 7-min ceiling on solve time');
  ok(L.solveElapsedMin({ startTs: now - 3 * 60000, pausedMs: 1.5 * 60000, pausedAt: null, speed: 1 }, now) < L.TIERB_CLASSIFY_MIN,
    'R1: the 2-min classify sub-timer on solve time');
  // the neutral ⏸ marker: >10 paused minutes OR 3+ pauses — never both required
  ok(!L.pauseMarker({ paused_minutes: 10, pause_count: 2 }), 'R1: marker not at exactly 10 min / 2 pauses');
  ok(L.pauseMarker({ paused_minutes: 10.5, pause_count: 0 }), 'R1: marker past 10 paused minutes');
  ok(L.pauseMarker({ paused_minutes: 1, pause_count: 3 }), 'R1: marker at 3 pauses');
  eq(L.PAUSE_ABANDON_MIN, 30, 'R1: a 30+ minute pause offers abandon-to-overflow');
  // accounting helpers
  eq(Math.round(L.pausedMin(s2, now)), 10, 'R1: live pause counts into paused minutes');
}

// ── R2 + R6: the optimal hunt and the depth ledger ───────────────────────────
{
  eq(L.OPTIMAL_CUE_MIN, 20, 'R2: the non-gating "brute banked — hunt optimal" cue sits at minute 20');
  const depthRow = { ...row(day1.tierA[0], 'A', 'solo', day1.date),
    depth_alone: 'brute', depth_final: 'brute', depth_top: 'optimal', depth_source: 'solo' };
  ok(L.completedA([depthRow], day1.date).has(day1.tierA[0]),
    'R6: ANY implemented depth counts toward the quota — completedA semantics unchanged');
  eq(L.sheetCount(cur, [depthRow]), (cur.meta.baseline_done ?? 0) + 1,
    'R6: depth fields never touch the sheet count');
}

// ── R4: Tier B v2 — the rep is the card; grades never touch the quota ────────
{
  const failRep = { ...row(day1.tierB[0], 'B', 'recognized', day1.date), grade: 'fail', classified_in_time: true };
  ok(L.recognizedB([failRep], day1.date).has(day1.tierB[0]),
    'R4: a ✗-graded rep still counts as recognized — the grade is data, never quota');
  const withCands = { log: [], days: {}, candidates: [{ problem: day1.tierA[0] }] };
  eq(L.effectiveQuota(cur, withCands, day1.date).a, L.effectiveQuota(cur, { log: [], days: {} }, day1.date).a,
    'R4: the promote-candidates pile never changes any quota');
  eq([L.TIERB_CEIL_MIN, L.TIERB_CLASSIFY_MIN], [7, 2],
    'R4: the 7:00 ceiling and 2:00 classify sub-timer are unchanged law');
}

// ── §3.6 contest credit toward the Tier A quota ──────────────────────────────
{
  const d3 = cur.days[2]; // LC Weekly day, credits_tierA 4; quotas derived from data
  const qa = Math.min(cur.rules.tier_quota_floors.tierA_per_day, d3.tierA.length);
  const qb = Math.min(cur.rules.tier_quota_floors.tierB_per_day, d3.tierB.length);
  const st = {
    log: [...aRows(d3.tierA.slice(0, qa - 4), d3.date), ...bRows(d3.tierB.slice(0, qb), d3.date)],
    days: { [d3.date]: { day: 3, contest: { name: 'LC Weekly', solved: 2, firstUnsolved: 'Q3', logged: true, ts: 1 } } }
  };
  eq(L.contestCredit(cur, st, d3.date), 4, 'contest: logged LC Weekly credits 4 Tier A');
  ok(L.isWonOn(cur, st, d3.date), `contest: ${qa - 4} real solves + 4 credits meet day-3 quota of ${qa}`);
  const unlogged = { log: st.log, days: {} };
  eq(L.contestCredit(cur, unlogged, d3.date), 0, 'contest: no credit before the contest is logged');
  ok(!L.isWonOn(cur, unlogged, d3.date), `contest: ${qa - 4} solves alone lose day 3`);
}

// ── quota + sheet immunity to resolve/upsolve rows ───────────────────────────
{
  const log = [
    ...aRows(day1.tierA.slice(0, 7), day1.date),
    { ...row('Two Sum', 'A', 'resolve', day1.date) },
    { ...row('CF 1800B ladder fill', 'A', 'resolve', day1.date) },
    { ...row('Contest Q3', 'A', 'editorial', day1.date), upsolve: true }
  ];
  eq(L.completedA(log, day1.date).size, 7, 'quota: resolve + upsolve rows never inflate Tier A');
  const sheetLog = [row('X', 'A', 'solo', day1.date),
    { ...row('CF-only problem', 'A', 'resolve', day1.date) },
    { ...row('Contest Q3', 'A', 'editorial', day1.date), upsolve: true }];
  eq(L.sheetCount(cur, sheetLog), (cur.meta.baseline_done ?? 0) + 1, 'sheet: resolve/upsolve rows never move 435');
}

// ── §3.6 single upsolve injection ────────────────────────────────────────────
{
  const d3 = cur.days[2];
  const st = { log: [], days: { [day2.date]: { day: 2, biweekly: { name: 'LC Biweekly', firstUnsolved: 'B-Q4', logged: true, ts: 100 } } } };
  eq(L.upsolveTask(cur, st, d3.date), { problem: 'B-Q4', source: 'LC Biweekly' }, 'upsolve: injected the morning after a logged contest');
  st.days[day2.date].cfRound = { name: 'CF Div 3', firstUnsolved: 'CF-D', logged: true, ts: 200 };
  eq(L.upsolveTask(cur, st, d3.date), { problem: 'CF-D', source: 'CF Div 3' }, 'upsolve: two contests → exactly ONE task, most recently logged');
  st.days[day2.date].cfRound.firstUnsolved = null; // "solved everything"
  eq(L.upsolveTask(cur, st, d3.date).problem, 'B-Q4', 'upsolve: solved-everything contest contributes nothing');
  st.days[day2.date] = { day: 2, contest: { name: 'X', firstUnsolved: null, logged: true, ts: 1 } };
  eq(L.upsolveTask(cur, st, d3.date), null, 'upsolve: everything solved → no injection');
  st.days[day2.date] = { day: 2, contest: { name: 'X', firstUnsolved: 'Q', logged: true, ts: 1 } };
  st.log.push({ ...row('Q', 'A', 'editorial', d3.date), upsolve: true });
  eq(L.upsolveTask(cur, st, d3.date), null, 'upsolve: completing it clears the task');
  eq(L.upsolveTask(cur, { log: [], days: {} }, d3.date), null, 'upsolve: no contest, no task');
}

// ── §3.7 speed drill picker ──────────────────────────────────────────────────
{
  eq(L.RESOLVE_MIN, 20, 'drill: 20-minute re-solves [ruling 2026-06-11]');
  eq(L.speedDrillPick(cur, [], day2.date).mode, 'ladder', 'drill: even day = CF ladder');
  const d1 = L.speedDrillPick(cur, [], day1.date);
  eq([d1.mode, d1.picks.length, d1.ladderFill], ['resolve', 0, 2], 'drill: odd day, empty log → 2 ladder fills (Day 1 case)');

  const d5 = cur.days[4]; // 2026-06-16, odd
  const log35 = [...aRows(['P-old'], day1.date), ...aRows(['P-fresh'], cur.days[3].date)];
  const p5 = L.speedDrillPick(cur, log35, d5.date);
  eq([p5.picks.map(p => p.problem), p5.ladderFill], [['P-old'], 1], 'drill: only solves ≥3 days old are eligible; shortfall fills from ladder');

  const freqLog = [
    { ...row('F', 'A', 'hint', day1.date), flag: true, minutes: 31.2 },
    { ...row('C-never', 'A', 'solo', day1.date), minutes: 12 },
    { ...row('C-resolved', 'A', 'solo', day1.date), minutes: 14 },
    { ...row('C-resolved', 'A', 'resolve', day2.date) }
  ];
  const again = L.speedDrillPick(cur, freqLog, d5.date);
  eq(again.picks.map(p => p.problem), L.speedDrillPick(cur, freqLog, d5.date).picks.map(p => p.problem),
    'drill: date-seeded → stable all day');
  eq(again.picks.find(p => p.problem === 'F')?.firstMinutes, 31.2, 'drill: original solve time carried for the delta');
  const counts = { F: 0, 'C-never': 0, 'C-resolved': 0 };
  let sampledDays = 0;
  for (const d of cur.days) {
    if (d.day % 2 === 0) continue;
    const pk = L.speedDrillPick(cur, freqLog, d.date);
    if (!pk || !pk.picks.length) continue;
    sampledDays++;
    for (const p of pk.picks) counts[p.problem]++;
  }
  ok(sampledDays >= 6, `drill: frequency sample ran (${sampledDays} odd days)`);
  ok(counts.F >= counts['C-never'] && counts['C-never'] >= counts['C-resolved'] && counts.F > counts['C-resolved'],
    `drill: weighting holds — flagged ${counts.F} ≥ clean ${counts['C-never']} ≥ already-re-solved ${counts['C-resolved']}`);
  const sameDayResolve = [...freqLog, { ...row('F', 'A', 'resolve', d5.date) }];
  ok(!L.speedDrillPick(cur, sameDayResolve, d5.date).picks.some(p => p.problem === 'F'),
    'drill: a problem re-solved today is not offered again');
}

// ── §3.6 CF round gating ─────────────────────────────────────────────────────
{
  const mk = n => {
    const days = {};
    for (let i = 0; i < n; i++) days[cur.days[i].date] = { day: i + 1, cfRound: { name: 'CF', logged: true } };
    return { log: [], days };
  };
  const d10 = cur.days[9].date, d19 = cur.days[18].date;
  ok(L.canLogCfRound(cur, mk(2), d10).allowed, 'cf: 2 rounds used → a third is allowed');
  ok(!L.canLogCfRound(cur, mk(3), d10).allowed, 'cf: cap 3 during days 1–18 blocks the fourth');
  eq(L.canLogCfRound(cur, mk(3), d10).cap, 3, 'cf: cap parsed from data');
  eq(L.canLogCfRound(cur, mk(0), d10).divs, ['Div 3', 'Div 4'], 'cf: days 1–18 are Div 3/4');
  eq(L.canLogCfRound(cur, mk(3), d19).divs, ['Div 2'], 'cf: Div 2 only on days 19–20');
  ok(L.canLogCfRound(cur, mk(3), d19).allowed, 'cf: day 19 unaffected by the 1–18 cap');
}

console.log(`\nLAWS AUDIT: ${pass} passed, ${fail} failed` + (fail ? '' : ' — Regime 1 conforms.'));
process.exit(fail ? 1 : 0);
