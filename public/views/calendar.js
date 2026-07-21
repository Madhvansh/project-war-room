// Calendar — the 20-day grid and the per-date Day View: §3.9 made visible.
// Start Day lives ONLY on Mission Control (today). Past days open for
// catch-up, future days for work-ahead — both launch forDay-tagged solves;
// the credit rule routes them (work-ahead credits the target day, catch-up
// credits today; sealed days never move).
import {
  App, Laws, esc, todayStr, sheetMark, problemStatus, completedA, recognizedB,
  effQuota, isWonOn, clock, setFocusDay
} from '../app.js';

const PHASE_CLR = {
  'Foundations': 'var(--cyan)', 'DP completion': 'var(--amber)', 'Trees': 'var(--green)',
  'Graphs': 'var(--red)', 'Compression': '#b07cff', 'Integration': 'var(--fg)'
};
const ST_MARK = { solo: '✓', hint: 'H', editorial: 'E', abandoned: '✗', recognized: '✓', resolve: '↻' };

export function renderCalendar(root) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const d = q.get('d');
  if (d && App.cur.days.some(x => x.date === d)) return renderDayView(root, d);
  renderGrid(root);
}

function verdict(date) {
  const today = todayStr();
  const rec = App.state.days[date];
  if (rec?.sealed) return rec.sealed.won
    ? { txt: 'W', cls: 'won' } : { txt: 'L', cls: 'lost' };
  if (date > today) return { txt: '—', cls: 'pending' };
  if (date === today) {
    if (rec?.badDay) return isWonOn(date) ? { txt: 'W', cls: 'won' } : { txt: 'L · closed', cls: 'lost' };
    return isWonOn(date) ? { txt: 'W · live', cls: 'won' } : { txt: 'IN PLAY', cls: 'live' };
  }
  // past but not yet sealed (server seals on next boot/state read) — live math
  return isWonOn(date) ? { txt: 'W', cls: 'won' } : { txt: 'L', cls: 'lost' };
}

function dayProgress(entry) {
  const a = completedA(entry.date).size + Laws.contestCredit(App.cur, App.state, entry.date);
  const b = recognizedB(entry.date).size;
  const q = effQuota(entry.date) || { a: 0, b: 0 };
  return { a, b, qa: q.a, qb: q.b };
}

function renderGrid(root) {
  const today = todayStr();
  const cells = App.cur.days.map(entry => {
    const v = verdict(entry.date);
    const p = dayProgress(entry);
    const hasWork = p.a || p.b;
    return `
      <div class="calcell ${entry.date === today ? 'today' : ''}" data-d="${entry.date}"
           style="border-left:3px solid ${PHASE_CLR[entry.phase] || 'var(--line)'}">
        <div class="caltop"><span class="caln">D${entry.day}</span>
          <span class="calverdict ${v.cls}">${v.txt}</span></div>
        <div class="caldate">${esc(entry.date.slice(5))} ${esc(entry.weekday)}</div>
        <div class="calfocus">${esc(entry.focus)}</div>
        ${entry.tierA?.length || entry.tierB?.length
          ? `<div class="calprog ${hasWork ? '' : 'faint'}">A ${p.a}/${p.qa} · B ${p.b}/${p.qb}</div>`
          : `<div class="calprog faint">integration</div>`}
        ${entry.contest ? `<div class="calcontest">⚔ ${esc(entry.contest.name)}</div>` : ''}
      </div>`;
  }).join('');
  root.innerHTML = `
    <div class="calendar">
      <div class="phaselbl">THE 20 DAYS — every credit lands on exactly one of them (§3.9)</div>
      <div class="calgrid">${cells}</div>
      <p class="muted" style="margin-top:10px">click a day — past days take catch-up (credits today),
        future days take work-ahead (credits that day). Start Day lives on Mission Control only.</p>
    </div>`;
  for (const cell of root.querySelectorAll('.calcell')) {
    cell.addEventListener('click', () => { location.hash = `#/calendar?d=${cell.dataset.d}`; });
  }
}

function renderDayView(root, date) {
  const entry = App.cur.days.find(d => d.date === date);
  const today = todayStr();
  const rec = App.state.days[date] || {};
  const v = verdict(date);
  const p = dayProgress(entry);
  const status = problemStatus();
  const mode = date === today ? 'today' : (date > today ? 'work-ahead' : 'catch-up');

  // the row that credited this date for a problem (to annotate work-ahead)
  const creditRows = App.state.log.filter(r => Laws.creditDate(r) === date);
  const rowFor = new Map();
  for (const r of creditRows) if (!rowFor.has(r.problem)) rowFor.set(r.problem, r);

  const li = (probs, tier) => probs.map((prob, i) => {
    const st = status.get(prob);
    const mark = st ? ST_MARK[st.outcome] || '' : '';
    const cls = st && st.outcome !== 'abandoned' ? st.outcome : '';
    const cr = rowFor.get(prob);
    const ahead = cr && cr.forDay === date && cr.date < date
      ? `<span class="cyan" title="work-ahead under §3.9">done ${esc(cr.date.slice(5))} · credited Day ${entry.day}</span>` : '';
    return `<li data-t="${tier}" data-i="${i}" class="${st ? 'done' : ''}">
      <span class="st ${cls}">${mark || '·'}</span>
      <span class="nm">${esc(prob)}</span>${sheetMark(prob)}
      ${ahead}
      ${st?.flag ? '<span class="flagmark" title="flagged for Day 19–20">⚑</span>' : ''}
    </li>`;
  }).join('');

  // catch-up done later for THIS day's list (forDay points here, credit went to its real today)
  const caughtUp = App.state.log.filter(r => r.forDay === date && Laws.creditDate(r) !== date);

  const logRows = creditRows.sort((a, b) => (a.ts || 0) - (b.ts || 0)).map(r => `
    <tr><td>${clock(r.ts)}</td><td>${esc(r.tier)}</td><td>${esc(r.problem)}</td>
      <td class="outcome-${esc(r.outcome)}">${esc(r.outcome)}</td>
      <td>${r.minutes ?? ''}</td>
      <td>${r.date !== date ? `<span class="cyan">done ${esc(r.date.slice(5))} · work-ahead</span>` : ''}
          ${r.upsolve ? '⚡' : ''}${r.flag ? ' ⚑' : ''}</td></tr>`).join('');

  root.innerHTML = `
    <div class="calendar dayview">
      <p><a href="#/calendar" class="muted">← calendar</a></p>
      <div class="panel" style="border-left:3px solid ${PHASE_CLR[entry.phase] || 'var(--line)'}">
        <div class="caltop">
          <span class="phaselbl">DAY ${entry.day} — ${esc(entry.focus)}</span>
          <span class="calverdict ${v.cls}">${v.txt}</span>
        </div>
        <div class="muted">${esc(entry.weekday)} ${esc(date)} · ${esc(entry.phase)}
          ${entry.contest ? ` · ⚔ ${esc(entry.contest.name)} ${esc(entry.contest.time_ist || '')} IST` : ''}
          ${rec.anchor ? ` · anchored ${clock(rec.anchor)}` : ''}
          ${rec.badDay ? ' · <span class="amber">bad-day close</span>' : ''}</div>
        ${rec.sealed ? `<div class="muted">sealed: A ${rec.sealed.a}/${rec.sealed.quotaA} ·
          B ${rec.sealed.b}/${rec.sealed.quotaB} · ${new Date(rec.sealed.ts).toISOString().slice(0, 10)}</div>`
        : `<div class="muted">live: A ${p.a}/${p.qa} · B ${p.b}/${p.qb}</div>`}
        ${entry.note ? `<div class="muted" style="margin-top:6px">${esc(entry.note)}</div>` : ''}
        ${mode === 'today'
          ? `<div style="margin-top:8px"><a href="#/">this is today — run it from Mission Control →</a></div>`
          : `<div style="margin-top:10px"><button id="runthisday" class="primary">▶ RUN DAY ${entry.day} AS MISSION</button>
             <span class="faint" style="margin-left:8px">${mode} — ${mode === 'catch-up' ? 'solves credit today; this day stays sealed' : 'solves credit Day ' + entry.day}</span></div>`}
      </div>
      <div class="cols" style="margin-top:14px">
        ${entry.tierA?.length ? `<div class="panel">
          <div class="phaselbl">TIER A ${mode !== 'today' ? `· click = ${mode} solve` : ''}</div>
          <ul class="probs" id="cal-a">${li(entry.tierA, 'A')}</ul></div>` : ''}
        ${entry.tierB?.length ? `<div class="panel">
          <div class="phaselbl">TIER B ${mode !== 'today' ? `· click = ${mode} rep` : ''}</div>
          <ul class="probs" id="cal-b">${li(entry.tierB, 'B')}</ul></div>` : ''}
        ${(entry.tasks || []).length ? `<div class="panel">
          <div class="phaselbl">TASKS</div>
          <ul class="probs">${entry.tasks.map(t => `<li><span class="st">▸</span>${esc(t)}</li>`).join('')}</ul></div>` : ''}
      </div>
      ${caughtUp.length ? `<div class="panel" style="margin-top:14px">
        <div class="phaselbl">CAUGHT UP LATER (credited to their real day — this day stayed sealed)</div>
        <ul class="probs">${caughtUp.map(r => `<li><span class="st ${r.outcome}">${ST_MARK[r.outcome] || ''}</span>
          <span class="nm">${esc(r.problem)}</span><span class="muted">done ${esc(r.date)}</span></li>`).join('')}</ul>
      </div>` : ''}
      <div class="panel" style="margin-top:14px">
        <div class="phaselbl">CREDITED LOG ROWS — ${creditRows.length}</div>
        ${creditRows.length ? `<table class="logtbl"><thead><tr>
          <th>time</th><th>tier</th><th>problem</th><th>outcome</th><th>min</th><th></th>
        </tr></thead><tbody>${logRows}</tbody></table>` : '<p class="muted">nothing credited yet.</p>'}
      </div>
    </div>`;

  const launch = (tier, idx) => {
    const prob = (tier === 'A' ? entry.tierA : entry.tierB)[idx];
    // returnTo pins this day: every exit from the solve/rep comes back HERE,
    // not to today, until he leaves for Mission himself [user, 2026-06-13]
    App.pending = { problem: prob, tier, returnTo: `#/calendar?d=${date}`, ...(date !== today ? { forDay: date } : {}) };
    location.hash = tier === 'A' ? '#/solve' : '#/recognize';
  };
  for (const node of root.querySelectorAll('#cal-a li, #cal-b li')) {
    node.addEventListener('click', () => launch(node.dataset.t, +node.dataset.i));
  }
  // run the whole day as the active mission (Focus Day) — sticky, unlike the
  // per-problem launches above which return to this calendar view
  root.querySelector('#runthisday')?.addEventListener('click', () => { setFocusDay(date); location.hash = '#/'; });
}
