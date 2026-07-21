// Mock generator — §5.9. Samples 4 problems across topics weighted toward
// weak/flagged (stats.js:mockPick, the same audited weakScore as the log's
// readout) and runs a 90-minute interview-style timer. Results live in
// data/mocks.json ONLY — never the solve log, so solo-rate and the Day 19–20
// flag pool stay law-clean. The post-mortem card saves into the receipts.
import { App, esc, todayStr, mmss, saveMocks, rerender } from '../app.js';
import { mockPick, MOCK_PROBLEMS, MOCK_MIN } from '../stats.js';
import { solveElapsedMin, pausedMin } from '../laws.js';
import { chime, success, startAlarm, stopAlarm } from '../audio.js';

let timerId = null;
let mockKeyHandler = null;

export function cleanupMock() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  if (mockKeyHandler) window.removeEventListener('keydown', mockKeyHandler);
  mockKeyHandler = null;
  stopAlarm();
}

const round1 = x => Math.round(x * 10) / 10;
const active = () => {
  const last = App.state.mocks[App.state.mocks.length - 1];
  return last && !last.finished ? last : null;
};

export function renderMock(root) {
  cleanupMock();
  const m = active();
  if (!m) return renderLobby(root);
  if (!m.startTs) return renderArmed(root, m);
  if (m.pausedAt) return renderMockPaused(root, m); // R1 covers the mock too
  return renderRunning(root, m);
}

// ── R1 pause for the 90-minute clock: problems hidden, clock frozen ──────────
function renderMockPaused(root, m) {
  root.innerHTML = `
    <div class="solve pausedview" style="max-width:980px">
      <div class="phaselbl">MOCK PAUSED — board hidden · clock frozen at ${mmss(solveElapsedMin(m) * 60)}</div>
      <div class="bigclock dim" id="pclock">--:--</div>
      <div class="muted" id="psub">interview clocks do not pause — this is for real interruptions only</div>
      <div class="actions"><button class="primary" id="resumebtn">RESUME ▸<kbd>P</kbd></button></div>
    </div>`;
  const tick = () => { root.querySelector('#pclock').textContent = mmss(pausedMin(m) * 60); };
  timerId = setInterval(tick, 500);
  tick();
  const resume = async () => {
    m.pausedMs = (m.pausedMs || 0) + (Date.now() - m.pausedAt);
    m.pausedAt = null;
    await saveMocks();
    rerender();
  };
  root.querySelector('#resumebtn').addEventListener('click', resume);
  mockKeyHandler = e => {
    if (e.key.toLowerCase() === 'p' && !/INPUT|TEXTAREA/.test(e.target.tagName)) resume();
  };
  window.addEventListener('keydown', mockKeyHandler);
}

// ── no mock in flight: generate, and the receipts of past ones ───────────────
function renderLobby(root) {
  const past = App.state.mocks.filter(m => m.finished).slice().reverse();
  root.innerHTML = `
    <div class="panel">
      <h2>Mock — ${MOCK_PROBLEMS} problems · ${MOCK_MIN}:00 · interview conditions</h2>
      <p class="muted">Sampled across topics, weighted toward your weak topics and flagged/hinted
        problems — the same audited math as the LOG page's readout.</p>
      <p class="amber" style="margin-top:8px">Scheduled for Days 19–20 — an early run costs a full Tier A block.</p>
      <div class="actions" style="justify-content:flex-start;margin-top:14px">
        <button class="primary" id="genbtn">GENERATE MOCK ▸</button>
      </div>
    </div>
    ${past.length ? `<div class="panel">
      <h2>Past mocks</h2>
      <ul class="probs">
        ${past.map(m => {
          const solved = Object.values(m.results || {}).filter(Boolean).length;
          return `<li style="cursor:default">
            <span class="st ${solved >= 3 ? 'ok' : 'amber'}">${solved}/${m.problems.length}</span>
            <span class="nm">${new Date(m.ts).toLocaleDateString()} — ${m.problems.map(p => esc(p.problem)).join(' · ')}</span>
            <span class="faint" style="margin-left:auto;white-space:nowrap">${m.usedMin ?? '—'}m</span></li>`;
        }).join('')}
      </ul>
    </div>` : ''}`;
  root.querySelector('#genbtn').addEventListener('click', async () => {
    const pick = mockPick(App.cur, App.state.log, todayStr());
    if (!pick) { alert('Nothing to sample yet — the mock draws from problems you have attempted.'); return; }
    App.state.mocks.push({
      id: crypto.randomUUID(), ts: Date.now(), problems: pick.problems,
      minutes: pick.minutes, startTs: null, results: {}, usedMin: null, finished: false
    });
    await saveMocks();
    rerender();
  });
}

const problemCards = (m, marks) => m.problems.map((p, i) => `
  <div class="drillcard panel">
    <div class="dc-head">
      <span class="${p.why.startsWith('⚑') ? 'danger' : p.why === 'weak topic' ? 'amber' : 'ok'}">${esc(p.why)}</span>
      <span class="faint">${esc(p.topic)}</span>
    </div>
    <div class="dc-name">${i + 1}. ${esc(p.problem)}</div>
    ${marks ? `<div class="actions" style="justify-content:flex-start;margin-top:8px">
      <button class="good ${m.results[p.problem] === true ? 'sel' : ''}" data-ok="${i}">SOLVED ✓</button>
      <button class="warn ${m.results[p.problem] === false ? 'sel' : ''}" data-no="${i}">✗</button>
    </div>` : ''}
  </div>`).join('');

// ── generated, not started: the set is fixed until you commit ────────────────
function renderArmed(root, m) {
  root.innerHTML = `
    <div class="panel">
      <h2>Mock armed — ${m.problems.length} problems · ${m.minutes}:00 strict</h2>
      <p class="muted">Interview conditions: no editor archaeology, no Coach, paper for thinking.
        The clock starts when you say so and survives refresh.</p>
      <p class="amber" style="margin-top:6px">Scheduled for Days 19–20 — an early run costs a full Tier A block.</p>
      <div class="actions" style="justify-content:flex-start;margin-top:12px">
        <button class="primary" id="startbtn">START ${m.minutes}:00 ▸</button>
        <button id="regen">re-roll the set</button>
        <button id="discard">✕ discard</button>
      </div>
    </div>
    ${problemCards(m, false)}`;
  root.querySelector('#startbtn').addEventListener('click', async () => {
    m.startTs = Date.now();
    m.speed = App.speed;
    await saveMocks();
    rerender();
  });
  root.querySelector('#regen').addEventListener('click', async () => {
    const pick = mockPick(App.cur, App.state.log, todayStr());
    if (!pick) return;
    m.problems = pick.problems;
    m.ts = Date.now();
    await saveMocks();
    rerender();
  });
  root.querySelector('#discard').addEventListener('click', async () => {
    if (!confirm('Discard this mock set?')) return;
    App.state.mocks.pop();
    await saveMocks();
    rerender();
  });
}

// ── running: the 90-minute clock + live verdicts ─────────────────────────────
function renderRunning(root, m) {
  root.innerHTML = `
    <div class="solve" style="max-width:980px">
      <div class="phaselbl">MOCK · INTERVIEW CONDITIONS</div>
      <div class="bigclock" id="mockclock">--:--</div>
      <div class="muted" id="mockline"></div>
      <div style="text-align:left;margin-top:14px" id="mockcards">${problemCards(m, true)}</div>
      <div class="actions">
        <button class="primary" id="finishbtn">FINISH — post-mortem ▸</button>
        <button id="pausebtn">⏸ PAUSE<kbd>P</kbd></button>
      </div>
    </div>`;
  let alarmed = false;
  const tick = () => {
    const el = solveElapsedMin(m); // R1: paused time never advances the clock
    const remain = m.minutes - el;
    const bc = root.querySelector('#mockclock');
    if (!bc) return;
    bc.textContent = remain > 0 ? mmss(remain * 60) : 'TIME';
    bc.classList.toggle('late', remain <= 10);
    root.querySelector('#mockline').textContent = remain > 0
      ? `${Object.values(m.results).filter(v => v === true).length}/${m.problems.length} solved · no editor archaeology · no Coach · pens down at 0:00`
      : 'time is up — mark the board and finish.';
    if (remain <= 0 && !alarmed) { alarmed = true; startAlarm(); }
  };
  timerId = setInterval(tick, 250);
  tick();

  root.querySelector('#mockcards').addEventListener('click', async e => {
    const ok = e.target.closest('button[data-ok]');
    const no = e.target.closest('button[data-no]');
    if (!ok && !no) return;
    const p = m.problems[+(ok?.dataset.ok ?? no.dataset.no)];
    m.results[p.problem] = !!ok;
    await saveMocks();
    rerender();
  });
  root.querySelector('#pausebtn').addEventListener('click', async () => {
    m.pausedAt = Date.now();
    m.pauseCount = (m.pauseCount || 0) + 1;
    await saveMocks();
    rerender();
  });
  mockKeyHandler = e => {
    if (e.key.toLowerCase() === 'p' && !/INPUT|TEXTAREA/.test(e.target.tagName))
      root.querySelector('#pausebtn').click();
  };
  window.addEventListener('keydown', mockKeyHandler);
  root.querySelector('#finishbtn').addEventListener('click', async () => {
    const unmarked = m.problems.filter(p => m.results[p.problem] === undefined);
    if (unmarked.length && !confirm(`${unmarked.length} unmarked problem(s) count as ✗. Finish?`)) return;
    stopAlarm();
    for (const p of unmarked) m.results[p.problem] = false;
    m.usedMin = Math.min(m.minutes, round1(solveElapsedMin(m)));
    m.pausedMin = round1(pausedMin(m));
    m.finished = true;
    await saveMocks();
    await saveMockCard(m).catch(() => {});
    success();
    renderPostMortem(document.getElementById('view'), m);
  });
}

// ── post-mortem + the receipt card ───────────────────────────────────────────
function renderPostMortem(root, m) {
  cleanupMock();
  const solved = Object.values(m.results).filter(Boolean).length;
  root.innerHTML = `
    <div class="solve" style="max-width:980px">
      <div class="phaselbl">MOCK POST-MORTEM</div>
      <div class="bigclock" style="font-size:64px"><span class="${solved >= 3 ? 'ok' : 'amber'}">${solved}</span>/${m.problems.length}</div>
      <div class="muted">${m.usedMin}m of ${m.minutes} · receipt saved to the wall
        ${m.pauseCount ? ` · <span class="amber">⏸ ${m.pauseCount} pause${m.pauseCount > 1 ? 's' : ''}, ${m.pausedMin ?? 0}m paused</span>` : ''}</div>
      <div style="text-align:left;margin-top:14px">
        ${m.problems.map(p => `
          <div class="panel" style="display:flex;gap:10px;align-items:center">
            <span class="st ${m.results[p.problem] ? 'solo' : 'abandoned'}" style="width:22px;text-align:center">${m.results[p.problem] ? '✓' : '✗'}</span>
            <span>${esc(p.problem)}</span>
            <span class="faint" style="margin-left:auto">${esc(p.topic)} · ${esc(p.why)}</span>
          </div>`).join('')}
      </div>
      <p class="muted" style="margin-top:10px">Misses are interview data: post-mortem each one — was it the pattern,
        the implementation, or the clock? Flagged problems stay in the Day 19–20 pool.</p>
      <div class="actions">
        <button class="primary" id="donebtn">DONE ▸</button>
        <a href="#/wall"><button>see the receipts</button></a>
      </div>
    </div>`;
  root.querySelector('#donebtn').addEventListener('click', () => { location.hash = '#/'; rerender(); });
}

// compact result card into the receipts gallery (same visual family as the
// evidence card — this is the interview-sim receipt)
async function saveMockCard(m) {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const MONO = px => `${px}px Consolas, "Cascadia Code", monospace`;
  const BOLD = px => `bold ${px}px Consolas, "Cascadia Code", monospace`;
  x.fillStyle = '#0b0e13'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#4cc2ff'; x.fillRect(0, 0, W, 6);
  x.fillStyle = '#e5484d'; x.font = BOLD(36); x.fillText('WAR ROOM', 48, 84);
  x.fillStyle = '#7d8a9c'; x.font = MONO(24); x.textAlign = 'right';
  x.fillText(`${todayStr()}  ·  MOCK — INTERVIEW CONDITIONS`, W - 48, 84);
  x.textAlign = 'left';
  const solved = Object.values(m.results).filter(Boolean).length;
  x.fillStyle = '#d7dde7'; x.font = BOLD(150);
  x.fillText(`${solved}/${m.problems.length}`, 48, 290);
  x.fillStyle = '#7d8a9c'; x.font = MONO(22);
  x.fillText(`${m.usedMin}m of ${m.minutes} on the clock${m.pauseCount ? `  ·  ⏸ ${m.pauseCount} pause${m.pauseCount > 1 ? 's' : ''} (${m.pausedMin ?? 0}m)` : ''}`, 50, 332);
  let y = 410;
  for (const p of m.problems) {
    x.fillStyle = m.results[p.problem] ? '#46c46e' : '#e5484d';
    x.font = BOLD(24);
    x.fillText(m.results[p.problem] ? '✓' : '✗', 48, y);
    x.fillStyle = '#d7dde7'; x.font = MONO(22);
    x.fillText(p.problem.slice(0, 52), 86, y);
    x.fillStyle = '#4a5568'; x.font = MONO(17);
    x.fillText(`${p.topic} · ${p.why}`, 700, y);
    y += 44;
  }
  x.fillStyle = '#4a5568'; x.font = BOLD(16); x.textAlign = 'right';
  x.fillText('PROOF OF WORK', W - 48, 600);
  await fetch('/api/evidence', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: `mock-${App.state.mocks.length}-${todayStr()}`, png: cv.toDataURL('image/png') })
  });
}
