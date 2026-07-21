// API smoke test: exercises every persistence endpoint. Fully sandboxed —
// spawns its own server on :4399 against a throwaway temp dir; never touches
// the live :4350 server or ./data (user rule, 2026-06-11).
// Usage: node scripts/smoke.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.P435_TEST_PORT || 4399);
const B = `http://localhost:${PORT}`;
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'p435-smoke-'));

const j = (m, p, b) =>
  fetch(B + p, {
    method: m, headers: { 'Content-Type': 'application/json', connection: 'close' },
    body: b === undefined ? undefined : JSON.stringify(b)
  }).then(r => r.json());

let serverProc = null;
try {
  try { await fetch(B + '/api/state'); throw new Error(`something already listens on :${PORT}`); } catch (e) {
    if (String(e.message).includes('already listens')) throw e;
  }
  serverProc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, P435_PORT: String(PORT), P435_DATA: SANDBOX }
  });
  let ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { await fetch(B + '/api/state'); ok = true; } catch {}
  }
  if (!ok) throw new Error(`sandboxed server failed to start on :${PORT}`);

  const a = await j('POST', '/api/log', {
    date: '2026-06-12', day: 1, problem: 'Two Sum', tier: 'A',
    minutes: 14.5, outcome: 'solo', flag: false, classification: 'hashmap lookup'
  });
  await j('POST', '/api/log', {
    date: '2026-06-12', day: 1, problem: 'Linear Search', tier: 'B',
    outcome: 'recognized', minutes: null, flag: false, classification: null
  });
  const tmp = await j('POST', '/api/log', {
    date: '2026-06-12', day: 1, problem: 'DELETE-ME', tier: 'B',
    outcome: 'recognized', minutes: null, flag: false, classification: null
  });
  await j('POST', '/api/log/delete', { id: tmp.row.id });
  await j('POST', '/api/cards', {
    date: '2026-06-12', day: 1, problem: 'Two Sum',
    trigger: 'find pair summing to target', pattern: 'hashmap complement', trap: 'duplicate element reuse'
  });
  await j('PUT', '/api/days', { '2026-06-12': { day: 1, anchor: 1781237400000 } });
  await j('PUT', '/api/ladder', [{ id: 'l1', name: '1100 - A test', week: 1, done: true, ts: Date.now() }]);
  await j('PUT', '/api/reviews', { '2026-06-12': { missed: [], gotIt: [], completed: true, dayLog: 'smoke' } });
  await j('PUT', '/api/mocks', [{ id: 'm1', ts: Date.now(), problems: [{ problem: 'X', topic: 'T', why: 'solo' }], minutes: 90, startTs: null, results: {}, usedMin: null, finished: false }]);
  await j('PUT', '/api/session', {
    problem: 'Kadane', tier: 'A', date: '2026-06-12', day: 1,
    classification: 'max subarray dp', startTs: Date.now(), speed: 1, phase: 'solve',
    hintTaken: false, gateAnswered: false, debugUntil: null, outcome: null, flag: false,
    reimplStartTs: null, cardStartTs: null, completedMin: null
  });

  // ── SEASON 3: new docs round-trip + shipped-content serving + enrichment skip
  await j('PUT', '/api/arena', { activeSession: null, attempts: [{ id: 'a1', itemId: 'dp-001', name: 'Smoke DP', mode: 'blind', outcome: 'solo', classifyGrade: 'pass', date: '2026-07-17', ts: Date.now() }], resolveQueue: [] });
  await j('PUT', '/api/doctrine', { read: { 'os-u1': '2026-07-17' }, probes: {}, recalls: [{ qid: 'os-q01', subject: 'os', grade: 'pass', delayed: false, date: '2026-07-17', ts: Date.now() }], builds: [] });
  await j('PUT', '/api/grill', { ownership: {}, drilled: [], whiteboard: {}, landmines: {}, pitches: {}, mocks: [] });
  await j('PUT', '/api/warplan', { checked: { '2026-07-17::d1-f1': Date.now() }, diagnostic: {} });
  const enrich0 = await j('GET', '/api/enrich');
  // a card that arrives WITH a shipped canonical must NOT enter the enrich queue
  await j('POST', '/api/cards', {
    kind: 'graph', date: '2026-07-17', problem: 'Smoke Graph', prompt: 'p', produce: 'canon',
    attempt: 'mine', canonical: { pattern: 'x', traps: [] }, contentId: 'gr-999', src: 's3'
  });
  const enrich1 = await j('GET', '/api/enrich');
  const s3served = await fetch(B + '/warplan.s3.json').then(r => r.ok).catch(() => false);

  const st = await fetch(B + '/api/state').then(r => r.json());
  console.log('log rows:', st.log.length, '| problems:', st.log.map(r => r.problem).join(', '));
  console.log('cards:', st.cards.length, '| anchor:', st.days['2026-06-12'].anchor,
    '| ladder:', st.ladder.length, 'done:', st.ladder[0].done, '| reviews:', !!st.reviews['2026-06-12']?.completed,
    '| mocks:', st.mocks.length);
  console.log('session:', st.session.problem, '| phase:', st.session.phase);
  console.log('row id/ts assigned:', !!a.row.id, !!a.row.ts);
  console.log('S3 docs in state:', !!st.arena && !!st.doctrine && !!st.grill && !!st.warplan,
    '| arena attempts:', st.arena?.attempts?.length,
    '| warplan checked:', Object.keys(st.warplan?.checked || {}).length,
    '| enrich skip (canonical card):', enrich1.pending === enrich0.pending,
    '| warplan.s3.json served:', s3served);
  console.log('sandbox dir:', SANDBOX);
  console.log(st.log.length === 2 && st.cards.length === 2 && st.session.problem === 'Kadane'
    && st.arena?.attempts?.length === 1 && st.doctrine?.recalls?.length === 1
    && Object.keys(st.warplan?.checked || {}).length === 1
    && enrich1.pending === enrich0.pending && s3served
    ? 'SMOKE OK' : 'SMOKE MISMATCH');
} finally {
  if (serverProc) serverProc.kill();
  fs.rmSync(SANDBOX, { recursive: true, force: true });
}
