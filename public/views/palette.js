// Ctrl+K command palette (Wave 4 minor) — views, problems, actions. One box,
// zero mouse. Problems launch straight into their tier's cockpit.
import { App, esc, todayStr } from '../app.js';

let host = null, items = [], hits = [], sel = 0;

function allItems() {
  const out = [];
  for (const [label, hash] of [
    ['MISSION CONTROL', '#/'], ['CALENDAR', '#/calendar'], ['CARD VAULT', '#/cards'],
    ['EVIDENCE WALL', '#/wall'], ['SPEED DRILL', '#/ladder'], ['MOCK', '#/mock'],
    ['DATA ROOM (LOG)', '#/log'], ['REPORT', '#/report'],
    // Season 2 lanes (reachability sweep — every routed view is palette-reachable)
    ['COMMAND CENTER', '#/command'], ['DURABILITY', '#/durability'],
    ['CF-ASCENT', '#/cf-ascent'], ['CORE CS (RECALLARENA)', '#/corecs'],
    ['SYSTEM DESIGN', '#/sysd'], ['FORGE', '#/forge'],
    ['OA SIMULATOR', '#/oa'], ['PRODUCE GAUNTLET', '#/gauntlet'],
    ['MOCK INTERVIEW (5 ROUNDS)', '#/interview'], ['RAPID-FIRE NAMING', '#/rapidfire'],
    // Season 3
    ['WAR PLAN (10-DAY CRUNCH)', '#/warplan'], ['ARENA (BLIND BANKS)', '#/arena'],
    ['DOCTRINE (THEORY + DRILLS)', '#/doctrine'], ['GRILL ROOM (PROJECTS)', '#/grill'],
    ['DP (LEGACY TRACK)', '#/dp']
  ]) out.push({ label, hint: 'view', act: () => { location.hash = hash; } });
  out.push({
    label: 'SHUFFLE REVIEW (Block 5)', hint: 'action',
    act: () => { location.hash = '#/cards'; }
  });
  const today = todayStr();
  for (const d of App.cur.days) {
    for (const [tier, list] of [['A', d.tierA || []], ['B', d.tierB || []]]) {
      for (const p of list) {
        if (/^ALL remaining|^Overflow-log/i.test(p)) continue;
        out.push({
          label: p, hint: `D${d.day} · ${tier === 'A' ? 'solve' : 'recognize'}`,
          act: () => {
            App.pending = { problem: p, tier, ...(d.date !== today ? { forDay: d.date } : {}) };
            location.hash = tier === 'A' ? '#/solve' : '#/recognize';
          }
        });
      }
    }
  }
  return out;
}

function paint() {
  const q = host.querySelector('#palq').value.trim().toLowerCase();
  const score = it => {
    const l = it.label.toLowerCase();
    if (!q) return it.hint === 'view' || it.hint === 'action' ? 2 : 0;
    if (l.startsWith(q)) return 3;
    if (l.includes(q)) return 2;
    return q.split(/\s+/).every(w => l.includes(w)) ? 1 : 0;
  };
  hits = items.map(it => [score(it), it]).filter(([s]) => s > 0)
    .sort((a, b) => b[0] - a[0]).slice(0, 12).map(([, it]) => it);
  sel = Math.min(sel, Math.max(0, hits.length - 1));
  host.querySelector('#pallist').innerHTML = hits.length
    ? hits.map((it, i) => `<li class="${i === sel ? 'sel' : ''}" data-i="${i}">
        <span>${esc(it.label)}</span><span class="faint">${esc(it.hint)}</span></li>`).join('')
    : '<li class="faint" style="justify-content:center">nothing matches</li>';
}

export function closePalette() {
  host?.remove();
  host = null;
}

export function openPalette() {
  if (host) { closePalette(); return; }
  items = allItems();
  sel = 0;
  host = document.createElement('div');
  host.id = 'palette';
  host.innerHTML = `
    <div class="palbox">
      <input id="palq" type="text" placeholder="view, problem, action… (Esc closes)" autocomplete="off">
      <ul id="pallist"></ul>
    </div>`;
  document.body.appendChild(host);
  const input = host.querySelector('#palq');
  input.focus();
  paint();
  input.addEventListener('input', () => { sel = 0; paint(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, hits.length - 1); paint(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); paint(); }
    if (e.key === 'Enter' && hits[sel]) { const it = hits[sel]; closePalette(); it.act(); }
  });
  host.addEventListener('click', e => {
    if (e.target === host) return closePalette();
    const li = e.target.closest('li[data-i]');
    if (li) { const it = hits[+li.dataset.i]; closePalette(); it.act(); }
  });
}
