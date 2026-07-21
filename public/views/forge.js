// The Forge (slate #3) — the boss-battle framing the brief invited. Every
// flagged problem and every gap-pile problem is a boss until it falls to a
// clean solo solve; FIGHT launches a blank re-solve. Tasteful, not confetti:
// the reward is the count going down and the flag clearing itself (a later
// solo solve removes it from the pile via the same derived logic). Days 19–20
// are when these fall — but it is open any time he wants to chip at the debt.
import { App, esc, sheetMark, problemInfo, displayDayN } from '../app.js';
import { bossPile } from '../stats.js';

const OUT = { solo: '✓ solo', hint: 'hint', editorial: 'editorial', abandoned: 'abandoned', unknown: '—' };

export function renderForge(root) {
  const { bosses, cleared, total } = bossPile(App.cur, App.state.log, App.state.cards);
  const pct = total ? Math.round(cleared / total * 100) : 100;
  const dayN = displayDayN();

  if (!total) {
    root.innerHTML = `
      <div class="panel forge">
        <div class="phaselbl">THE FORGE</div>
        <h2 class="ok">No bosses standing.</h2>
        <p class="muted">Every flagged problem and every gap has fallen to a clean solo solve.
          Nothing is hiding from you. Keep it that way.</p>
      </div>`;
    return;
  }

  const card = (b, i) => {
    // the tell (pattern/trick) is a spoiler for a blank solo re-solve — hold it
    // behind a click so the FIGHT still tests recognition first [user, 2026-06-15]
    const tell = b.trick
      ? `<span class="ailayer" style="display:block"><span class="ailabel">THE TRICK</span>${esc(b.trick)}</span>`
      : (problemInfo(b.problem)?.pattern
        ? `<div class="muted">pattern: <b>${esc(problemInfo(b.problem).pattern)}</b> <span class="faint">— the named trick lands with the card's AI layer</span></div>`
        : '');
    const trick = tell
      ? `<details class="bosstell" style="margin-top:6px"><summary class="faint" style="cursor:pointer">spoiler — reveal the tell (only if you're stuck)</summary><div style="margin-top:6px">${tell}</div></details>`
      : '';
    return `
      <div class="boss ${b.kind}">
        <div class="boss-head">
          <span class="boss-kind ${b.kind === 'gap' ? 'cyan' : 'danger'}">${b.kind === 'gap' ? '◇ GAP' : '⚑ FLAG'}</span>
          <span class="boss-name">${esc(b.problem)}</span>${sheetMark(b.problem)}
          <span class="faint" style="margin-left:auto">${esc(b.topic)}</span>
        </div>
        <div class="muted">last seen: <span class="outcome-${esc(b.lastOutcome)}">${OUT[b.lastOutcome] || esc(b.lastOutcome)}</span>${b.struggle ? ` · stalled on: <span class="amber">${esc(b.struggle)}</span>` : ''}</div>
        ${trick}
        <div class="actions" style="margin-top:10px">
          <button class="primary" data-fight="${i}">⚔ FIGHT — blank re-solve ▸</button>
        </div>
      </div>`;
  };

  root.innerHTML = `
    <div class="panel forge">
      <div class="phaselbl">THE FORGE — the Day 19–20 gauntlet</div>
      <h2><b class="${pct >= 100 ? 'ok' : ''}">${cleared}</b> / ${total} cleared
        <span class="right faint">${bosses.length} standing${dayN < 19 ? ' · the real fight is Days 19–20' : ''}</span></h2>
      <div class="bar" style="margin:8px 0 4px"><div class="fill ${pct >= 100 ? 'full' : ''}" style="width:${pct}%"></div></div>
      <p class="muted">A boss is every problem you flagged or reached optimal on only with help. It falls when you re-solve it
        from a blank file, solo — that very solve clears the flag on its own. Hardest first.</p>
    </div>
    <div class="bosslist">${bosses.map(card).join('')}</div>`;

  root.querySelector('.bosslist').addEventListener('click', e => {
    const btn = e.target.closest('button[data-fight]');
    if (!btn) return;
    App.pending = { problem: bosses[+btn.dataset.fight].problem, tier: 'A' };
    location.hash = '#/solve';
  });
}
