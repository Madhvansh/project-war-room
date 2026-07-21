// SEASON 3 — WAR PLAN (#/warplan): the 10-day crunch board + the evidence gates.
// The shipped spine (warplan.s3.json) gives every day floor/target/stretch;
// only unfinished floor/target work carries forward, ONE day, as ↩ chips;
// stretch auto-drops guilt-free. The scoreboard is EVIDENCE-GATED: six gates,
// overall capped by the WEAKEST gate, "INSUFFICIENT EVIDENCE" until every
// minimum sample exists — cold + delayed performance move it, box-checking
// cannot (the checklist tracks execution; the gates track proof). Additive —
// writes only data/warplan.json.
import { App, esc, todayStr, saveWarplan, rerender, s3Content } from '../app.js';
import { evidenceGates } from '../stats.js';

let WP; // warplan.s3.json: undefined = not requested, 'pending' = fetching, null = missing, object = loaded

export function renderWarplan(root) {
  if (WP === undefined) { // request exactly once — a null result must never re-trigger (render-loop guard)
    WP = 'pending';
    s3Content('warplan').then(w => {
      WP = w;
      if ((location.hash || '').startsWith('#/warplan')) rerender();
    });
  }
  if (WP === 'pending') { root.innerHTML = '<div class="panel"><p class="faint">loading the war plan…</p></div>'; return; }
  if (!WP || !WP.days) { root.innerHTML = '<div class="panel"><p class="faint">warplan.s3.json missing — the crunch board is unavailable.</p></div>'; return; }
  paint(root);
}

const dd = () => (App.state.warplan ||= { checked: {}, diagnostic: {} });
const ckey = (date, id) => `${date}::${id}`;
const isChecked = (date, id) => !!dd().checked[ckey(date, id)];

// today's evidence line — the honest counter under the checklist
function todayEvidence() {
  const t = todayStr();
  const ar = (App.state.arena?.attempts || []).filter(a => a.date === t);
  const rc = (App.state.doctrine?.recalls || []).filter(r => r.date === t);
  const gd = (App.state.grill?.drilled || []).filter(d => d.date === t);
  return `${ar.filter(a => a.mode === 'blind').length} blind · ${ar.filter(a => a.mode === 'resolve').length} re-solves · ${rc.length} recalls (${rc.filter(r => r.delayed).length} delayed) · ${gd.length} grill answers`;
}

function gateRow(g) {
  return `
    <div class="ct-row" data-go="${g.hash}">
      <div class="ct-top"><span class="ct-label">${esc(g.label)}</span>
        <span class="ct-pct ${g.pct >= 100 ? 'ok' : g.pct >= 50 ? 'amber' : 'danger'}">${g.pct}%</span></div>
      <div class="bar"><div class="fill ${g.pct >= 100 ? 'full' : ''}" style="width:${g.pct}%"></div></div>
      <div class="ct-detail faint" title="${esc(g.need)}">${esc(g.have)}</div>
    </div>`;
}

function taskRow(day, t, tier, carried = false) {
  const on = isChecked(day.date, t.id);
  return `<li class="wp-task ${on ? 'done' : ''}" data-ck="${esc(ckey(day.date, t.id))}" style="cursor:pointer">
    <span class="st ${on ? 'solo' : ''}">${on ? '✓' : tier === 'floor' ? '■' : tier === 'target' ? '□' : '·'}</span>
    <span class="nm">${carried ? '<span class="amber">↩ </span>' : ''}${esc(t.label)}</span>
    ${t.go ? `<a href="${esc(t.go)}" class="faint" style="margin-left:auto" data-stop>launch ▸</a>` : ''}</li>`;
}

function paint(root) {
  const today = todayStr();
  const ev = evidenceGates(App.state, today);
  const d = dd();
  // the active day is a CLAMPED DAY-OFFSET from the plan's own meta.start, never
  // an exact date match: the server re-bases these dates onto your configured
  // start, and a plan pinned to absolute dates stranded everyone on the last day
  // the moment the literal window passed. Offset math keeps the board honest
  // whatever the dates say; exact match survives only as the no-meta fallback.
  const base = WP.meta?.start || WP.days[0]?.date;
  const off = Math.floor((Date.parse(today) - Date.parse(base)) / 864e5);
  const tIdx = Number.isFinite(off)
    ? Math.min(Math.max(off, 0), WP.days.length - 1)
    : Math.max(0, WP.days.findIndex(x => x.date === today));
  const todayEntry = WP.days[tIdx];
  // carry-forward: yesterday's unchecked floor+target only, one day back (the rule)
  const yIdx = tIdx - 1;
  const carried = yIdx >= 0
    ? [...(WP.days[yIdx].floor || []), ...(WP.days[yIdx].target || [])]
        .filter(t => !isChecked(WP.days[yIdx].date, t.id))
        .map(t => ({ ...t, fromDate: WP.days[yIdx].date }))
    : [];

  const dayBox = (day) => {
    const isToday = day === todayEntry;
    const all = [...(day.floor || []), ...(day.target || [])];
    const done = all.filter(t => isChecked(day.date, t.id)).length;
    const floorDone = (day.floor || []).every(t => isChecked(day.date, t.id));
    return `
      <details class="wp-day panel" ${isToday ? 'open' : ''}>
        <summary><b>D${day.d}</b> · ${esc(day.date)} — ${esc(day.title)}
          <span class="right ${floorDone ? 'ok' : done ? 'amber' : 'faint'}">${done}/${all.length}${floorDone ? ' · floor ✓' : ''}${isToday ? ' · TODAY' : ''}</span></summary>
        <p class="muted" style="margin:6px 0">${esc(day.focus || '')}</p>
        ${isToday && carried.length ? `<div class="wp-carry">↩ carried from ${esc(carried[0].fromDate)} (one day only — after that it drops):</div>
          <ul class="probs">${carried.map(t => taskRow({ date: t.fromDate }, t, 'floor', true)).join('')}</ul>` : ''}
        <div class="wp-tier faint">FLOOR — non-negotiable</div>
        <ul class="probs">${(day.floor || []).map(t => taskRow(day, t, 'floor')).join('')}</ul>
        ${(day.target || []).length ? `<div class="wp-tier faint">TARGET — a good day</div>
          <ul class="probs">${day.target.map(t => taskRow(day, t, 'target')).join('')}</ul>` : ''}
        ${(day.stretch || []).length ? `<div class="wp-tier faint">STRETCH — auto-drops, zero guilt</div>
          <ul class="probs">${day.stretch.map(t => taskRow(day, t, 'stretch')).join('')}</ul>` : ''}
        ${isToday ? `<p class="faint" style="margin-top:8px">today's evidence: ${esc(todayEvidence())}</p>` : ''}
      </details>`;
  };

  root.innerHTML = `
    <div class="panel">
      <h2>Evidence gates — the Season-3 scoreboard
        <span class="right ${ev.sufficient ? 'ok' : 'danger'}">${ev.sufficient ? 'EVIDENCE COMPLETE ✓' : `INSUFFICIENT EVIDENCE — weakest: ${esc(ev.weakest.label)} ${ev.weakest.pct}%`}</span></h2>
      <p class="muted">Overall readiness is capped by the weakest gate. Opening lessons, checking boxes and self-ratings cannot raise it — cold and delayed performance can. <span class="faint">(The command-center % is the legacy Season-2 scoreboard.)</span></p>
      <div class="wp-gates">${ev.gates.map(gateRow).join('')}</div>
    </div>
    ${!d.diagnostic?.done ? `<div class="panel"><h2 class="amber">Day-1 diagnostic — run the baseline first</h2>
      <p class="muted">Before studying anything: measure. Do D1's floor items below (blind classification, one full blind solve, cold probes, three pitches, the ownership audit), then close the diagnostic — the gates become your baseline.</p>
      <button class="primary" id="wp-diag">DIAGNOSTIC DONE — baseline locked ▸</button></div>` : ''}
    <h3 class="dp-h3">The 10 days — ${esc(WP.meta?.start || '')} → ${esc(WP.meta?.end || '')}</h3>
    <p class="muted" style="margin:4px 0 10px">${esc(WP.meta?.note || '')}</p>
    ${WP.days.map(dayBox).join('')}`;

  for (const el of root.querySelectorAll('[data-go]')) el.addEventListener('click', () => { location.hash = el.dataset.go; });
  for (const li of root.querySelectorAll('li[data-ck]')) li.addEventListener('click', async e => {
    if (e.target.closest('[data-stop]')) return; // the launch link navigates, never toggles
    const k = li.dataset.ck;
    const c = dd().checked;
    c[k] ? delete c[k] : (c[k] = Date.now());
    await saveWarplan();
    rerender();
  });
  root.querySelector('#wp-diag')?.addEventListener('click', async () => {
    dd().diagnostic = { done: Date.now(), gates: evidenceGates(App.state, today).gates.map(g => ({ key: g.key, pct: g.pct })) };
    await saveWarplan();
    rerender();
  });
}
