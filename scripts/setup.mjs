// Write or update data/config.json — your personal settings.
// The shipped curriculum.json / warplan.s3.json keep their template dates;
// the server re-bases both onto your start date at boot.
//
//   node scripts/setup.mjs                        # show current settings
//   node scripts/setup.mjs --start 2026-08-03     # day 1 of the 20-day plan
//   node scripts/setup.mjs --name "Alex" --baseline 40 --tz Asia/Kolkata
//   node scripts/setup.mjs --cf tourist           # Codeforces handle ('' = off)
//   node scripts/setup.mjs --warplan 2026-09-01   # Season 3 crunch day 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = process.env.P435_DATA ? path.resolve(process.env.P435_DATA) : path.join(ROOT, 'data');
const FILE = path.join(DATA, 'config.json');

const FLAGS = {
  '--start': 'start_date', '--name': 'user', '--tz': 'timezone',
  '--baseline': 'baseline_done', '--cf': 'cf_handle',
  '--warplan': 'warplan_start', '--lang': 'language'
};

const machineTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const today = tz => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

const defaults = {
  user: '', timezone: machineTz, start_date: today(machineTz),
  baseline_done: 0, warplan_start: null, cf_handle: '', language: 'C++'
};

let cfg = { ...defaults };
try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { /* first run */ }

const argv = process.argv.slice(2);
let touched = false;
for (let i = 0; i < argv.length; i++) {
  const key = FLAGS[argv[i]];
  if (!key) {
    if (argv[i].startsWith('--')) {
      console.error(`unknown flag ${argv[i]}. Known: ${Object.keys(FLAGS).join(' ')}`);
      process.exit(1);
    }
    continue;
  }
  const raw = argv[++i];
  if (raw === undefined) { console.error(`${argv[i - 1]} needs a value`); process.exit(1); }
  if (key === 'baseline_done') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) { console.error('--baseline must be a non-negative integer'); process.exit(1); }
    cfg[key] = n;
  } else if (key === 'start_date' || key === 'warplan_start') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw + 'T00:00:00Z'))) {
      console.error(`${argv[i - 1]} must be a real date as YYYY-MM-DD`); process.exit(1);
    }
    cfg[key] = raw;
  } else if (key === 'timezone') {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: raw }); }
    catch { console.error(`unknown timezone "${raw}" — use an IANA name like Asia/Kolkata`); process.exit(1); }
    cfg[key] = raw;
  } else {
    cfg[key] = raw;
  }
  touched = true;
}

if (touched) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2));
}

const end = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dow = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

console.log(`\n  ${touched ? 'saved' : 'current'} → ${path.relative(ROOT, FILE)}\n`);
console.log(`  name           ${cfg.user || '(blank — the Coach says "the candidate")'}`);
console.log(`  timezone       ${cfg.timezone}   (today here: ${today(cfg.timezone)})`);
console.log(`  start date     ${cfg.start_date}  ${dow(cfg.start_date)}  → day 20 lands ${end(cfg.start_date, 19)}`);
console.log(`  baseline done  ${cfg.baseline_done} problems already solved before day 1`);
console.log(`  war plan       ${cfg.warplan_start || '(same as start date)'}`);
console.log(`  codeforces     ${cfg.cf_handle || '(off)'}`);
console.log(`  language       ${cfg.language}`);
if (dow(cfg.start_date) !== 'Friday') {
  console.log(`\n  note: the plan was authored starting on a Friday, so its contest days`);
  console.log(`  land on Sundays. Yours start ${dow(cfg.start_date)} — the contest rows will sit on`);
  console.log(`  different weekdays. Harmless, but --start on a Friday keeps the rhythm.`);
}
console.log(`\n  now run: npm start\n`);
