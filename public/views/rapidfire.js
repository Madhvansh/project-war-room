// SEASON 2 Wave 8 — rapid-fire pattern naming (#/rapidfire). The interview's first
// decider is FAST pattern recognition. Statement → name the pattern in your head in
// <10s → reveal the canonical (problems.json) → self-mark. Lighter than the §3.2
// Tier-B rep; this builds the reflex the crowd lacks. Read-only over the trigger bank.
import { App, esc, problemInfo } from '../app.js';

let keyHandler = null;
export function cleanupRapidfire() { if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = null; }

function pool() {
  const names = new Set();
  for (const d of App.cur.days) for (const p of [...(d.tierA || []), ...(d.tierB || [])]) names.add(p);
  return [...names].filter(n => problemInfo(n)?.pattern);
}

export function renderRapidfire(root) {
  cleanupRapidfire();
  const items = pool();
  if (!items.length) { root.innerHTML = '<div class="panel"><p class="faint">trigger bank (problems.json) not loaded yet — try again in a moment.</p></div>'; return; }
  let order = items.map((p, i) => i).sort(() => Math.random() - 0.5).slice(0, 20);
  let i = 0, revealed = false; const score = { hit: 0, miss: 0 };

  const paint = () => {
    cleanupRapidfire();
    if (i >= order.length) return done();
    const name = items[order[i]]; const info = problemInfo(name);
    root.innerHTML = `<div class="solve"><div class="phaselbl">RAPID-FIRE · ${i + 1}/${order.length} <span class="faint">name the pattern in &lt;10s</span></div>
      <div class="probname">${esc(name)}</div>
      <div class="flipcard panel" style="max-width:560px;margin:14px auto;text-align:left">
        ${revealed ? `<div class="ftag">PATTERN</div><div class="fpattern">${esc(info.pattern)}</div>
          <div class="vline" style="margin-top:6px"><span class="vtag">⚡</span>${esc(info.trigger || '')}</div>`
        : '<div class="faint">say the pattern out loud, then reveal</div>'}</div>
      <div class="actions">${revealed
        ? '<button class="good" id="rf-hit">KNEW IT<kbd>1</kbd></button><button class="warn" id="rf-miss">missed<kbd>2</kbd></button>'
        : '<button class="primary" id="rf-rev">REVEAL<kbd>Space</kbd></button>'}<button id="rf-quit">✕ quit</button></div></div>`;
    const reveal = () => { revealed = true; paint(); };
    const mark = hit => { hit ? score.hit++ : score.miss++; i++; revealed = false; paint(); };
    root.querySelector('#rf-rev')?.addEventListener('click', reveal);
    root.querySelector('#rf-hit')?.addEventListener('click', () => mark(true));
    root.querySelector('#rf-miss')?.addEventListener('click', () => mark(false));
    root.querySelector('#rf-quit').addEventListener('click', () => { location.hash = '#/command'; });
    keyHandler = e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' && !revealed) { e.preventDefault(); reveal(); }
      if (revealed && e.key === '1') mark(true);
      if (revealed && e.key === '2') mark(false); };
    window.addEventListener('keydown', keyHandler);
  };
  const done = () => {
    cleanupRapidfire();
    const pct = Math.round(score.hit / Math.max(1, score.hit + score.miss) * 100);
    root.innerHTML = `<div class="solve"><div class="phaselbl">RAPID-FIRE DONE</div>
      <div class="bigclock" style="font-size:64px"><span class="${pct >= 70 ? 'ok' : 'amber'}">${score.hit}</span>/${score.hit + score.miss}</div>
      <p class="muted">${pct}% named cold. Fast recognition is the first filter — drill it daily.</p>
      <div class="actions"><button class="primary" onclick="location.hash='#/command'">DONE ▸</button></div></div>`;
  };
  paint();
}
