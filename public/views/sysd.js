// SEASON 2 Wave 7 — System Design (#/sysd): the second decider. LLD-heavy (Mon/
// Wed/Fri) + HLD (Tue/Thu) + machine-coding (Sat), cadence from curriculum.s2.json.
// Each session PRODUCES an artifact (classes / estimate / design) → a kind:'sysd'
// card whose front is the design prompt and back is your artifact + the framework
// checklist, so the deck later asks you to redraw it from blank. The keyless Coach
// (claude -p, §6 — no full solutions) gives a Socratic review. Plus project deep-
// dive cards for the four self-built apps. Off-sheet — never touches log.json.
import {
  App, Laws, esc, todayStr, displayDayN, saveSysd, rerender,
  campaignOn, campaignEntry, appendCard, saveReviews
} from '../app.js';
import { produceRep, cleanupProduce } from '../produce.js';

export function cleanupSysd() { cleanupProduce(); }

const spine = () => App.s2?.sysd;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function todayMode() {
  const wd = WEEKDAY[new Date(todayStr() + 'T12:00:00').getDay()];
  const c = spine()?.cadence || {};
  return { wd, mode: c[wd] || 'LLD' };
}
const PROJECTS = [
  { app: 'Project 435 (DSA war-room)', hook: 'zero-dep Node + vanilla SPA; §3.9 IST-pure day logic; frozen Regime-1 + audited laws' },
  { app: 'RecallArena (core-CS recall)', hook: 'spaced-repetition flashcards; produce-from-blank; subject coverage' },
  { app: 'AlgoArena (contest tracker)', hook: 'aggregates LC + CF rounds; reminders; the right next contest' },
  { app: 'CF-Ascent (rating climb)', hook: 'curated good problems by band; readiness toward an OA rating' }
];

export function renderSysd(root) {
  cleanupProduce();
  if (!spine()) { root.innerHTML = '<div class="panel"><p class="faint">curriculum.s2.json not loaded — System Design spine unavailable.</p></div>'; return; }
  renderDash(root);
}

function doneSet() { return new Set((App.state.sysd?.artifacts || []).map(a => a.topic)); }

function renderDash(root) {
  const sp = spine();
  const { wd, mode } = todayMode();
  const done = doneSet();
  const pool = mode === 'HLD' ? (sp.hld.canonical || []) : (sp.lld.machine_coding || []);
  const next = pool.find(t => !done.has(t)) || pool[0];
  const arts = [...(App.state.sysd?.artifacts || [])].sort((a, b) => b.ts - a.ts).slice(0, 6);

  root.innerHTML = `
    <div class="panel"><h2>System Design — the second decider <span class="right faint">${wd}: ${mode}</span></h2>
      <p class="muted">Each session PRODUCES an artifact, then you redraw it from blank later. LLD-heavy (higher OA/round yield) + HLD basics. The Coach reviews Socratically — never a full solution.</p>
      <div class="cc-next"><div class="cc-topic">${esc(next || '—')} <span class="faint">· ${mode === 'HLD' ? 'high-level design' : 'machine-coding / LLD'}</span></div>
        <button class="primary" id="sd-go" ${next ? '' : 'disabled'}>PRODUCE ARTIFACT ▸</button></div>
    </div>
    <div class="cols"><div>
      ${arts.length ? `<div class="panel"><h2>Your artifacts <span class="faint right">redraw from blank in the deck</span></h2>
        ${arts.map((a, i) => `<div class="sd-art">
          <div class="sd-art-head"><b>${esc(a.topic)}</b> <span class="faint">${esc(a.mode)} · ${a.grade === 'pass' ? '✓' : a.grade === 'partial' ? '~' : '✗'}</span>
            <button class="ghost sd-coach" data-i="${i}">⟁ Coach review</button></div>
          <div class="sd-art-body">${esc((a.body || '').slice(0, 200))}${(a.body || '').length > 200 ? '…' : ''}</div>
          <div class="sd-coachzone" id="sd-cz-${i}"></div>
        </div>`).join('')}
      </div>` : ''}
      <div class="panel"><h2>Project deep-dive <span class="faint">— your strongest story</span></h2>
        <p class="muted">You built four apps — a rare differentiator. Bank each as a defensible deep-dive (architecture · "why this not that" · scaling).</p>
        <ul class="probs">${PROJECTS.map((p, i) => `<li style="cursor:pointer" data-proj="${i}">
          <span class="st">▸</span><span class="nm">${esc(p.app)}</span></li>`).join('')}</ul>
      </div>
    </div><div>
      <div class="panel"><h2>${mode === 'HLD' ? 'HLD' : 'LLD'} framework</h2>
        <ol class="sd-frame">${(mode === 'HLD' ? sp.hld.framework : sp.lld.framework).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      </div>
      <div class="panel"><h2>${mode === 'HLD' ? 'Building blocks' : 'Patterns'} <span class="faint right">define each in one line</span></h2>
        <div class="sd-chips">${(mode === 'HLD' ? sp.hld.building_blocks : sp.lld.foundations).map(b => `<span class="sd-chip">${esc(b)}</span>`).join('')}</div>
      </div>
    </div></div>`;

  root.querySelector('#sd-go')?.addEventListener('click', () => startArtifact(root, next, mode));
  root.querySelectorAll('li[data-proj]').forEach(li => li.addEventListener('click', () => startProject(root, +li.dataset.proj)));
  root.querySelectorAll('.sd-coach').forEach(b => b.addEventListener('click', () => coachReview(root, arts[+b.dataset.i], +b.dataset.i)));
}

function startArtifact(root, topic, mode) {
  if (!topic) return;
  const hld = mode === 'HLD';
  const item = {
    prompt: `Design — ${topic}`, problem: topic, subject: mode,
    hint: hld ? 'requirements → estimate → API → data → high-level → deep-dive → trade-offs'
      : 'requirements → entities/classes → relationships → patterns → core code → concurrency',
    checklist: hld ? spine().hld.framework : spine().lld.framework,
    fields: hld
      ? [{ key: 'est', label: 'ESTIMATE (users → QPS read/write, storage/yr)', placeholder: '100M/day ÷ 100K ≈ 1.16K writes/s; 100:1 → ~116K reads/s' },
         { key: 'design', label: 'HIGH-LEVEL DESIGN (boxes + one request end-to-end)', multiline: true, placeholder: 'Client → LB → app → cache(Redis) → DB; shard by …' },
         { key: 'trade', label: 'BOTTLENECK + TRADE-OFFS (SQL vs NoSQL, what at 10×)', placeholder: 'read-heavy → cache + replicas; SQL for txns, …' }]
      : [{ key: 'classes', label: 'CLASSES + RELATIONSHIPS (nouns → classes, has-a / is-a)', multiline: true, placeholder: 'ParkingLot, Floor, Spot, Vehicle, Ticket; lot HAS floors …' },
         { key: 'patterns', label: 'PATTERNS APPLIED (name them as you use them)', placeholder: 'Strategy for fee rules; Factory for Spot/Vehicle; Singleton controller' },
         { key: 'trade', label: 'CONCURRENCY + EXTENSIONS', placeholder: 'lock the SPOT not the lot; open/closed for a new vehicle type' }],
    build: v => hld
      ? { produce: `estimate: ${v.est}\n\ndesign: ${v.design}\n\ntrade-offs: ${v.trade}`, trap: v.trade, pattern: 'HLD' }
      : { produce: `classes: ${v.classes}\n\npatterns: ${v.patterns}\n\nconcurrency/ext: ${v.trade}`, trap: v.trade, pattern: 'LLD' }
  };
  produceRep(root, {
    item, kind: 'sysd', day: campaignOn() ? campaignEntry()?.day : displayDayN(),
    onDone: async (g, card) => {
      App.state.sysd ||= { artifacts: [] };
      App.state.sysd.artifacts.push({ topic, mode, body: card?.produce || '', grade: g, ts: Date.now() });
      await saveSysd();
      rerender();
    }
  });
}

function startProject(root, i) {
  const p = PROJECTS[i];
  const item = {
    prompt: `Deep-dive — ${p.app}`, problem: p.app, subject: 'project',
    hint: p.hook,
    checklist: ['the architecture in 3 sentences', 'one real trade-off you made + why', 'how you would scale it / what breaks first'],
    fields: [{ key: 'arch', label: 'ARCHITECTURE (stack + the core design)', multiline: true, placeholder: '…' },
      { key: 'why', label: 'A REAL TRADE-OFF — "why this, not that"', placeholder: '…' },
      { key: 'scale', label: 'SCALING / WHAT BREAKS FIRST', placeholder: '…' }],
    build: v => ({ produce: `arch: ${v.arch}\n\nwhy-this-not-that: ${v.why}\n\nscaling: ${v.scale}`, trap: '', pattern: 'project' })
  };
  produceRep(root, { item, kind: 'project', day: campaignOn() ? campaignEntry()?.day : displayDayN(), onDone: () => rerender() });
}

async function coachReview(root, art, i) {
  const zone = root.querySelector(`#sd-cz-${i}`);
  if (!zone || !art) return;
  zone.innerHTML = '<p class="faint">⟁ Coach is reviewing…</p>';
  try {
    const r = await fetch('/api/coach', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem: `Design review: ${art.topic} (${art.mode})`,
        message: `Review my design Socratically — push on the weakest decision, do NOT give a full solution.\n\n${art.body}`,
        level: 3, context: {}
      })
    }).then(x => x.json());
    if (r.error) throw new Error(r.error);
    zone.innerHTML = `<div class="ailayer"><span class="ailabel">COACH</span><div class="vline" style="white-space:pre-wrap">${esc(r.reply)}</div></div>`;
  } catch (e) {
    zone.innerHTML = `<p class="danger">Coach offline (${esc(e.message)}) — the artifact still banked; review it yourself against the framework.</p>`;
  }
}
