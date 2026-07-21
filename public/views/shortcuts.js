// Shortcuts overlay (Open-Wave slate, deferred #7) — press ? for a per-context
// keyboard cheat-sheet. Pure reference, no state; mirrors the palette overlay
// pattern (standalone element on <body>, removed on close). Esc / ? close it.
import { esc } from '../app.js';

const GROUPS = [
  ['Global', [
    ['Ctrl+K', 'command palette — jump to any view, problem, or action'],
    ['?', 'this shortcuts sheet'],
    ['Esc', 'close the palette / this sheet'],
    ['N', 'NOW · NEXT — launch the next rep (Mission Control)'],
  ]],
  ['Solve cockpit · Tier A (10/10/35)', [
    ['S', 'mark solved'],
    ['B', 'stuck on a bug — start the 10-min debug timer'],
    ['C', 'open / close the Coach drawer'],
    ['P', 'pause / resume (problem hidden, clock frozen)'],
    ['O', 'open the problem on TUF+ / its platform'],
    ['gate (min 10)', 'Y have an approach · A read approach · C ask Coach'],
    ['ceiling (min 35)', '1 solved · 2 read solution → re-implement'],
  ]],
  ['Recognition · Tier B (7-min)', [
    ['Ctrl+Enter', 'REVEAL the canonical card'],
    ['A', 'attack plan — restate · sketch · dry-run (anti-freeze)'],
    ['P', 'pause / resume'],
    ['1 / 2 / 3', 'grade recall — ✓ nailed · ~ close · ✗ missed'],
    ['Enter', 'go to the next rep (after grading)'],
  ]],
];

let host = null;

export function closeShortcuts() {
  host?.remove();
  host = null;
}

export function openShortcuts() {
  if (host) { closeShortcuts(); return; }
  host = document.createElement('div');
  host.id = 'shortcuts';
  host.innerHTML = `
    <div class="scbox">
      <div class="sc-head">KEYBOARD — keyboard-first, mouse-optional <span class="faint">Esc closes</span></div>
      <div class="sc-groups">
        ${GROUPS.map(([title, rows]) => `<div class="sc-group">
          <h4>${esc(title)}</h4>
          <table>${rows.map(([k, d]) =>
            `<tr><td class="sc-k"><kbd>${esc(k)}</kbd></td><td>${esc(d)}</td></tr>`).join('')}</table>
        </div>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(host);
  host.addEventListener('click', e => { if (e.target === host) closeShortcuts(); });
}
