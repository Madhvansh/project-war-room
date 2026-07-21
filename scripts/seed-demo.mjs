// Seed a realistic mid-grind Day 1 for UI inspection, or wipe the seeded dir
// back to empty. Most people want `npm run demo`, which wraps this.
// SANDBOXED by default: writes to ./data-sandbox, never live ./data. Pair with
//   P435_PORT=4399 P435_DATA=./data-sandbox npm start
// Touching live data requires an explicit P435_DATA=./data.
// Usage: node scripts/seed-demo.mjs [clear] [anchorHoursAgo=4]
// The seeded day is P435_DEMO_DATE (YYYY-MM-DD), default today.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = process.env.P435_DATA ? path.resolve(process.env.P435_DATA) : path.join(ROOT, 'data-sandbox');
const D = process.env.P435_DEMO_DATE || new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());
const [mode, hoursAgo = '4'] = process.argv.slice(2);

// This script overwrites (and with `clear`, deletes) whole files. It must never
// touch your real record just because P435_DATA happens to be exported.
if (DATA === path.join(ROOT, 'data') && !process.argv.includes('--force')) {
  console.error('\n  refusing to seed/wipe the LIVE ./data record.');
  console.error('  Unset P435_DATA, or pass --force if you genuinely mean it.\n');
  process.exit(1);
}

fs.mkdirSync(DATA, { recursive: true });
const w = (f, doc) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(doc, null, 2));

if (mode === 'clear') {
  for (const f of fs.readdirSync(DATA)) {
    const p = path.join(DATA, f);
    if (fs.statSync(p).isFile()) fs.rmSync(p);
  }
  console.log(`${DATA} wiped.`);
  process.exit(0);
}

const t0 = Date.now();
const row = (problem, tier, outcome, minutes, flag, classification, extra = {}) => ({
  id: crypto.randomUUID(), ts: t0 - Math.random() * 3e7,
  date: D, day: 1, problem, tier, outcome, minutes, flag, classification, ...extra
});

// Wave 4 shapes: depth ledger (R6), pause accounting (R1), grades (R4),
// forDay work-ahead (R5) — so seeded UIs exercise every new surface
const depth = (alone, final, source) => ({ depth_alone: alone, depth_final: final, depth_top: 'optimal', depth_source: source });
w('log.json', [
  row('Two Sum', 'A', 'solo', 9.4, false, 'hashmap complement', { ...depth('optimal', 'optimal', 'solo'), pause_count: 0, paused_minutes: 0 }),
  row('Sort an array of 0s 1s 2s (Dutch National Flag)', 'A', 'solo', 14.2, false, 'three-way partition', { ...depth('optimal', 'optimal', 'solo'), pause_count: 1, paused_minutes: 4.5 }),
  row("Majority Element (Moore's Voting)", 'A', 'solo', 11.8, false, 'cancellation counting', depth('brute', 'brute', 'solo')),
  row("Kadane's Algorithm - Maximum Subarray", 'A', 'solo', 8.9, false, 'running max dp', { ...depth('optimal', 'optimal', 'solo'), forDay: D }),
  row('Best Time to Buy and Sell Stock I', 'A', 'hint', 21.6, false, 'prefix min sweep', { ...depth('brute', 'optimal', 'coach'), struggle: 'wrong pattern' }),
  row('Rearrange Array Elements by Sign', 'A', 'editorial', 35, true, 'two-pointer placement', { ...depth(null, 'optimal', 'editorial'), struggle: 'no idea', pause_count: 3, paused_minutes: 12 }),
  row('Linear Search', 'B', 'recognized', 1.6, false, 'single pass scan', { grade: 'pass', classified_in_time: true }),
  row('Largest Element', 'B', 'recognized', 1.2, false, 'single pass max', { grade: 'pass', classified_in_time: true }),
  row('Second Largest Element', 'B', 'recognized', 2.8, false, 'two-track max', { grade: 'partial', classified_in_time: true }),
  row('Maximum Consecutive Ones', 'B', 'recognized', 8.4, false, 'run-length counter', { grade: 'fail', classified_in_time: false }),
  row('Move Zeros to End', 'B', 'recognized', 2.1, false, 'stable two-pointer', { grade: 'pass', classified_in_time: true })
]);

// solve cards are R3 two-field (pattern + note) with the AI layer landed on
// some; B-cards carry guess + canonical + grade (R4)
const card = (problem, pattern, note, ai = null) =>
  ({ id: crypto.randomUUID(), ts: t0 - Math.random() * 3e7, date: D, day: 1, problem, pattern, note, ...(ai ? { ai: { ...ai, model: 'sonnet', ts: t0 } } : {}) });
const bcard = (problem, guess, grade, canonical) =>
  ({ id: crypto.randomUUID(), ts: t0 - Math.random() * 3e7, date: D, day: 1, kind: 'B', problem, guess, grade, pattern: canonical.pattern, canonical });
w('cards.json', [
  card('Two Sum', 'hashmap complement', 'check the map BEFORE inserting — same element reuse',
    { trigger: 'find a pair summing to a target', trap: 'same element reused twice', optimal_insight: 'one-pass hashmap: lookup complement, then insert' }),
  card('Sort an array of 0s 1s 2s (Dutch National Flag)', 'three-way partition', 'mid stays put after swapping with high',
    { trigger: 'three distinct values, in-place', trap: 'advancing mid after the high swap', optimal_insight: 'Dutch national flag: low/mid/high pointers, one pass' }),
  card("Majority Element (Moore's Voting)", 'cancellation counting', 'verify the candidate in a second pass'),
  card("Kadane's Algorithm - Maximum Subarray", 'running max dp', 'all-negative arrays — init with the first element',
    { trigger: 'max sum contiguous subarray', trap: 'empty-window init breaks on all-negatives', optimal_insight: 'Kadane: drop a negative prefix, track the global max' }),
  card('Best Time to Buy and Sell Stock I', 'prefix min sweep', 'buy must precede sell'),
  card('Rearrange Array Elements by Sign', 'two-pointer placement', 'two output lanes beat in-place gymnastics'),
  bcard('Linear Search', 'single pass scan', 'pass', { trigger: 'unsorted, find one element', pattern: 'Iteration', trap: 'forgetting to return -1' }),
  bcard('Largest Element', 'single pass max', 'pass', { trigger: 'single max query', pattern: 'Single-pass tracking', trap: 'INT_MIN init vs first element' }),
  bcard('Second Largest Element', 'two-track max', 'partial', { trigger: 'second max, one pass', pattern: 'Two-variable tracking', trap: 'duplicates of the max' }),
  bcard('Maximum Consecutive Ones', 'run-length counter', 'fail', { trigger: 'longest run of 1s', pattern: 'Streak counting', trap: 'final streak never compared' }),
  bcard('Move Zeros to End', 'stable two-pointer', 'pass', { trigger: 'stable partition by zero', pattern: 'Two-pointer partitioning', trap: 'overwriting before copy' })
]);
w('candidates.json', [{ problem: 'Maximum Consecutive Ones', date: D, from: 'recognition ✗', ts: t0 }]);
w('enrich-queue.json', []);

w('days.json', { [D]: { day: 1, anchor: t0 - (+hoursAgo) * 3600e3 } });
w('reviews.json', {});
w('ladder.json', [
  { id: 'l1', name: '1100 — B. Two Tables (1800B)', week: 1, done: true, ts: t0 },
  { id: 'l2', name: '1100 — A. Doors and Keys (1644A)', week: 1, done: false, ts: t0 }
]);
w('session.json', null);

console.log(`seeded Day 1 mid-grind into ${DATA}: anchor ${hoursAgo}h ago, 6 A done (4 solo), 5 B reps, 11 cards.`);
console.log(`serve it sandboxed:  $env:P435_PORT='4399'; $env:P435_DATA='${path.relative(ROOT, DATA) || './data-sandbox'}'; npm start`);
console.log(`then open http://localhost:4399/?date=${D}`);

