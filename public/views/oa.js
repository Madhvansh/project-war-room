// SEASON 2 Wave 8 — OA simulator (#/oa): the gate that filters most candidates.
// 2-3 problems, 90 min strict, curated from the CF 1700-1900 / LC-hard pool you
// log in CF-Ascent + DP. Per-problem AC / partial / 0 (OAs give partial credit),
// and a wrong-answer AUTOPSY tag (pattern / implementation / clock) on every miss
// — the highest-signal fix-next data. Sessions live in data/oa-sims.json, SEPARATE
// from mocks.json so the §5.9 mock pool + solo-rate stay law-clean. Off-sheet.
import { App, esc, todayStr, mmss, saveOaSims, rerender } from '../app.js';
import { solveElapsedMin } from '../laws.js';
import { startAlarm, stopAlarm, success } from '../audio.js';

let timerId = null, keyHandler = null;
export function cleanupOa() { if (timerId) clearInterval(timerId); timerId = null; if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = null; stopAlarm(); }

const OA_MIN = 90;
const MARK = { ac: '✓', partial: '~', zero: '✗' };
const active = () => { const a = App.state.oaSims; const last = a[a.length - 1]; return last && !last.finished ? last : null; };
const round1 = x => Math.round(x * 10) / 10;

export function renderOa(root) {
  cleanupOa();
  const m = active();
  if (!m) return renderLobby(root);
  if (!m.startTs) return renderArmed(root, m);
  return renderRunning(root, m);
}

function suggestPool() {
  const cf = (App.state.cfAscent?.attempts || []).filter(a => a.rating && a.rating >= 1700).map(a => ({ problem: a.problem, rating: a.rating }));
  const dp = Object.entries(App.state.dp?.solved || {}).slice(-6).map(([p]) => ({ problem: p, rating: 'LC-hard' }));
  return [...cf, ...dp].slice(0, 8);
}

function renderLobby(root) {
  const past = App.state.oaSims.filter(m => m.finished).slice().reverse();
  const pool = suggestPool();
  root.innerHTML = `
    <div class="panel"><h2>OA simulator — 2-3 problems · ${OA_MIN}:00 · 1800-1900 band</h2>
      <p class="muted">The exact filter most candidates fail: time pressure on hard problems with partial credit. Add 2-3 (from <a href="https://cf-ascent.netlify.app/" target="_blank" rel="noopener">CF-Ascent</a> 1700-1900 + a hard LC), then start the clock.</p>
      <div class="oa-add" id="oa-rows"></div>
      ${pool.length ? `<p class="faint" style="margin-top:8px">from your climb: ${pool.map(p => `<button class="ghost oa-suggest" data-p="${esc(p.problem)}" data-r="${esc(String(p.rating))}" style="margin:2px">${esc(p.problem)}</button>`).join('')}</p>` : ''}
      <div class="actions" style="justify-content:flex-start;margin-top:10px"><button class="primary" id="oa-arm">ARM ${OA_MIN}:00 ▸</button></div>
    </div>
    ${past.length ? `<div class="panel"><h2>Past OAs</h2><ul class="probs">${past.map(m => {
      const ac = Object.values(m.results || {}).filter(v => v === 'ac').length, pa = Object.values(m.results || {}).filter(v => v === 'partial').length;
      return `<li style="cursor:default"><span class="st ${ac >= 2 ? 'ok' : 'amber'}">${ac}✓${pa ? ' ' + pa + '~' : ''}</span><span class="nm">${new Date(m.ts).toLocaleDateString()} — ${m.problems.map(p => esc(p.problem)).join(' · ')}</span><span class="faint" style="margin-left:auto">${m.usedMin ?? '—'}m</span></li>`;
    }).join('')}</ul></div>` : ''}`;
  let rows = [{ problem: '', rating: '' }, { problem: '', rating: '' }];
  const paintRows = () => {
    root.querySelector('#oa-rows').innerHTML = rows.map((r, i) => `<div class="ladder-add" style="margin-bottom:6px">
      <input data-pr="${i}" type="text" placeholder="problem ${i + 1}" value="${esc(r.problem)}" autocomplete="off">
      <input data-rt="${i}" type="text" placeholder="rating" value="${esc(r.rating)}" style="width:90px" autocomplete="off">
      ${rows.length > 2 ? `<button data-rm="${i}">✕</button>` : ''}</div>`).join('')
      + (rows.length < 3 ? '<button id="oa-more" class="ghost">+ add a 3rd</button>' : '');
    root.querySelector('#oa-more')?.addEventListener('click', () => { syncRows(); rows.push({ problem: '', rating: '' }); paintRows(); });
    root.querySelectorAll('button[data-rm]').forEach(b => b.addEventListener('click', () => { syncRows(); rows.splice(+b.dataset.rm, 1); paintRows(); }));
  };
  const syncRows = () => rows.forEach((r, i) => { r.problem = root.querySelector(`[data-pr="${i}"]`)?.value.trim() || ''; r.rating = root.querySelector(`[data-rt="${i}"]`)?.value.trim() || ''; });
  paintRows();
  root.querySelectorAll('.oa-suggest').forEach(b => b.addEventListener('click', () => { syncRows(); const slot = rows.find(r => !r.problem); if (slot) { slot.problem = b.dataset.p; slot.rating = b.dataset.r; } paintRows(); }));
  root.querySelector('#oa-arm').addEventListener('click', async () => {
    syncRows();
    const problems = rows.filter(r => r.problem).map(r => ({ problem: r.problem, rating: r.rating || null }));
    if (problems.length < 2) { alert('Add at least 2 problems.'); return; }
    App.state.oaSims.push({ id: crypto.randomUUID(), ts: Date.now(), problems, minutes: OA_MIN, startTs: null, results: {}, autopsy: {}, usedMin: null, finished: false });
    await saveOaSims(); rerender();
  });
}

function renderArmed(root, m) {
  root.innerHTML = `
    <div class="panel"><h2>OA armed — ${m.problems.length} problems · ${m.minutes}:00 strict</h2>
      <p class="muted">No editor archaeology, no Coach. Partial credit counts. Pens down at 0:00.</p>
      ${m.problems.map((p, i) => `<div class="drillcard panel"><div class="dc-name">${i + 1}. ${esc(p.problem)} <span class="faint">${p.rating ? '· ' + esc(String(p.rating)) : ''}</span></div></div>`).join('')}
      <div class="actions" style="justify-content:flex-start"><button class="primary" id="oa-start">START ${m.minutes}:00 ▸</button><button id="oa-discard">✕ discard</button></div>
    </div>`;
  root.querySelector('#oa-start').addEventListener('click', async () => { m.startTs = Date.now(); m.speed = App.speed; await saveOaSims(); rerender(); });
  root.querySelector('#oa-discard').addEventListener('click', async () => { if (!confirm('Discard?')) return; App.state.oaSims.pop(); await saveOaSims(); rerender(); });
}

function renderRunning(root, m) {
  const cards = () => m.problems.map((p, i) => `<div class="drillcard panel">
    <div class="dc-name">${i + 1}. ${esc(p.problem)} <span class="faint">${p.rating ? '· ' + esc(String(p.rating)) : ''}</span></div>
    <div class="actions" style="justify-content:flex-start;margin-top:6px">
      <button class="good ${m.results[p.problem] === 'ac' ? 'sel' : ''}" data-r="ac" data-p="${i}">AC ✓</button>
      <button class="warn ${m.results[p.problem] === 'partial' ? 'sel' : ''}" data-r="partial" data-p="${i}">partial ~</button>
      <button class="${m.results[p.problem] === 'zero' ? 'sel' : ''}" data-r="zero" data-p="${i}">0 ✗</button>
    </div></div>`).join('');
  root.innerHTML = `<div class="solve" style="max-width:980px"><div class="phaselbl">OA · ${m.minutes} MIN · PARTIAL CREDIT COUNTS</div>
    <div class="bigclock" id="oa-clock">--:--</div><div class="muted" id="oa-line"></div>
    <div style="text-align:left;margin-top:14px" id="oa-cards">${cards()}</div>
    <div class="actions"><button class="primary" id="oa-finish">FINISH — autopsy ▸</button></div></div>`;
  let alarmed = false;
  const tick = () => {
    const remain = m.minutes - solveElapsedMin(m); const bc = root.querySelector('#oa-clock'); if (!bc) return;
    bc.textContent = remain > 0 ? mmss(remain * 60) : 'TIME'; bc.classList.toggle('late', remain <= 10);
    root.querySelector('#oa-line').textContent = remain > 0 ? `${Object.values(m.results).filter(v => v === 'ac').length} AC · narrate · no Coach` : 'time — mark and finish.';
    if (remain <= 0 && !alarmed) { alarmed = true; startAlarm(); }
  };
  timerId = setInterval(tick, 250); tick();
  root.querySelector('#oa-cards').addEventListener('click', async e => {
    const b = e.target.closest('button[data-r]'); if (!b) return;
    m.results[m.problems[+b.dataset.p].problem] = b.dataset.r; await saveOaSims(); rerender();
  });
  root.querySelector('#oa-finish').addEventListener('click', async () => {
    stopAlarm();
    for (const p of m.problems) if (!m.results[p.problem]) m.results[p.problem] = 'zero';
    m.usedMin = Math.min(m.minutes, round1(solveElapsedMin(m))); m.finished = true;
    await saveOaSims(); success(); renderAutopsy(root, m);
  });
}

// post-mortem — every miss gets a 3-way autopsy: pattern / implementation / clock
function renderAutopsy(root, m) {
  cleanupOa();
  const ac = Object.values(m.results).filter(v => v === 'ac').length, pa = Object.values(m.results).filter(v => v === 'partial').length;
  const misses = m.problems.filter(p => m.results[p.problem] !== 'ac');
  root.innerHTML = `<div class="solve" style="max-width:980px"><div class="phaselbl">OA POST-MORTEM — autopsy every miss</div>
    <div class="bigclock" style="font-size:56px"><span class="${ac >= 2 ? 'ok' : 'amber'}">${ac}</span>✓ ${pa}~ <span class="faint" style="font-size:22px">in ${m.usedMin}m</span></div>
    <div style="text-align:left;margin-top:14px">
      ${m.problems.map(p => `<div class="panel" style="display:flex;gap:10px;align-items:center">
        <span class="st ${m.results[p.problem] === 'ac' ? 'solo' : m.results[p.problem] === 'partial' ? 'amber' : 'abandoned'}" style="width:20px">${MARK[m.results[p.problem]]}</span>
        <span>${esc(p.problem)}</span>
        ${m.results[p.problem] !== 'ac' ? `<span class="oa-autopsy" style="margin-left:auto">${['pattern', 'impl', 'clock'].map(t => `<button class="ghost ${m.autopsy[p.problem] === t ? 'sel' : ''}" data-au="${t}" data-p="${esc(p.problem)}">${t}</button>`).join('')}</span>` : '<span class="faint" style="margin-left:auto">clean ✓</span>'}
      </div>`).join('')}
    </div>
    <p class="muted" style="margin-top:8px">Tag what really killed each miss — the pattern, the implementation, or the clock. The command center shows which failure mode dominates.</p>
    <div class="actions"><button class="primary" id="oa-done">DONE ▸</button> <a href="#/command"><button>command center</button></a></div></div>`;
  root.querySelectorAll('button[data-au]').forEach(b => b.addEventListener('click', async () => {
    m.autopsy[b.dataset.p] = b.dataset.au; await saveOaSims();
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x === b));
  }));
  root.querySelector('#oa-done').addEventListener('click', () => { location.hash = '#/command'; });
}
