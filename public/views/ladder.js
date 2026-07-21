// Block 4 — the speed drill (§3.7). Odd days: timed blank re-solves picked by
// the audited laws.js picker (≥3 days old, weighted toward flagged/hinted),
// 20:00 strict each, shortfall pulled from the CF ladder. Even days: the
// CP-31 ladder, strict per-problem timer. Bands, minutes and source all come
// from curriculum.json → contests.codeforces.ladder.
import {
  App, Laws, esc, todayStr, logDayN, sprintWeek, mmss, appendLog,
  saveLadder, rerender
} from '../app.js';
import { chime, success } from '../audio.js';

let timers = [];
export function cleanupDrill() {
  for (const id of timers) clearInterval(id);
  timers = [];
}

const round1 = x => Math.round(x * 10) / 10;

// a started drill clock survives navigation/refresh within the evening —
// losing the countdown to a misclick would corrupt the speed data
const dkey = id => `p435drill:${todayStr()}:${id}`;

// R1: every running clock can pause — click the clock itself. While paused
// the stored anchor shifts forward, so the strict countdown only ever counts
// solve time (the anchor in sessionStorage stays the source of truth).
export function runCountdown(el, minutes, startTs = Date.now(), key = null) {
  let chimed = false;
  if (key) { el.classList.add('pausable'); el.title = 'click to pause / resume (R1)'; }
  const pkey = key ? key + ':paused' : null;
  const id = setInterval(() => {
    if (!el.isConnected) return;
    if (pkey && +sessionStorage.getItem(pkey)) {
      el.textContent = '⏸ ' + mmss(Math.max(0, minutes - (+sessionStorage.getItem(pkey) - startTs) / 60000 * App.speed) * 60);
      return;
    }
    const remain = minutes - (Date.now() - startTs) / 60000 * App.speed;
    el.textContent = remain > 0 ? mmss(remain * 60) : 'TIME';
    el.classList.toggle('late', remain <= 2);
    if (remain <= 0 && !chimed) { chimed = true; chime(); }
  }, 200);
  timers.push(id);
  if (pkey) el.addEventListener('click', () => {
    const pausedAt = +sessionStorage.getItem(pkey);
    if (pausedAt) {
      startTs += Date.now() - pausedAt;
      sessionStorage.setItem(key, String(startTs));
      sessionStorage.removeItem(pkey);
    } else {
      sessionStorage.setItem(pkey, String(Date.now()));
    }
  });
  return startTs;
}

// drill finish math reads the (possibly pause-shifted) anchor — solve time only
function drillMinutes(key, fallbackTs) {
  const pkey = key + ':paused';
  let st = +sessionStorage.getItem(key) || fallbackTs;
  const pausedAt = +sessionStorage.getItem(pkey);
  if (pausedAt) { st += Date.now() - pausedAt; sessionStorage.removeItem(pkey); }
  return st ? round1((Date.now() - st) / 60000 * App.speed) : null;
}

export function renderLadder(root) {
  cleanupDrill();
  const pick = Laws.speedDrillPick(App.cur, App.state.log, todayStr());
  if (pick?.mode === 'resolve') renderResolveDay(root, pick);
  else renderLadderDay(root, pick);
}

// ── shared: the CP-31 checklist + add box ────────────────────────────────────
function checklistHtml() {
  const lad = App.cur.contests.codeforces.ladder;
  const week = sprintWeek();
  return [1, 2, 3].map(w => {
    const items = App.state.ladder.filter(it => it.week === w);
    const done = items.filter(it => it.done).length;
    return `
      <div class="ladder-week">
        <h3>WEEK ${w} — band ${esc(lad['week' + w])}
          ${w === week ? '<span class="amber">← current</span>' : ''}
          <span class="faint">· ${done}/${items.length} done</span></h3>
        <ul class="probs">
          ${items.map(it => `
            <li style="cursor:default">
              <input type="checkbox" data-id="${esc(it.id)}" ${it.done ? 'checked' : ''}>
              <span class="nm ${it.done ? 'muted' : ''}">${esc(it.name)}</span>
              <button class="del" data-del="${esc(it.id)}">✕</button>
            </li>`).join('') || '<li style="cursor:default"><span class="faint">nothing added yet</span></li>'}
        </ul>
      </div>`;
  }).join('');
}

function wireChecklist(root) {
  const list = root.querySelector('#lad-list');
  if (!list) return;
  list.addEventListener('change', async e => {
    const cb = e.target.closest('input[data-id]');
    if (!cb) return;
    const item = App.state.ladder.find(it => it.id === cb.dataset.id);
    if (item) { item.done = cb.checked; await saveLadder(); rerender(); }
  });
  list.addEventListener('click', async e => {
    const del = e.target.closest('button[data-del]');
    if (!del) return;
    App.state.ladder = App.state.ladder.filter(it => it.id !== del.dataset.del);
    await saveLadder();
    rerender();
  });
}

// ── odd days: timed blank re-solves ──────────────────────────────────────────
function renderResolveDay(root, pick) {
  const lad = App.cur.contests.codeforces.ladder;
  const week = sprintWeek();
  const band = lad['week' + week];
  const url = (lad.source || '').match(/https?:\/\/\S+/)?.[0];
  const today = todayStr();
  const doneToday = new Map();
  for (const r of App.state.log)
    if (r.date === today && r.outcome === 'resolve') doneToday.set(r.problem, r);
  const fillDoneToday = App.state.ladder.filter(it =>
    it.done && new Date(it.ts).toDateString() === new Date().toDateString()).length;
  const fillLeft = Math.max(0, pick.ladderFill - fillDoneToday);
  const starts = {};

  const pickCards = pick.picks.map((p, i) => {
    const done = doneToday.get(p.problem);
    return `
    <div class="drillcard panel">
      <div class="dc-head">
        <span class="${p.flag ? 'danger' : p.outcome !== 'solo' ? 'amber' : 'ok'}">${p.flag ? '⚑ flagged' : esc(p.outcome)}</span>
        <span class="faint">${pick.minutes}:00 strict · blank file</span>
      </div>
      <div class="dc-name">${esc(p.problem)}</div>
      <div class="dc-delta muted">first time: <b class="amber">${p.firstMinutes ?? '—'}m</b> — beat it.</div>
      ${done
        ? `<div class="dc-doneline ${done.beat ? 'ok' : 'amber'}">${done.beat ? '✓ re-solved' : 'closed'} in ${done.minutes}m</div>`
        : `<div class="dc-clock" id="dc-clock-${i}">${pick.minutes}:00</div>
           <div class="actions" style="justify-content:flex-start">
             <button class="primary" data-start="${i}">START ▸</button>
             <span id="dc-finish-${i}" hidden>
               <button class="good" data-beat="${i}">SOLVED ✓</button>
               <button class="warn" data-fail="${i}">didn't finish</button>
             </span>
           </div>`}
    </div>`;
  }).join('');

  const fillCards = Array.from({ length: fillLeft }, (_, k) => `
    <div class="drillcard panel">
      <div class="dc-head"><span class="cyan-ish" style="color:var(--cyan)">ladder fill</span>
        <span class="faint">${lad.per_problem_minutes}:00 strict</span></div>
      <div class="dc-delta muted">log too young for re-solves — pull the next unchecked
        <b>band ${esc(band)}</b> problem ${url ? `from the <a href="${esc(url)}" target="_blank" rel="noopener">CP-31 sheet</a>` : ''}.</div>
      <input id="fill-name-${k}" type="text" placeholder="e.g. 1100 — B. Two Tables (1800B)" autocomplete="off" style="margin-top:8px">
      <div class="dc-clock" id="fill-clock-${k}">${lad.per_problem_minutes}:00</div>
      <div class="actions" style="justify-content:flex-start">
        <button class="primary" data-fillstart="${k}">START ▸</button>
        <span id="fill-finish-${k}" hidden><button class="good" data-filldone="${k}">DONE ✓ — check it off</button></span>
      </div>
    </div>`).join('');

  root.innerHTML = `
    <div class="cols">
      <div>
        <div class="panel">
          <h2>Block 4 — speed drill · day ${logDayN()} (odd: timed blank re-solves)</h2>
          <p class="muted">${pick.want} problems · ${pick.minutes} min strict each. The picker weights
            flagged/hinted solves ≥3 days old. No editor archaeology — blank file, from memory.</p>
        </div>
        ${pickCards}${fillCards}
      </div>
      <div>
        <div class="panel" id="lad-list">
          <h2>CP-31 checklist ${url ? `<span class="right"><a href="${esc(url)}" target="_blank" rel="noopener">open sheet ↗</a></span>` : ''}</h2>
          ${checklistHtml()}
        </div>
      </div>
    </div>`;

  const arm = (i, clockSel, finishSel, startBtn, minutes, savedTs, key) => {
    starts[i] = savedTs ?? Date.now();
    runCountdown(root.querySelector(clockSel), minutes, starts[i], key);
    if (startBtn) startBtn.hidden = true;
    root.querySelector(finishSel).hidden = false;
  };
  // resume clocks that were running before a navigation/refresh
  pick.picks.forEach((p, i) => {
    if (doneToday.has(p.problem)) return;
    const saved = +sessionStorage.getItem(dkey(p.problem));
    if (saved) arm(i, `#dc-clock-${i}`, `#dc-finish-${i}`, root.querySelector(`button[data-start="${i}"]`), pick.minutes, saved, dkey(p.problem));
  });
  for (let k = 0; k < fillLeft; k++) {
    const saved = +sessionStorage.getItem(dkey('fill' + k));
    if (saved) arm('f' + k, `#fill-clock-${k}`, `#fill-finish-${k}`, root.querySelector(`button[data-fillstart="${k}"]`), lad.per_problem_minutes, saved, dkey('fill' + k));
  }

  root.addEventListener('click', async e => {
    const start = e.target.closest('button[data-start]');
    if (start) {
      const i = +start.dataset.start;
      arm(i, `#dc-clock-${i}`, `#dc-finish-${i}`, start, pick.minutes, undefined, dkey(pick.picks[i].problem));
      sessionStorage.setItem(dkey(pick.picks[i].problem), String(starts[i]));
      return;
    }
    const fin = e.target.closest('button[data-beat],button[data-fail]');
    if (fin) {
      const beat = 'beat' in fin.dataset;
      const i = +(fin.dataset.beat ?? fin.dataset.fail);
      const p = pick.picks[i];
      const minutes = drillMinutes(dkey(p.problem), starts[i]); // R1: solve time
      sessionStorage.removeItem(dkey(p.problem));
      await appendLog({
        date: today, day: logDayN(), problem: p.problem, tier: 'A',
        outcome: 'resolve', minutes, beat, flag: false, classification: null
      });
      if (beat) success();
      rerender();
      return;
    }
    const fstart = e.target.closest('button[data-fillstart]');
    if (fstart) {
      const k = +fstart.dataset.fillstart;
      arm('f' + k, `#fill-clock-${k}`, `#fill-finish-${k}`, fstart, lad.per_problem_minutes, undefined, dkey('fill' + k));
      sessionStorage.setItem(dkey('fill' + k), String(starts['f' + k]));
      return;
    }
    const fdone = e.target.closest('button[data-filldone]');
    if (fdone) {
      const k = +fdone.dataset.filldone;
      const name = root.querySelector(`#fill-name-${k}`).value.trim() || `band ${band} ladder problem`;
      sessionStorage.removeItem(dkey('fill' + k));
      App.state.ladder.push({ id: crypto.randomUUID(), name, week, done: true, ts: Date.now() });
      await saveLadder();
      success();
      rerender();
    }
  });
  wireChecklist(root);
}

// ── even days (and pre-sprint): the CF ladder ────────────────────────────────
function renderLadderDay(root, pick) {
  const lad = App.cur.contests.codeforces.ladder;
  const week = sprintWeek();
  const band = lad['week' + week];
  const url = (lad.source || '').match(/https?:\/\/\S+/)?.[0];
  const b4 = App.cur.schedule_template.blocks.find(b => b.id === 'B4');

  root.innerHTML = `
    <div class="cols">
      <div>
        <div class="panel">
          <h2>Block 4 — speed drill · CF ladder (even days)</h2>
          <p class="bandbox">This week's band: <b>${esc(band)}</b> rated ·
            <b>${lad.per_problem_minutes} min</b> strict per problem ·
            ${lad.problems_per_session} problems per session</p>
          ${url ? `<p style="margin-top:10px">📋 <a href="${esc(url)}" target="_blank" rel="noopener">${esc(lad.source)}</a></p>` : ''}
          <p class="muted" style="margin-top:10px">${esc(b4?.content || '')} — odd days the app picks re-solves;
            even days: pull ${lad.problems_per_session} problems of band ${esc(band)} from the sheet, add them below, beat the clock, check them off.</p>
        </div>
        <div class="panel">
          <h2>Strict clock — one problem at a time</h2>
          <div class="dc-clock" id="lad-clock">${lad.per_problem_minutes}:00</div>
          <div class="actions" style="justify-content:flex-start">
            <button class="primary" id="lad-go">START ${lad.per_problem_minutes}:00 ▸</button>
          </div>
        </div>
        <div class="panel">
          <h2>Add a sheet problem</h2>
          <div class="ladder-add">
            <input id="lad-name" type="text" placeholder="e.g. ${esc(band)} — B. Two Tables (1800B)" autocomplete="off">
            <select id="lad-week" style="width:110px">
              ${[1, 2, 3].map(w => `<option value="${w}" ${w === week ? 'selected' : ''}>week ${w}</option>`).join('')}
            </select>
            <button class="primary" id="lad-add">ADD</button>
          </div>
        </div>
      </div>
      <div>
        <div class="panel" id="lad-list">
          <h2>Checklist</h2>
          ${checklistHtml()}
        </div>
      </div>
    </div>`;

  const savedLad = +sessionStorage.getItem(dkey('lad'));
  if (savedLad) {
    runCountdown(root.querySelector('#lad-clock'), lad.per_problem_minutes, savedLad, dkey('lad'));
    root.querySelector('#lad-go').textContent = `RESTART ${lad.per_problem_minutes}:00 ▸`;
  }
  root.querySelector('#lad-go').addEventListener('click', e => {
    cleanupDrill(); // restart fresh for the next problem
    sessionStorage.setItem(dkey('lad'), String(Date.now()));
    sessionStorage.removeItem(dkey('lad') + ':paused');
    runCountdown(root.querySelector('#lad-clock'), lad.per_problem_minutes, Date.now(), dkey('lad'));
    e.target.textContent = `RESTART ${lad.per_problem_minutes}:00 ▸`;
  });

  const add = async () => {
    const name = root.querySelector('#lad-name').value.trim();
    if (!name) return;
    App.state.ladder.push({
      id: crypto.randomUUID(), name,
      week: +root.querySelector('#lad-week').value,
      done: false, ts: Date.now()
    });
    await saveLadder();
    rerender();
  };
  root.querySelector('#lad-add').addEventListener('click', add);
  root.querySelector('#lad-name').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  wireChecklist(root);
}
