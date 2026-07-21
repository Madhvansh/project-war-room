// `npm run demo` — a throwaway, fully populated War Room so you can click
// around before committing to anything.
//
// It writes ONLY to ./data-demo (its own sandbox) and serves on port 4399, so
// your real ./data on port 4350 is never touched. Delete ./data-demo to reset.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEMO = path.join(ROOT, 'data-demo');
const PORT = process.env.P435_PORT || '4399';

const today = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date());

// Day 1 is today, so the seeded solves land on the day you are looking at.
fs.rmSync(DEMO, { recursive: true, force: true });
fs.mkdirSync(DEMO, { recursive: true });
fs.writeFileSync(path.join(DEMO, 'config.json'), JSON.stringify({
  user: 'Demo',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  start_date: today,
  baseline_done: 77,
  warplan_start: null,
  cf_handle: '',
  language: 'C++'
}, null, 2));

const env = { ...process.env, P435_DATA: DEMO, P435_DEMO_DATE: today, P435_PORT: PORT };
const seed = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'seed-demo.mjs')], { env, stdio: 'inherit' });
if (seed.status !== 0) { console.error('\n  seeding failed — nothing started.'); process.exit(seed.status || 1); }

console.log(`
  ── DEMO MODE ──────────────────────────────────────────────────────────
  Sandbox : ./data-demo        (your real ./data is untouched)
  Day 1   : ${today}           (= today, mid-grind, ~4h into the day)
  Open    : http://localhost:${PORT}

  Try: Mission Control → SOLVE a Tier A problem → the calendar → #/command
  Add ?speed=60 to the URL to make 1 second = 1 minute and watch the
  35-minute solve ritual play out in about 35 seconds.

  Ctrl-C to stop. Delete ./data-demo to reset the demo.
  ───────────────────────────────────────────────────────────────────────
`);

const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env, stdio: 'inherit' });
srv.on('exit', code => process.exit(code ?? 0));
process.on('SIGINT', () => { srv.kill('SIGINT'); });
