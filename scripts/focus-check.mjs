// Focus Day — machine-check of the honest-credit guarantee (the user's ruling:
// "keep it honest"). Imports the REAL, unedited laws.js so this proves the
// actual §3.9 credit rule the feature rides on — NOT a re-implementation.
// Run: node scripts/focus-check.mjs
import { creditDate, completedA, recognizedB, sealDay } from '../public/laws.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.error('  FAIL  ' + name)); };
const eq = (a, b, name) => ok(a === b, `${name}  (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);

const TODAY = '2026-06-21';   // Day 10
const DAY4  = '2026-06-15';   // a sealed past day (the user's example)
const DAY14 = '2026-06-25';   // a future day (work-ahead target)

// ── 1. the credit rule routes focus solves correctly ────────────────────────
eq(creditDate({ date: TODAY, forDay: DAY4 }), TODAY,
  'catch-up (focus a PAST day) credits TODAY, never the sealed past day');
eq(creditDate({ date: TODAY, forDay: DAY14 }), DAY14,
  'work-ahead (focus a FUTURE day) credits that future day');
eq(creditDate({ date: TODAY, forDay: TODAY }), TODAY,
  'focus == today is a no-op for credit');
eq(creditDate({ date: TODAY }), TODAY,
  'an untagged solve credits its real day');

// ── 2. logStamp's truth-layer guarantee (replicated EXACTLY from app.js) ─────
// the only thing app.js.logStamp does with forDay is set row.date = real today
// and route the credit; it NEVER stamps row.date as the focus day.
const sprintDayN = d => Math.floor((Date.parse(d) - Date.parse('2026-06-12')) / 864e5) + 1;
function logStamp(today, forDay) {
  if (!forDay || forDay === today) return { date: today, day: sprintDayN(today) };
  const credit = creditDate({ date: today, forDay });
  return { date: today, day: sprintDayN(credit), forDay };
}
const rowCatchUp = logStamp(TODAY, DAY4);
eq(rowCatchUp.date, TODAY, 'catch-up row.date is the REAL today (truth layer intact)');
eq(rowCatchUp.forDay, DAY4, 'catch-up row keeps forDay = the focus day');
eq(rowCatchUp.day, 10, 'catch-up row credits Day 10 (today), not Day 4');
const rowAhead = logStamp(TODAY, DAY14);
eq(rowAhead.date, TODAY, 'work-ahead row.date is still the REAL today');
eq(rowAhead.day, 14, 'work-ahead row credits Day 14');

// ── 3. the quota engine sees the credit on the RIGHT day, sealed day untouched ─
const log = [
  { id: 'a', problem: 'Two Sum',  tier: 'A', outcome: 'solo', ...rowCatchUp },
  { id: 'b', problem: 'Future X', tier: 'A', outcome: 'solo', ...rowAhead },
  { id: 'c', problem: 'B Prob',   tier: 'B', outcome: 'recognized', date: TODAY, forDay: DAY4, day: 10 }
];
ok(completedA(log, TODAY).has('Two Sum'),  'catch-up solve counts toward TODAY\'s Tier A quota');
ok(!completedA(log, DAY4).has('Two Sum'),  'catch-up solve does NOT reach the sealed Day 4 quota');
ok(completedA(log, DAY14).has('Future X'), 'work-ahead solve counts toward Day 14');
ok(!completedA(log, TODAY).has('Future X'),'work-ahead solve does NOT inflate today');
ok(recognizedB(log, TODAY).has('B Prob'),  'catch-up Tier B rep credits today');
ok(!recognizedB(log, DAY4).has('B Prob'),  'catch-up Tier B rep does NOT reach sealed Day 4');

// sealDay for Day 4 must compute identically whether or not the catch-up rows exist
const cur = { days: [{ day: 4, date: DAY4, phase: 'Foundations', tierA: ['X1','X2','X3'], tierB: ['Y1'] }],
  rules: { tier_quota_floors: { tierA_per_day: 7, tierB_per_day: 6, tierA_dp_graph_days: 5 } },
  schedule_template: { blocks: [], sleep_guard: { compress_when_projected_end_after: '22:45', compression_order: [] } },
  contests: { codeforces: { live_rules: '', ladder: {} } } };
const sealWithout = sealDay(cur, { log: [], days: {} }, DAY4);
const sealWith    = sealDay(cur, { log, days: {} }, DAY4);
eq(JSON.stringify({ ...sealWith, ts: 0 }), JSON.stringify({ ...sealWithout, ts: 0 }),
  'Day 4 seal is identical with/without later catch-up rows — the past is immutable');

// ── 4. catchUpLedger algorithm (mirrors stats.js) ───────────────────────────
const COMPLETIONS = new Set(['solo', 'hint', 'editorial']);
function catchUpLedger(log, todayStr) {
  const cutoff = Date.parse(todayStr) - 7 * 864e5;
  let total = 0, week = 0; const days = new Set();
  for (const r of log) {
    if (r.upsolve || !COMPLETIONS.has(r.outcome)) continue;
    if (!r.forDay || !(r.forDay < r.date)) continue;
    total++; days.add(r.forDay);
    if (Date.parse(r.date) >= cutoff) week++;
  }
  return { total, week, daysTouched: days.size };
}
const led = catchUpLedger(log, TODAY);
eq(led.total, 1, 'ledger counts the catch-up solo (Tier A), excludes work-ahead + Tier B-recognized');
eq(led.week, 1, 'the catch-up clear is within the trailing week');
eq(led.daysTouched, 1, 'one distinct missed day was helped');
ok(catchUpLedger([{ outcome: 'solo', date: TODAY, forDay: DAY14 }], TODAY).total === 0,
  'work-ahead rows never count as make-up');

console.log(`\nFOCUS CHECK: ${pass} passed, ${fail} failed — honest-credit guarantee ${fail ? 'BROKEN' : 'holds'}.`);
process.exit(fail ? 1 : 0);
