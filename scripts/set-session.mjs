// Dev helper: plant a solve session at a chosen point in the 10/10/35 timeline.
// Defaults to the SANDBOX port (4399) — to touch the live app deliberately:
//   $env:P435_PORT='4350'; node scripts/set-session.mjs ...
// Usage: node scripts/set-session.mjs <elapsedMin> <phase> [gateAnswered]
//        node scripts/set-session.mjs clear
const PORT = process.env.P435_PORT || 4399;
const [arg, phase = 'solve', gate = 'false'] = process.argv.slice(2);
const now = Date.now();
const body = arg === 'clear' ? null : {
  problem: 'Kadane', tier: 'A', date: '2026-06-11', day: 1,
  classification: 'max subarray dp', speed: 1,
  startTs: now - (+arg) * 60000,
  phase,
  hintTaken: false, gateAnswered: gate === 'true',
  debugUntil: null, outcome: phase === 'reimplement' || phase === 'card' ? 'editorial' : null,
  flag: phase === 'reimplement' || phase === 'card',
  reimplStartTs: phase === 'reimplement' ? now - 60000 : null,
  cardStartTs: phase === 'card' ? now : null,
  completedMin: phase === 'reimplement' || phase === 'card' ? 35 : null
};
const r = await fetch(`http://localhost:${PORT}/api/session`, {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}).then(x => x.json());
console.log(`session set on :${PORT}:`, JSON.stringify(r));
