// Mission Control — day at a glance: lists, quotas, anchor timeline, overflow.
import {
  App, Laws, esc, todayStr, displayDayN, preSprint, dayEntry, effQuota, problemStatus,
  completedA, recognizedB, overflowQueue, projectedFinish, clock, minToHM,
  saveDays, rerender, sprintWeek, sheetMark, isWonOn, record, sheetCount,
  activeDate, isFocused, creditFocusDate, activeDayN, focusDirection, setFocusDay, clearFocusDay, sprintDayN,
  campaignOn, campaignPointer, campaignEntry, startCampaign, stopCampaign,
  setCampaignPointer, campaignNext, recordCampaignWin, campaignBurst
} from '../app.js';
import { paceSeries, soloOptimalRate, architectExport, recognitionStats, nextContest, catchUpLedger, campaignDayStatus, upcomingContests } from '../stats.js';
import { compressS2 } from '../campaign-schedule.js';

// a calm "in 2d 3h" countdown for the next-contest card (Open-Wave slate)
function fmtCountdown(ms) {
  if (ms <= 0) return 'starting now';
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d >= 1) return `in ${d}d ${h % 24}h`;
  if (h >= 1) return `in ${h}h ${m % 60}m`;
  return `in ${m}m`;
}

// the 435 line vs actual, with the required-from-today slope — a glanceable
// SVG, not a guilt curve: the gap is shown as tomorrow's number
function paceSvg(p) {
  const W = 320, H = 150, padL = 34, padB = 18, padT = 10, padR = 10, yMin = 50;
  const x = day => padL + (W - padL - padR) * day / 20;
  const y = v => padT + (H - padT - padB) * (1 - (v - yMin) / (435 - yMin));
  const target = p.days.map(d => `${x(d.day)},${y(d.target)}`).join(' ');
  const actual = p.days.filter(d => d.actual != null).map(d => `${x(d.day)},${y(d.actual)}`).join(' ');
  const need = `${x(Math.max(p.todayN, 0))},${y(p.sheet)} ${x(18)},${y(435)}`;
  return `<svg viewBox="0 0 ${W} ${H}" class="pacesvg" role="img" aria-label="pace: 435 line vs actual">
    <text x="2" y="${y(435) + 4}" class="axis">435</text>
    <text x="2" y="${y(p.baseline) + 4}" class="axis">${p.baseline}</text>
    <text x="${x(18) - 8}" y="${H - 4}" class="axis">D18</text>
    <line x1="${x(18)}" y1="${padT}" x2="${x(18)}" y2="${H - padB}" class="d18line"/>
    <polyline points="${target}" class="targetline"/>
    ${p.required.remaining > 0 && p.todayN <= 18 ? `<polyline points="${need}" class="needline"/>` : ''}
    ${actual ? `<polyline points="${actual}" class="actualline"/>` : ''}
    ${p.days.filter(d => d.actual != null).map(d =>
      `<circle cx="${x(d.day)}" cy="${y(d.actual)}" r="2.5" class="actualdot"/>`).join('')}
  </svg>`;
}

const ST_MARK = { solo: '✓', hint: 'H', editorial: 'E', abandoned: '✗', recognized: '✓' };

// human label for a sleep-guard compression step token
function stepLabel(st) {
  let m;
  if ((m = st.match(/^trim_tierB_by_(\d+)$/))) return `Tier B −${m[1]}`;
  if ((m = st.match(/^breaks_to_minimum_(\d+)_(\d+)_(\d+)$/))) return `breaks→${m[1]}/${m[2]}/${m[3]}`;
  if ((m = st.match(/^block4_to_(\d+)min$/))) return `B4→${m[1]}m`;
  return st;
}

// §3.6 contest logging — solves count + the first unsolved problem, which
// becomes tomorrow's single Block 0 upsolve ("solved everything" → none)
function contestModal(title, onSave, prefill = null) {
  const mr = document.getElementById('modal-root');
  mr.innerHTML = `<div class="modal-back"><div class="modal" style="text-align:left">
    <h3>${esc(title)} — log it</h3>
    ${prefill ? '<p class="faint" style="margin-top:-6px">prefilled from the CF sync — correct it if the API lied.</p>' : ''}
    <label class="muted" style="display:block;font-size:12px;margin-bottom:3px">PROBLEMS SOLVED</label>
    <input id="cm-solved" type="text" inputmode="numeric" autocomplete="off" style="margin-bottom:12px" value="${prefill?.solved ?? ''}">
    <label class="muted" style="display:block;font-size:12px;margin-bottom:3px">FIRST UNSOLVED PROBLEM — tomorrow's upsolve</label>
    <input id="cm-first" type="text" autocomplete="off" placeholder="e.g. Q3. Count Beautiful Splits" value="${esc(prefill?.firstUnsolved ?? '')}">
    <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="cm-all" style="width:auto"> solved everything — nothing to upsolve
    </label>
    <div class="actions" style="margin-top:16px;flex-direction:row">
      <button class="primary" id="cm-save">SAVE ▸</button>
      <button id="cm-cancel">cancel</button>
    </div></div></div>`;
  const $ = sel => mr.querySelector(sel);
  $('#cm-solved').focus();
  $('#cm-all').addEventListener('change', e => { $('#cm-first').disabled = e.target.checked; });
  $('#cm-cancel').addEventListener('click', () => { mr.innerHTML = ''; });
  $('#cm-save').addEventListener('click', async () => {
    const solved = parseInt($('#cm-solved').value, 10);
    const all = $('#cm-all').checked;
    const first = $('#cm-first').value.trim();
    if (Number.isNaN(solved) || solved < 0) { $('#cm-solved').style.borderColor = 'var(--red)'; $('#cm-solved').focus(); return; }
    if (!all && !first) { $('#cm-first').style.borderColor = 'var(--red)'; $('#cm-first').focus(); return; }
    mr.innerHTML = '';
    await onSave({ solved, firstUnsolved: all ? null : first });
  });
}

// ── SPRINT WINDOW CLOSED ─────────────────────────────────────────────────────
// The real today is past the last curriculum day and nothing else is driving
// the page (no campaign lane, no focus day). displayDayN() clamps to the final
// day, whose lists are empty — a 0/0 quota that would vacuously read as DAY
// WON. Say the window ended instead, and offer the two honest ways forward.
function renderWindowClosed(root) {
  const total = App.cur.days.length;
  const last = App.cur.days[total - 1];
  const over = sprintDayN() - total;
  const rec = record();
  root.innerHTML = `
    <div class="banner">SPRINT WINDOW CLOSED — the ${total}-day window ended on
      <b>Day ${last.day} · ${esc(last.date)}</b>, ${over} day${over === 1 ? '' : 's'} ago.
      There is no live day left on the calendar, so there is no quota to hit and no day to win.</div>
    <div class="panel">
      <h2>The ${total}-day sprint is over <span class="right muted">sheet: <b>${sheetCount()}</b>/435</span></h2>
      <div class="meters"><span class="muted">final record <b class="ok">${rec.wins}W</b> · <b class="danger">${rec.losses}L</b>
        — nothing is lost: every solve, card and rep stays banked and still counts.</span></div>
      <p class="muted" style="margin-top:12px">Pick the lane you want to run now:</p>
      <p style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <button id="startcampaign" class="primary">▶ START THE SECOND ATTEMPT <span class="faint">— re-run the curriculum at your own pace</span></button>
        <button id="runday" class="ghost">▸ RUN A SPECIFIC DAY <span class="faint">— pick any of the ${total} days</span></button>
      </p>
      <p class="faint" style="margin-top:12px"><a href="#/report">end-of-sprint report ▸</a> ·
        <a href="#/cards">review deck ▸</a> · <a href="#/calendar">calendar ▸</a></p>
    </div>`;
  root.querySelector('#startcampaign').addEventListener('click', () => startCampaign(App.state.log.length ? 2 : 1));
  root.querySelector('#runday').addEventListener('click', () => dayPickerModal());
}

let keyHandler = null, cueTimer = null;
export function cleanupMission() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  if (cueTimer) clearInterval(cueTimer);
  cueTimer = null;
}

// ── morning briefing (Wave 4 feature 3): one screen on Start Day ─────────────
// focus + why, quota, overflow, pinned upsolve, tonight's contest, yesterday's
// evidence line, the pace verdict — and last night's debrief watch-item
// threaded in (approved idea 3). Enter dismisses into the day.
function briefingModal() {
  const today = todayStr();
  const entry = dayEntry();
  if (!entry || preSprint()) return;
  const q = effQuota(today);
  const overflow = overflowQueue();
  const upsolve = Laws.upsolveTask(App.cur, App.state, today);
  const p = paceSeries(App.cur, App.state.log, today);
  const target = p.days.find(d => d.day === Math.min(p.todayN, 20))?.target ?? 435;
  const gap = p.sheet - target;
  const yEntry = App.cur.days.find(d => d.day === entry.day - 1);
  const yRec = yEntry ? App.state.reviews[yEntry.date] : null;
  const ySealed = yEntry ? App.state.days[yEntry.date]?.sealed : null;
  const watch = yRec?.debrief?.watch || null;
  const dayRec = App.state.days[today] || {};
  const tonight = entry.contest ? `${entry.contest.name} · ${entry.contest.time_ist} IST${entry.contest.credits_tierA ? ` (credits ${entry.contest.credits_tierA} Tier A)` : ''}`
    : dayRec.biweekly ? 'LC Biweekly · 20:00 IST'
    : dayRec.cfRound ? 'CF round · 20:05 IST (replaces Blocks 4–5)' : null;
  const line = (k, v, cls = '') => v ? `<tr><td class="bk">${k}</td><td class="${cls}">${v}</td></tr>` : '';
  const mr = document.getElementById('modal-root');
  mr.innerHTML = `<div class="modal-back"><div class="modal briefing" style="text-align:left;max-width:640px">
    <h3>DAY ${entry.day} — ${esc(entry.focus)}</h3>
    <table class="brief">
      ${watch ? line('⚠ watch-item', `<span class="amber">${esc(watch)}</span> <span class="faint">— from last night's debrief</span>`) : ''}
      ${line('why today', esc(entry.note || entry.phase))}
      ${line('quota', `<b>${q.a}</b> Tier A · <b>${q.b}</b> Tier B${q.badDayTrim ? ` <span class="amber">(bad-day −${q.badDayTrim})</span>` : ''}`)}
      ${line('overflow', overflow.length ? `<span class="danger">${overflow.length} waiting in Block 0</span>` : '<span class="ok">clear</span>')}
      ${line('upsolve', upsolve ? `⚡ ${esc(upsolve.problem)} <span class="faint">(${esc(upsolve.source)})</span>` : null)}
      ${line('tonight', tonight ? `⚔ ${esc(tonight)}` : null)}
      ${line('yesterday', yEntry ? `${ySealed ? (ySealed.won ? '<b class="ok">W</b>' : '<b class="danger">L</b>') : '—'}${yRec?.dayLog ? ` · “${esc(yRec.dayLog)}”` : ''}` : null)}
      ${line('pace', gap >= 0 ? `<span class="ok">on the line (+${gap})</span> · need ${p.required.perDay}/day to D18`
        : `<span class="amber">${-gap} behind the line</span> · need ${p.required.perDay}/day to D18`)}
    </table>
    <div class="actions" style="margin-top:14px">
      <button class="primary" id="briefgo">INTO THE DAY ▸<kbd>Enter</kbd></button>
    </div>
  </div></div>`;
  const close = () => { mr.innerHTML = ''; window.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Enter' || e.key === 'Escape') close(); };
  mr.querySelector('#briefgo').addEventListener('click', close);
  window.addEventListener('keydown', onKey);
}

// ── FOCUS DAY picker (idea 1: debt-ranked) ───────────────────────────────────
// The 20 days, colour-coded by sealed verdict and unsolved Tier-A debt, so the
// biggest hole to catch up on is the brightest. Picking one sets the focus and
// drops into Mission Control running that day's list.
function dayPickerModal() {
  const mr = document.getElementById('modal-root');
  const today = todayStr();
  const status = problemStatus();
  const debtOf = d => (d.tierA || []).filter(p => !Laws.COMPLETIONS.has(status.get(p)?.outcome)).length;
  const maxDebt = Math.max(1, ...App.cur.days.map(debtOf));
  const cell = d => {
    const sealed = App.state.days[d.date]?.sealed;
    const isToday = d.date === today;
    const rel = isToday ? 'today' : d.date < today ? 'catch-up' : 'work-ahead';
    const debt = debtOf(d);
    const v = sealed ? (sealed.won ? { t: 'W', c: 'won' } : { t: 'L', c: 'lost' })
      : isToday ? { t: 'TODAY', c: 'live' }
      : d.date > today ? { t: '—', c: 'pending' }
      : (isWonOn(d.date) ? { t: 'W', c: 'won' } : { t: 'L', c: 'lost' });
    return `<button class="pickcell ${rel} ${isToday ? 'is-today' : ''}" data-d="${d.date}" ${isToday ? 'disabled' : ''}
        title="${esc(d.focus)} — ${rel}${debt ? `, ${debt} Tier A unsolved` : ', list clear'}">
      <span class="pc-top"><span class="pc-n">D${d.day}</span><span class="pc-v ${v.c}">${v.t}</span></span>
      <span class="pc-focus">${esc(d.focus)}</span>
      <span class="pc-date">${esc(d.date.slice(5))} ${esc(d.weekday)}</span>
      <span class="pc-debt" style="opacity:${debt ? (0.4 + 0.6 * debt / maxDebt).toFixed(2) : 0.25}">${debt ? `${debt} A left` : '✓ clear'}</span>
    </button>`;
  };
  mr.innerHTML = `<div class="modal-back"><div class="modal picker" style="max-width:760px;text-align:left">
    <h3>RUN ANOTHER DAY</h3>
    <p class="muted" style="margin-bottom:12px">Pick a day to make it the active mission. Past days are <b>catch-up</b> — solves credit today, move the sheet, and clear overflow; the day stays sealed. Future days are <b>work-ahead</b> — solves credit that day. Brighter <span class="amber">“N A left”</span> = more unsolved.</p>
    <div class="pickgrid">${App.cur.days.map(cell).join('')}</div>
    <div class="actions" style="margin-top:14px;flex-direction:row">
      <button id="pick-cancel">cancel</button>
    </div>
  </div></div>`;
  const close = () => { mr.innerHTML = ''; window.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  mr.querySelector('#pick-cancel').addEventListener('click', close);
  mr.querySelector('.modal-back').addEventListener('click', e => { if (e.target.classList.contains('modal-back')) close(); });
  for (const b of mr.querySelectorAll('.pickcell[data-d]')) {
    b.addEventListener('click', () => {
      if (b.dataset.d === today) return;
      close();
      setFocusDay(b.dataset.d); // persists + rerenders into the focused mission
      location.hash = '#/';
    });
  }
}

// NOW + NEXT — the anchored timeline knows which block is live; the cue names
// the single next rep so a tired brain never has to decide what to do.
function computeCue({ entry, comp, anchor, status, doneB, overflow, closed, upsolve, cfNight }) {
  if (!anchor || closed) return null;
  const el = (Date.now() - anchor) / 60000;
  let cum = 0, blk = null;
  for (const b of comp.blocks) {
    if (el < cum + b.minutes) { blk = b; break; }
    cum += b.minutes;
  }
  if (cfNight && blk && (blk.id === 'B4' || blk.id === 'B5')) {
    return { now: '⚔ CF night', nowId: blk.id, cue: { label: 'round 20:05–22:05 — fight, log it after', hash: null } };
  }
  const nextA = (entry.tierA || []).find(p => {
    const st = status.get(p);
    return !st || !Laws.COMPLETIONS.has(st.outcome);
  });
  const nextB = (entry.tierB || []).find(p => !doneB.has(p));
  const tierACue = label => nextA ? { label: `${label}: ${nextA}`, solve: nextA }
    : nextB ? { label: `recognize: ${nextB}`, recog: nextB }
    : { label: 'quota done — bank extra or review cards', hash: '#/cards' };
  if (!blk) {
    return {
      now: 'day complete',
      cue: App.state.reviews[todayStr()]?.completed
        ? { label: 'review done. sleep by 23:30.', hash: null }
        : { label: 'Block 5 — cards + shuffle review', hash: '#/cards' }
    };
  }
  let cue;
  if (/^(BREAK|LUNCH|DINNER)/.test(blk.id)) cue = { label: `${blk.name.toLowerCase()} — off screen`, hash: null };
  else if (blk.id === 'B0') cue = upsolve
    ? { label: `upsolve: ${upsolve.problem}`, upsolve }
    : overflow.length
      ? { label: `overflow: ${overflow[0].problem}`, solve: overflow[0].problem }
      : tierACue('warm-up');
  else if (blk.id === 'B3') cue = nextB
    ? { label: `recognize: ${nextB}`, recog: nextB } : tierACue('tier A');
  else if (blk.id === 'B4') cue = { label: 'speed drill — CF ladder', hash: '#/ladder' };
  else if (blk.id === 'B5') cue = { label: 'cards + shuffle review', hash: '#/cards' };
  else cue = tierACue('tier A'); // B1, B2a, B2b
  return { now: blk.name, nowId: blk.id, cue };
}

// the Season-2 day timeline (curriculum.s2.json) with the parallel Regime-2
// compressor — informational, reuses the existing days[today].anchor if set.
function renderS2Schedule() {
  const tpl = App.s2?.schedule_template_s2;
  if (!tpl) return '';
  const anchor = App.state.days[todayStr()]?.anchor || null;
  const comp = compressS2(tpl, anchor);
  const BLOCK_LINK = { S0: '#/durability', SDP: '#/arena', SCF: '#/cf-ascent', S5: '#/durability', S1: '#/', S2: '#/', S3: '#/' }; // SDP → the blind Arena (S3)
  let cum = 0;
  const rows = comp.blocks.map(b => {
    const startMin = cum; cum += b.minutes;
    const t = anchor ? `${clock(anchor + startMin * 60000)}–${clock(anchor + cum * 60000)}`
      : `T+${Math.floor(startMin / 60)}:${String(startMin % 60).padStart(2, '0')}`;
    const brk = /break|lunch|dinner/i.test(b.name);
    const dur = b.minutes < b.baseMinutes
      ? `<s class="faint">${minToHM(b.baseMinutes)}</s> <b class="amber">${minToHM(b.minutes)}</b>` : minToHM(b.minutes);
    const content = b.minutes === 0 ? '<span class="faint">— trimmed by the sleep guard</span>'
      : BLOCK_LINK[b.id] ? `<a href="${BLOCK_LINK[b.id]}">${esc(b.content)} →</a>` : esc(b.content);
    return `<tr class="${brk ? 'brk' : ''}"><td class="t">${t}</td><td class="n">${esc(b.name)}</td><td class="c">${dur} · ${content}</td></tr>`;
  }).join('');
  const work = comp.blocks.filter(b => !/break|lunch|dinner/i.test(b.name)).reduce((s, b) => s + b.minutes, 0);
  const sg = tpl.sleep_guard_s2 || {};
  const foot = anchor
    ? `<p style="margin-top:6px">projected end <b class="${comp.over ? 'danger' : 'ok'}">${clock(comp.projectedEnd)}</b>${comp.steps.length ? ` <span class="compchip">SLEEP GUARD · ${comp.steps.join(' · ')}</span>` : ''}<span class="faint"> · hard stop ${esc(sg.hard_stop || '23:00')}</span></p>`
    : `<p class="faint" style="margin-top:6px">~${Math.round(work / 60)}h work. Over-budget nights trim ${esc(sg.cut_order_note || 'SysD → CF → DP → Core-CS')} first — never the durability review or the DSA spine. <button id="s2anchor" class="ghost">anchor the day</button></p>`;
  return `<div class="panel"><h2>Season-2 day <span class="right faint">5 tracks + durability review</span></h2>
    <table class="timeline s2sched">${rows}</table>${foot}</div>`;
}

// ── SEASON 2: the campaign Mission (the self-paced "second attempt") ─────────
// Rendered ONLY when campaignOn(). The classic Mission below is byte-unchanged,
// so the frozen DOM audit (campaign defaults OFF) still passes. WIN = all Tier A
// + all Tier B of the pointer day done, counting Season-1 solves; recorded the
// instant it happens; never a "DAY LOST" [user 2026-06-30].
function renderCampaign(root) {
  const entry = campaignEntry();
  const pointer = campaignPointer();
  const status = problemStatus();
  const cs = campaignDayStatus(entry, App.state.log);
  const justWon = cs.won && recordCampaignWin(entry.day); // idempotent — true only the first time
  const burst = campaignBurst();

  const meter = (label, done, total) => `
    <div class="meter"><div class="lbl"><span>${label}</span><span><b>${done}</b>/${total}</span></div>
    <div class="bar"><div class="fill ${total > 0 && done >= total ? 'full' : ''}" style="width:${total ? Math.min(100, done / total * 100) : 100}%"></div></div></div>`;

  // the 20-day campaign strip — won / partial / fresh, current highlighted
  const strip = App.cur.days.map(d => {
    const s = campaignDayStatus(d, App.state.log);
    const cls = s.won ? 'won' : s.pct > 0 ? 'partial' : 'fresh';
    return `<button class="cstrip-cell ${cls}${d.day === pointer ? ' is-cur' : ''}" data-day="${d.day}"
      title="Day ${d.day}: ${esc(d.focus)} — ${s.aDone}/${s.aTotal} A · ${s.bDone}/${s.bTotal} B${s.won ? ' — WON' : ''}">
      <b>D${d.day}</b><span class="cs-pct">${s.won ? '✓' : s.pct + '%'}</span></button>`;
  }).join('');

  // name-matched "done" (any completion/recognition ever — builds on Season 1)
  const li = (p, i, tier) => {
    const done = tier === 'A' ? !cs.remainingA.includes(p) : !cs.remainingB.includes(p);
    const flagged = tier === 'A' && status.get(p)?.flag;
    return `<li class="${done ? 'done' : ''}" data-${tier === 'A' ? 'cprob' : 'cbprob'}="${i}">
      <span class="st ${done ? (tier === 'A' ? 'solo' : 'recognized') : ''}">${done ? '✓' : '·'}</span>
      <span class="nm">${esc(p)}</span>${sheetMark(p)}
      ${flagged ? '<span class="flagmark" title="flagged in Season 1">⚑</span>' : ''}</li>`;
  };
  const tierAHtml = (entry.tierA || []).map((p, i) => li(p, i, 'A')).join('');
  const tierBHtml = (entry.tierB || []).map((p, i) => li(p, i, 'B')).join('');

  // dual scoreboard — Season-1 is archived history, never the live number
  const rec = record();
  const s2sched = (App.s2?.schedule_template_s2 && typeof renderS2Schedule === 'function') ? renderS2Schedule() : '';
  const up = upcomingContests(App.cur, App.state.days, todayStr(), Date.now(), 4);
  const algoStrip = `<div class="panel"><h2>Upcoming — LC + CF only <span class="right faint"><a href="https://algoarena-contest-tracker.netlify.app/" target="_blank" rel="noopener">AlgoArena ↗</a></span></h2>
    ${up.length ? `<ul class="algolist">${up.map(c => `<li><span class="al-type ${c.type}">${c.type === 'cf' ? 'CF' : 'LC'}</span><span class="nm">${esc(c.name)}</span><span class="faint" style="margin-left:auto">${esc(fmtCountdown(c.inMs))}</span></li>`).join('')}</ul>`
      : '<p class="faint">no LC/CF round in the calendar window — AlgoArena has the live list (AtCoder/CodeChef filtered out).</p>'}</div>`;

  root.innerHTML = `
    <div class="campaignbar">
      <div class="cb-head">
        <span class="cb-tag">▶ THE SECOND ATTEMPT</span>
        <span class="cb-day">Day ${entry.day} · ${esc(entry.phase)}: <b>${esc(entry.focus)}</b></span>
        <span class="cb-controls">
          <button id="cprev" class="ghost" ${pointer <= 1 ? 'disabled' : ''}>◀ prev</button>
          <button id="cnext" class="ghost" ${pointer >= App.cur.days.length ? 'disabled' : ''}>next ▶</button>
          <button id="cexit" class="ghost" title="back to the classic calendar-driven Mission">exit campaign</button>
        </span>
      </div>
      <div class="cstrip">${strip}</div>
    </div>

    ${justWon ? `<div class="banner won-banner">✓ <b>DAY ${entry.day} WON</b> — every Tier A and Tier B cleared.
       ${pointer < App.cur.days.length ? `<button id="cwinnext" class="primary" style="margin-left:10px">NEXT DAY ▸</button>` : 'curriculum complete — into integration + mocks.'}</div>` : ''}
    ${burst.length > 1 ? `<div class="burstchip">🔥 burst — <b>${burst.length}</b> days won today: ${burst.map(d => 'D' + d).join(' → ')}</div>` : ''}

    <div class="panel">
      <h2>Day ${entry.day} mission <span class="right">
        <span class="winbadge ${cs.won ? 'won' : cs.pct > 0 ? 'pending' : ''}">${cs.won ? 'DAY WON' : cs.pct + '% — IN PLAY'}</span></span></h2>
      <div class="meters">
        ${meter('TIER A (full solves)', cs.aDone, cs.aTotal)}
        ${meter('TIER B (recognition)', cs.bDone, cs.bTotal)}
      </div>
      <p class="faint" style="margin-top:8px">Win = clear <b>all</b> Tier A + <b>all</b> Tier B. Your Season-1 solves already count — finish what's left. No clock, no "day lost".</p>
      ${entry.note ? `<p class="muted" style="margin-top:8px">※ ${esc(entry.note)}</p>` : ''}
    </div>

    <div class="cols"><div>
      ${entry.tierA?.length ? `<div class="panel"><h2>Tier A — solve mode (10/10/35)${cs.remainingA.length ? ` · <span class="amber">${cs.remainingA.length} left</span>` : ' <span class="ok">· clear ✓</span>'}</h2>
        <ul class="probs" id="ctiera">${tierAHtml}</ul></div>` : ''}
      ${entry.tierB?.length ? `<div class="panel"><h2>Tier B — recognition (${Laws.TIERB_CEIL_MIN}-min ceiling)${cs.remainingB.length ? ` · <span class="amber">${cs.remainingB.length} left</span>` : ' <span class="ok">· clear ✓</span>'}</h2>
        <ul class="probs" id="ctierb">${tierBHtml}</ul></div>` : ''}
      ${entry.tasks?.length ? `<div class="panel"><h2>Integration tasks</h2><ul class="probs">${(entry.tasks || []).map(t => `<li><span class="st">▸</span>${esc(t)}</li>`).join('')}</ul>
        <p style="margin-top:8px"><a href="#/mock">mock generator ▸</a> · <a href="#/report">report ▸</a></p></div>` : ''}
    </div><div>
      ${s2sched}
      ${algoStrip}
      <div class="panel"><h2>Durability <span class="right faint">beat the 70% cliff</span></h2>
        <p class="muted">Every solve cards the pattern; the deck resurfaces it before it decays — produce from blank, never recognize.</p>
        <p style="margin-top:6px"><a href="#/durability">open the durability dashboard ▸</a> · <a href="#/cards">review deck ▸</a></p></div>
      <div class="archivebar">
        <span class="arch-tag">SEASON 1 · archived</span>
        <span><b>${rec.wins}</b>W–<b>${rec.losses}</b>L</span>
        <span>sheet <b>${sheetCount()}</b>/435</span>
        <span class="faint">history — preserved, not the Season-2 scoreboard</span>
      </div>
    </div></div>`;

  // wiring — the DSA solve/recognize cockpits are reused unchanged; forDay tags
  // the curriculum day for provenance, returnTo pins the campaign Mission.
  root.querySelector('#ctiera')?.addEventListener('click', e => {
    const el = e.target.closest('li[data-cprob]'); if (!el) return;
    App.pending = { problem: entry.tierA[+el.dataset.cprob], tier: 'A', forDay: entry.date, returnTo: '#/' };
    location.hash = '#/solve';
  });
  root.querySelector('#ctierb')?.addEventListener('click', e => {
    const el = e.target.closest('li[data-cbprob]'); if (!el) return;
    App.pending = { problem: entry.tierB[+el.dataset.cbprob], tier: 'B', forDay: entry.date, returnTo: '#/' };
    location.hash = '#/recognize';
  });
  for (const b of root.querySelectorAll('.cstrip-cell[data-day]'))
    b.addEventListener('click', () => setCampaignPointer(+b.dataset.day));
  root.querySelector('#cprev')?.addEventListener('click', () => setCampaignPointer(pointer - 1));
  root.querySelector('#cnext')?.addEventListener('click', () => campaignNext());
  root.querySelector('#cwinnext')?.addEventListener('click', () => campaignNext());
  root.querySelector('#cexit')?.addEventListener('click', () => stopCampaign());
  root.querySelector('#s2anchor')?.addEventListener('click', async () => {
    const t = todayStr();
    App.state.days[t] = { ...(App.state.days[t] || {}), anchor: Date.now() };
    await saveDays(); rerender();
  });
}

export function renderMission(root) {
  if (campaignOn()) return renderCampaign(root); // SEASON 2: the second-attempt lane
  const today = todayStr();
  // FOCUS DAY — run another of the 20 days as the active mission. The page
  // PRESENTS the focus day's curriculum; the scoreboard (meters, win) is
  // computed on the day the work CREDITS under §3.9 (catch-up → real today,
  // work-ahead → the focus day); ALL day-state (anchor, bad-day, contests)
  // stays bound to the REAL today, so a sealed past day is never mutated.
  // focus engages only while the REAL today is itself one of the 20 days, so
  // the credit date (and its quota) is always a valid curriculum day
  const focused = isFocused() && App.cur.days.some(d => d.date === today);
  // past the end of the plan with nothing else active: never clamp onto the
  // last day and present its empty list as a live mission (see above)
  if (!focused && sprintDayN() > App.cur.days.length) return renderWindowClosed(root);
  const entry = focused ? App.cur.days.find(d => d.date === activeDate()) : dayEntry();
  const sbDate = focused ? creditFocusDate() : today;   // scoreboard / credit date
  const dir = focused ? focusDirection() : null;
  const q = effQuota(focused ? sbDate : entry.date);
  const doneA = completedA(sbDate);
  const doneB = recognizedB(sbDate);
  const status = problemStatus();
  const dayRec = App.state.days[today];
  const overflow = overflowQueue();
  const tpl = App.cur.schedule_template;
  const closed = !focused && !!dayRec?.badDay; // §3.5 bad-day protocol pressed (real-day only)
  const credit = Laws.contestCredit(App.cur, App.state, sbDate); // §3.6
  const upsolve = Laws.upsolveTask(App.cur, App.state, today);  // §3.6, exactly one
  const cfInfo = Laws.canLogCfRound(App.cur, App.state, today);
  const cfNight = !focused && !!dayRec?.cfRound;
  const isSat = !focused && entry.weekday === 'Sat';
  // a day with NO quota (0/0 — the Integration days, and any day the clamp used
  // to land on) can never be "won": 0>=0 && 0>=0 is vacuous, not an achievement
  const hasQuota = q.a + q.b > 0;
  const won = hasQuota && doneA.size + credit >= q.a && doneB.size >= q.b;
  const lad = App.cur.contests.codeforces.ladder;
  const week = sprintWeek();
  const finish = projectedFinish();
  const recog = recognitionStats(App.state.log, today); // slate: recognition chip
  const nc = nextContest(App.cur, App.state.days, today, Date.now()); // slate: next-contest card

  // ── live pace: solve-budget vs the §3.4 hard stop (read-only; no law math) ──
  // Slate #1. Work estimate uses his rolling Tier A average (capped at the
  // 35-min ceiling) + a 3-min Tier B rep — honest, not the worst case.
  const nowMin = App.clockOverride != null ? App.clockOverride
    : new Date().getHours() * 60 + new Date().getMinutes();
  const hardStop = Laws.parseHM(tpl.sleep_guard.hard_stop);
  const minsLeft = hardStop - nowMin;
  const needA = Math.max(0, q.a - (doneA.size + credit));
  const needB = Math.max(0, q.b - doneB.size);
  const recentA = App.state.log.filter(r => r.tier === 'A' && typeof r.minutes === 'number' && !r.upsolve && r.outcome !== 'resolve').slice(-10).map(r => r.minutes);
  const avgA = recentA.length ? Math.min(Laws.CEIL_MIN, Math.round(recentA.reduce((a, b) => a + b, 0) / recentA.length)) : 22;
  const workMin = needA * avgA + needB * 3;
  const quotaDone = needA === 0 && needB === 0;
  const canWin = workMin <= minsLeft;
  const pace = { nowMin, minsLeft, needA, needB, avgA, workMin, quotaDone, canWin };

  // ── timeline rows — block minutes may be compressed by the sleep guard;
  //    a planned CF night replaces Blocks 4–5 (cf_night_variant) ──
  let cum = 0;
  const anchor = dayRec?.anchor || null;
  // the timeline is always the REAL working day's schedule (he is physically
  // solving now) — in focus mode that is today's quota/compression, not the
  // focus day's, so the sleep-guard projection stays tied to his real clock
  const tlQ = focused ? (effQuota(today) || q) : q;
  const comp = tlQ.comp;
  const shownBlocks = cfNight ? comp.blocks.filter(b => b.id !== 'B4' && b.id !== 'B5') : comp.blocks;
  const totalMin = comp.blocks.reduce((s, b) => s + b.minutes, 0);
  const baseTotal = comp.blocks.reduce((s, b) => s + b.baseMinutes, 0);
  const keepWarm = Laws.dpKeepWarm(App.cur, focused ? displayDayN() : entry.day);
  // the cue works on warm-up nights too — computeCue is inert without an anchor
  const cueData = computeCue({ entry, comp, anchor, status, doneB, overflow, closed, upsolve, cfNight });
  const rows = shownBlocks.map(b => {
    const startMin = cum; cum += b.minutes;
    const t = anchor
      ? `${clock(anchor + startMin * 60000)}–${clock(anchor + cum * 60000)}`
      : `T+${Math.floor(startMin / 60)}:${String(startMin % 60).padStart(2, '0')}`;
    const isBreak = /BREAK|LUNCH|DINNER/.test(b.id);
    let content = esc(b.content);
    if (b.id === 'B4') {
      const pk = preSprint() ? null : Laws.speedDrillPick(App.cur, App.state.log, today);
      content = pk?.mode === 'resolve'
        ? `<a href="#/ladder">speed drill: ${pk.want} blank re-solves · ${pk.minutes} min strict → open</a>`
        : `<a href="#/ladder">CF ladder ${esc(lad['week' + week])} · ${lad.per_problem_minutes} min each → open panel</a>`;
      content += ` <span class="faint">(${esc(b.content)})</span>`;
    }
    if (b.id === 'B5') {
      content = `<a href="#/cards">cards + shuffle review → open vault</a>`
        + ` <span class="faint">(${esc(b.content)})</span>`;
      if (keepWarm) content += ` <span class="amber">+ ${keepWarm.minutes}-min keep-warm: ${esc(keepWarm.problem)}</span>`;
    }
    const dur = b.minutes < b.baseMinutes
      ? `<s class="faint">${minToHM(b.baseMinutes)}</s> <b class="amber">${minToHM(b.minutes)}</b>`
      : minToHM(b.minutes);
    return `<tr class="${isBreak ? 'brk' : ''} ${b.id === cueData?.nowId ? 'now' : ''}">
      <td class="t">${t}</td><td class="n">${esc(b.name)}</td>
      <td class="c">${dur} · ${content}</td></tr>`;
  }).join('') + (cfNight ? `<tr class="cfrow">
      <td class="t">20:05–22:05</td><td class="n">⚔ CF round</td>
      <td class="c">${esc(dayRec.cfRound.name || 'Codeforces')} — replaces speed drill + review (cf night)</td></tr>` : '');

  let endHtml = '';
  if (cfNight) {
    endHtml = `<p style="margin-top:8px">CF night — round ends <b class="ok">22:05</b>
      <span class="faint"> · hard stop ${esc(tpl.sleep_guard.hard_stop)} · in bed ${esc(tpl.sleep_guard.in_bed)} · tomorrow's Block 0 carries the upsolve</span></p>`;
  } else if (anchor) {
    const saved = baseTotal - totalMin;
    endHtml = `<p style="margin-top:8px">projected end <b class="${comp.over ? 'danger' : 'ok'}">${clock(comp.projectedEnd)}</b>
      ${comp.steps.length ? `<span class="compchip">SLEEP GUARD −${saved}m · ${comp.steps.map(stepLabel).join(' · ')}</span>` : ''}
      ${comp.over ? `<span class="danger"> — fully compressed and still past ${esc(tpl.sleep_guard.compress_when_projected_end_after)}; the ${esc(tpl.sleep_guard.hard_stop)} stop does not move</span>` : ''}
      <span class="faint"> · hard stop ${esc(tpl.sleep_guard.hard_stop)} · in bed ${esc(tpl.sleep_guard.in_bed)}</span></p>`;
  } else {
    endHtml = `<p class="muted" style="margin-top:8px">total ${minToHM(totalMin)} — press Start Day when you're back from the gym to pin the timeline.</p>`;
  }

  // ── problem lists ──
  const tierAHtml = (entry.tierA || []).map((p, i) => {
    const st = status.get(p);
    const mark = st ? ST_MARK[st.outcome] || '' : '';
    const cls = st && st.outcome !== 'abandoned' ? st.outcome : '';
    return `<li class="${st ? 'done' : ''}" data-prob="${i}">
      <span class="st ${cls}">${mark || '·'}</span>
      <span class="nm">${esc(p)}</span>${sheetMark(p)}
      ${st?.flag ? '<span class="flagmark" title="flagged for Day 19–20">⚑</span>' : ''}
    </li>`;
  }).join('');

  const tierBHtml = (entry.tierB || []).map((p, i) => {
    // focus lists mark any recognized rep (date-agnostic), matching the banner;
    // today's list keeps the original "recognized today" quota semantics
    const rec = focused ? status.get(p)?.outcome === 'recognized' : doneB.has(p);
    return `<li data-bprob="${i}" class="${rec ? 'done' : ''}">
      <span class="st ${rec ? 'recognized' : ''}">${rec ? '✓' : '·'}</span>
      <span class="nm">${esc(p)}</span>${sheetMark(p)}
    </li>`;
  }).join('');

  const tasksHtml = (entry.tasks || []).map(t => `<li><span class="st">▸</span>${esc(t)}</li>`).join('');

  const meter = (label, done, quota, note = '') => `
    <div class="meter">
      <div class="lbl"><span>${label}</span><span>${note}<b>${done}</b>/${quota}</span></div>
      <div class="bar"><div class="fill ${quota > 0 && done >= quota ? 'full' : ''}"
        style="width:${quota ? Math.min(100, done / quota * 100) : 100}%"></div></div>
    </div>`;
  const trims = [];
  if (q.badDayTrim) trims.push(`bad day −${q.badDayTrim}`);
  if (q.compTrim) trims.push(`sleep guard −${q.compTrim}`);
  const bNote = trims.length ? `<span class="amber">${trims.join(' · ')} </span>` : '';
  const aNote = credit ? `<span style="color:var(--cyan)" title="logged contest credits ${credit} Tier A (§3.6)">${doneA.size} + ${credit} ⚔ = </span>` : '';

  // slate #1 — the pace ribbon, glued under the meters (today-flow only)
  const ribbon = (!focused && !preSprint() && !closed && entry.tierA?.length) ? `
    <div class="paceline ${quotaDone ? 'ok' : minsLeft <= 0 ? 'behind' : canWin ? '' : 'behind'}">
      ${quotaDone
        ? `<b class="ok">✓ quota met</b> <span class="faint">— bank extras or protect sleep</span>`
        : `<span><b>${needA}</b> A · <b>${needB}</b> B left</span>
           <span class="faint">~${workMin}m of work</span>
           <span class="faint">vs <b class="${minsLeft <= 0 ? 'danger' : ''}">${minsLeft > 0 ? minsLeft + 'm' : 'past ' + esc(tpl.sleep_guard.hard_stop)}</b> to the stop</span>
           <span class="pl-verdict ${minsLeft <= 0 ? 'danger' : canWin ? 'ok' : 'danger'}">${minsLeft <= 0 ? 'over the line — sleep' : canWin ? 'on the line ✓' : 'behind ~' + (workMin - minsLeft) + 'm'}</span>`}
    </div>` : '';

  // slate #2 — tired-mode salvage: 21:30+, behind, still open. Reduces a tired
  // 10pm to "do exactly these, then sleep" without touching any §3 math.
  const flagged = new Set(App.state.log.filter(r => r.flag).map(r => r.problem));
  const float = list => [...list].sort((a, b) => (flagged.has(b) ? 1 : 0) - (flagged.has(a) ? 1 : 0));
  const remA = float((entry.tierA || []).filter(p => !doneA.has(p) && !/^ALL remaining|^Overflow-log/i.test(p))).slice(0, Math.max(1, needA));
  const remB = ((entry.tierB || []).filter(p => !doneB.has(p))).slice(0, Math.max(1, needB));
  const salvage = (!focused && !preSprint() && !closed && !quotaDone && nowMin >= 21 * 60 + 30) ? `
    <div class="salvage">
      <div class="phaselbl">${canWin ? '🌙 SALVAGE — you can still win tonight' : '🌙 SALVAGE — protect the sleep'}</div>
      <p class="muted">${nowMin >= hardStop ? `Past ${esc(tpl.sleep_guard.hard_stop)}. ` : `${minsLeft}m to the ${esc(tpl.sleep_guard.hard_stop)} stop. `}${canWin
        ? `Do exactly these, then stop — the rest rolls to tomorrow's Block 0 on its own.`
        : `A win isn't reachable in the time. Bank these high-value ones, then sleep — or press <b>Bad Day</b> to close honestly. Either way: in bed by ${esc(tpl.sleep_guard.in_bed)}.`}</p>
      <ul class="probs salvagelist">
        ${remA.map(p => `<li data-sprob="${esc(p)}"><span class="st">A</span><span class="nm">${esc(p)}</span>${flagged.has(p) ? '<span class="flagmark">⚑</span>' : ''}</li>`).join('')}
        ${remB.map(p => `<li data-srecog="${esc(p)}"><span class="st recognized">B</span><span class="nm">${esc(p)}</span></li>`).join('')}
      </ul>
    </div>` : '';

  // FOCUS DAY banner — the honest header for a non-today mission: which day's
  // list this is, where the work credits (§3.9), this list's progress, and the
  // exits. A stale warning fires if the real day rolled on while parked on a past day.
  const focusBanner = focused ? (() => {
    const sbN = sprintDayN(sbDate);
    const aCleared = (entry.tierA || []).filter(p => Laws.COMPLETIONS.has(status.get(p)?.outcome)).length;
    const bCleared = (entry.tierB || []).filter(p => status.get(p)?.outcome === 'recognized').length;
    const stale = dir === 'catch-up' && App.focusSetReal && App.focusSetReal !== today;
    const creditTxt = dir === 'catch-up'
      ? `solves credit <b>today (Day ${displayDayN()})</b> · this day stays sealed`
      : `solves credit <b>Day ${sbN}</b> (work-ahead)`;
    return `<div class="focusbar ${dir}">
      <div class="fb-main">
        <span class="fb-tag">▶ RUNNING DAY ${entry.day}</span>
        <span class="fb-focus">${esc(entry.focus)} <span class="faint">· ${esc(entry.weekday)} ${esc(entry.date)} · ${dir}</span></span>
      </div>
      <div class="fb-meta">${creditTxt} · <b>${aCleared}</b>/${(entry.tierA || []).length} A · <b>${bCleared}</b>/${(entry.tierB || []).length} B cleared on this list</div>
      ${stale ? `<div class="fb-stale">⚠ the real day has rolled on to <b>Day ${displayDayN()}</b> since you started this focus — today's own quota is still waiting.</div>` : ''}
      <div class="fb-actions">
        <button id="backtoday" class="primary">↩ BACK TO TODAY</button>
        <button id="runanother" class="ghost">▸ run another day</button>
      </div>
    </div>`;
  })() : '';

  root.innerHTML = `
    ${focusBanner}
    ${!preSprint() && App.state.log.length ? `<div class="banner cta-campaign"><b>▶ THE SECOND ATTEMPT</b> — re-run the curriculum from <b>Day 2</b> at your own pace. Nothing is reset; your logs stay and count. Complete a day's full Tier A + Tier B to <b>WIN</b> it — no clock, no "day lost". <button id="startcampaign" class="primary" style="margin-left:8px">START ▸</button></div>` : ''}
    ${preSprint() ? `<div class="banner">WARM-UP NIGHT — <b>Day 1 · ${esc(dayEntry(1).date)} (${esc(dayEntry(1).weekday)})</b> starts tomorrow.
       Everything works now: reps bank into the sheet and the vault, logged as <b>day 0</b>.
       Straight talk: tomorrow's quota counts only tomorrow's solves (§3.5) — pre-solving the Day 1 list
       tonight just means re-solving from blank tomorrow. Sleep by ${esc(tpl.sleep_guard.in_bed)}.</div>` : ''}
    ${closed ? `<div class="banner">Day closed — bad day protocol. Remainder rolls to tomorrow's Block 0;
       tomorrow's Tier B −3. No judgment. Rest.</div>` : ''}
    ${!focused && entry.contest ? `<div class="banner">⚔ CONTEST — ${esc(entry.contest.name)} at ${esc(entry.contest.time_ist)} IST
       ${entry.contest.credits_tierA ? `· ${entry.contest.credits_tierA} problems credit today's Tier A quota` : ''}
       ${dayRec?.contest?.logged
         ? `<span class="ok"> · logged: ${dayRec.contest.solved ?? '?'} solves${dayRec.contest.firstUnsolved
             ? ` · upsolve tomorrow: ${esc(dayRec.contest.firstUnsolved)}` : ' · solved everything'}</span>`
         : (!preSprint() && !closed ? `<button id="logcontest" style="margin-left:10px">LOG CONTEST ▸</button>` : '')}</div>` : ''}
    ${isSat && !entry.contest && !preSprint() ? (dayRec?.biweekly
      ? `<div class="banner">⚔ LC BIWEEKLY tonight 20:00 IST
          ${dayRec.biweekly.logged
            ? `<span class="ok"> · logged: ${dayRec.biweekly.solved ?? '?'} solves${dayRec.biweekly.firstUnsolved
                ? ` · upsolve tomorrow: ${esc(dayRec.biweekly.firstUnsolved)}` : ' · solved everything'}</span>`
            : `<button id="logbiweekly" style="margin-left:10px">LOG CONTEST ▸</button>
               <button id="unbiweekly" class="ghost" style="margin-left:6px">not live after all</button>`}</div>`
      : (() => {
          // time-aware: past the 20:00 window, stop implying it's upcoming
          const nowMin = App.clockOverride != null ? App.clockOverride : new Date().getHours() * 60 + new Date().getMinutes();
          const past = nowMin >= 20 * 60;
          return `<p class="satline">Saturday — ${past ? 'did you play tonight\'s LC Biweekly (20:00)?' : 'LC Biweekly possible at 20:00 IST.'}
          <button id="markbiweekly" class="ghost">${past ? 'log it' : 'mark tonight live'}</button></p>`;
        })()) : ''}
    ${!focused && upsolve ? `<div class="cuebar" id="upsolvebar" style="border-color:var(--amber)">
      <span class="cuenow">BLOCK 0 · UPSOLVE</span>
      <span class="cuenext">⚡ ${esc(upsolve.problem)} <span class="faint">— ${esc(upsolve.source)} · editorial → close → re-implement → card</span></span>
    </div>` : ''}
    ${!focused && cueData ? `<div class="cuebar" id="cuebar" ${cueData.cue.hash || cueData.cue.solve || cueData.cue.recog ? '' : 'data-inert="1"'}>
      <span class="cuenow">NOW · ${esc(cueData.now)}</span>
      <span class="cuenext">▸ ${esc(cueData.cue.label)}</span>
      ${cueData.cue.hash || cueData.cue.solve || cueData.cue.recog ? '<kbd>N</kbd>' : ''}
    </div>` : ''}
    <div id="cfsync"></div>
    ${salvage}
    <div class="panel">
      ${(() => {
        // projected finish is the scariest number when behind — flag it red
        // once it slips past the real finish date (the 435-by-07-01 line)
        const late = finish && finish !== 'DONE' && finish > App.cur.meta.end_date;
        return `<h2>${preSprint() ? 'Tomorrow — ' : ''}Day ${entry.day} · ${esc(entry.date)} ${esc(entry.weekday)} — ${esc(entry.phase)}: ${esc(entry.focus)}
        <span class="right muted">projected finish: <b class="${late ? 'danger' : finish === 'DONE' ? 'ok' : ''}">${finish ? esc(finish) : '—'}</b>${late ? ` <span class="danger" title="past the ${esc(App.cur.meta.end_date)} finish line — close the pace gap">▲ behind</span>` : ''}</span></h2>`;
      })()}
      ${preSprint()
        ? `<div class="meters"><span class="muted">warm-up · tonight so far: <b class="ok">${doneA.size}</b> Tier A · <b class="ok">${doneB.size}</b> Tier B
            — no quota, no W/L. The scoreboard starts tomorrow.</span></div>`
        : `<div class="meters">
        ${meter('TIER A (full solves)', doneA.size + credit, q.a, aNote)}
        ${meter('TIER B (recognition)', doneB.size, q.b, bNote)}
        <span class="winbadge ${won ? 'won' : closed ? 'closed' : 'pending'}">${won ? 'DAY WON' : closed ? 'CLOSED' : hasQuota ? 'IN PLAY' : 'NO QUOTA — INTEGRATION'}</span>
      </div>`}
      ${ribbon}
      ${focused ? `<p class="faint" style="margin-top:8px">▸ meter is <b>Day ${sprintDayN(sbDate)}</b>'s quota — where this focus credits under §3.9; the lists below are Day ${entry.day}'s.</p>` : ''}
      ${recog.reps ? `<p class="faint recogchip" style="margin-top:8px">recognition library:
        <b>${recog.reps}</b> reps · <b class="${recog.inTimePct == null ? '' : recog.inTimePct >= 70 ? 'ok' : 'amber'}">${recog.inTimePct ?? '—'}${recog.inTimePct != null ? '%' : ''}</b> named in time ·
        <b class="ok">✓${recog.pass}</b> <b class="amber">~${recog.partial}</b> <b class="danger">✗${recog.fail}</b> ·
        <a href="#/wall">the wall ▸</a></p>` : ''}
      ${(() => {
        const cu = catchUpLedger(App.state.log, today); // idea 3: make-up grind, visible & honest
        return cu.week ? `<p class="faint makeupchip" style="margin-top:6px">🛠 make-up: <b class="ok">${cu.week}</b> missed-day problem${cu.week > 1 ? 's' : ''} cleared this week${cu.total > cu.week ? ` · ${cu.total} all-time` : ''} <span class="faint">— catch-up grind, credited honestly</span></p>` : '';
      })()}
      ${entry.note ? `<p class="muted" style="margin-top:10px">※ ${esc(entry.note)}</p>` : ''}
      ${!focused && !preSprint() ? `<p style="margin-top:10px"><button id="runday" class="ghost">▸ RUN ANOTHER DAY <span class="faint">— catch up a miss or work ahead</span></button></p>` : ''}
    </div>
    <div class="cols">
      <div>
        ${entry.tierA?.length ? `<div class="panel ${closed ? 'locked' : ''}">
          <h2>Tier A — click to enter solve mode (10/10/35)</h2>
          <ul class="probs" id="tiera">${tierAHtml}</ul>
        </div>` : ''}
        ${entry.tierB?.length ? `<div class="panel ${closed ? 'locked' : ''}">
          <h2>Tier B — click for recognition mode (${Laws.TIERB_CEIL_MIN}-min ceiling)</h2>
          <ul class="probs" id="tierb">${tierBHtml}</ul>
        </div>` : ''}
        ${entry.tasks?.length ? `<div class="panel">
          <h2>Integration tasks</h2>
          <ul class="probs">${tasksHtml}</ul>
          <p style="margin-top:10px"><a href="#/mock">open the mock generator ▸</a> ·
            <a href="#/report">end-of-sprint report ▸</a></p>
        </div>` : ''}
      </div>
      <div>
        ${overflow.length ? `<div class="panel ${closed ? 'locked' : ''}">
          <h2 class="danger">Block 0 — overflow queue (${overflow.length})</h2>
          <ul class="probs" id="overflow">
            ${overflow.map((o, i) => `<li data-oprob="${i}"><span class="st danger">↩</span>
              <span class="nm">${esc(o.problem)}</span><span class="faint" style="margin-left:auto">D${o.fromDay}</span></li>`).join('')}
          </ul>
        </div>` : ''}
        <div class="panel">
          <h2>Day timeline <span class="right">${anchor
            ? `anchored <b class="ok">${clock(anchor)}</b> <button id="reanchor" style="padding:1px 8px;font-size:11px">re-anchor</button>`
            : `<button id="startday" class="primary">${preSprint() ? 'START WARM-UP ▸' : 'START DAY ▸'}</button>`}</span></h2>
          <table class="timeline">${rows}</table>
          ${endHtml}
          ${!preSprint() && !closed ? `<p style="margin-top:10px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <span>${cfNight
              ? (dayRec.cfRound.logged
                ? '<span class="ok">CF round logged ✓</span>'
                : `<button id="logcf" class="ghost">log tonight's CF round</button>
                   <button id="uncf" class="ghost">cancel CF night</button>`)
              : (cfInfo.allowed
                ? `<button id="cfnight" class="ghost">CF round tonight? ${esc(cfInfo.divs.join('/'))}${Number.isFinite(cfInfo.cap) ? ` · ${cfInfo.used}/${cfInfo.cap} used` : ''}</button>`
                : `<span class="faint">CF cap reached (${cfInfo.used}/${cfInfo.cap}, days 1–18)</span>`)}</span>
            <button id="badday" class="ghost">bad day — close it</button></p>` : ''}
        </div>
        ${(() => {
          const p = paceSeries(App.cur, App.state.log, today);
          const formed = p.sheet - p.baseline > 0;
          const so = soloOptimalRate(App.state.log); // R6 headline
          return `<div class="panel">
            <h2>Pace — the 435 line <span class="right faint">${p.required.remaining > 0 && p.todayN <= 18
              ? `need ${p.required.perDay}/day · ${p.required.daysLeft} day${p.required.daysLeft === 1 ? '' : 's'} to D18`
              : p.required.remaining <= 0 ? '435 touched ✓' : 'integration days'}</span></h2>
            ${paceSvg(p)}
            <p style="margin-top:6px">SOLO-OPTIMAL <b class="${so.lowData ? '' : so.rate >= 50 ? 'ok' : 'amber'}">${so.rate ?? '—'}${so.rate != null ? '%' : ''}</b>
              <span class="faint">${so.lowData ? `(n=${so.n}${so.n < 3 ? ' — n<3' : ''})` : `over ${so.n} depth-logged solves`} · reached the optimal tier alone</span>
              <button id="architect" class="ghost right" style="padding:1px 10px;font-size:11px" title="compact markdown status block for the architect chat">ARCHITECT EXPORT</button></p>
            ${formed ? '' : '<p class="faint" style="margin-top:4px">the red line forms as days close.</p>'}
          </div>`;
        })()}
        ${nc ? `<div class="panel nextcontest">
          <h2>Next contest <span class="right faint">${esc((nc.type === 'cf' ? 'codeforces' : nc.type === 'other' ? 'contest' : 'leetcode'))}</span></h2>
          <p><b>${esc(nc.name)}</b>${nc.day ? ` <span class="faint">· Day ${nc.day}</span>` : ''}
            <span class="cyan" style="float:right">${esc(fmtCountdown(nc.inMs))}</span></p>
          <p class="faint" style="margin-top:2px">${esc(nc.date)}${nc.timeIst ? ` · ${esc(nc.timeIst)} IST` : ''}
            ${nc.link ? `· <a href="${esc(nc.link)}" target="_blank" rel="noopener">open ▸</a>` : ''}</p>
        </div>` : ''}
      </div>
    </div>`;

  // ── wiring ──
  root.querySelector('#tiera')?.addEventListener('click', e => {
    if (closed) return;
    const li = e.target.closest('li[data-prob]');
    if (!li) return;
    // focus mode tags the solve with the focus day; logStamp keeps row.date as
    // the REAL today, the §3.9 credit rule routes it, and returnTo pins the focus
    App.pending = { problem: entry.tierA[+li.dataset.prob], tier: 'A', ...(focused ? { forDay: entry.date, returnTo: '#/' } : {}) };
    location.hash = '#/solve';
  });

  root.querySelector('#overflow')?.addEventListener('click', e => {
    if (closed) return;
    const li = e.target.closest('li[data-oprob]');
    if (!li) return;
    App.pending = { problem: overflow[+li.dataset.oprob].problem, tier: 'A' };
    location.hash = '#/solve';
  });

  // slate #2 — salvage list launches straight into the cockpit
  root.querySelector('.salvagelist')?.addEventListener('click', e => {
    const a = e.target.closest('li[data-sprob]'), b = e.target.closest('li[data-srecog]');
    if (a) { App.pending = { problem: a.dataset.sprob, tier: 'A' }; location.hash = '#/solve'; }
    else if (b) { App.pending = { problem: b.dataset.srecog, tier: 'B' }; location.hash = '#/recognize'; }
  });

  // §3.6 contest wiring
  const saveDay = async patch => {
    App.state.days[today] = { ...(App.state.days[today] || { day: entry.day }), ...patch };
    await saveDays();
    rerender();
  };
  root.querySelector('#logcontest')?.addEventListener('click', () => {
    contestModal(entry.contest.name, r =>
      saveDay({ contest: { name: entry.contest.name, ...r, logged: true, ts: Date.now() } }));
  });
  root.querySelector('#markbiweekly')?.addEventListener('click', () =>
    saveDay({ biweekly: { name: 'LC Biweekly', planned: true, ts: Date.now() } }));
  root.querySelector('#unbiweekly')?.addEventListener('click', () => saveDay({ biweekly: undefined }));
  root.querySelector('#logbiweekly')?.addEventListener('click', () => {
    contestModal('LC Biweekly', r =>
      saveDay({ biweekly: { name: 'LC Biweekly', ...r, logged: true, ts: Date.now() } }));
  });
  root.querySelector('#cfnight')?.addEventListener('click', () =>
    saveDay({ cfRound: { name: `CF ${cfInfo.divs.join('/')}`, planned: true, ts: Date.now() } }));
  root.querySelector('#uncf')?.addEventListener('click', () => saveDay({ cfRound: undefined }));
  root.querySelector('#logcf')?.addEventListener('click', () => {
    contestModal(dayRec.cfRound.name || 'CF round', r =>
      saveDay({ cfRound: { ...dayRec.cfRound, ...r, logged: true, ts: Date.now() } }));
  });
  // Architect export (Wave 4 feature 7) — one click, clipboard
  root.querySelector('#architect')?.addEventListener('click', async e => {
    const md = architectExport(App.cur, App.state, today, Laws);
    try {
      await navigator.clipboard.writeText(md);
      e.target.textContent = 'COPIED ✓';
    } catch {
      prompt('Copy the status block:', md);
    }
  });

  // CF auto-sync (Wave 4 feature 2): rating chip + 48h participation banner
  // that PREFILLS the log modal — confirmation stays his (§3.6 upsolve law).
  // Skipped in focus mode (a today-flow aid; #cfsync isn't rendered there).
  if (!focused) fetch('/api/cf').then(r => r.json()).then(cf => {
    const host = root.querySelector('#cfsync');
    if (!host || !cf || cf.offline) return;
    const delta = cf.rating.length >= 2 ? cf.current - cf.rating[cf.rating.length - 2].newRating : null;
    const needsLog = cf.recentContests.length && !dayRec?.cfRound?.logged && !closed && !preSprint();
    const c0 = cf.recentContests[0];
    host.innerHTML = `
      ${needsLog ? `<div class="cuebar" style="border-color:var(--amber)">
        <span class="cuenow">CF SYNC</span>
        <span class="cuenext">⚔ contest ${esc(String(c0.contestId))} detected (${c0.solved} solved${c0.firstUnsolved ? ` · stuck on ${esc(c0.firstUnsolved)}` : ''})
          — <a href="#" id="cflogquick">log it ▸</a></span>
      </div>` : ''}
      <p class="faint" style="margin:4px 2px">CF ${esc(cf.handle)}: <b>${cf.current ?? '—'}</b>${delta != null ? ` <span class="${delta >= 0 ? 'ok' : 'danger'}">(${delta >= 0 ? '+' : ''}${delta})</span>` : ''}${cf.autoChecked ? ` · ${cf.autoChecked} ladder item${cf.autoChecked > 1 ? 's' : ''} auto-checked ✓` : ''}${cf.stale ? ' · <span class="amber">offline — cached</span>' : ''}</p>`;
    host.querySelector('#cflogquick')?.addEventListener('click', e => {
      e.preventDefault();
      contestModal(`CF contest ${c0.contestId}`, r =>
        saveDay({ cfRound: { name: `CF ${c0.contestId}`, ...r, logged: true, ts: Date.now() } }),
        { solved: c0.solved, firstUnsolved: c0.firstUnsolved ? `${c0.contestId}${c0.firstUnsolved}` : null });
    });
  }).catch(() => {});

  root.querySelector('#upsolvebar')?.addEventListener('click', () => {
    if (closed) return;
    App.pending = { problem: upsolve.problem, tier: 'A', upsolve: true, source: upsolve.source };
    location.hash = '#/solve';
  });

  root.querySelector('#badday')?.addEventListener('click', async () => {
    if (!confirm('Bad day protocol: today closes without judgment, the remainder rolls to '
      + 'tomorrow\'s Block 0, tomorrow\'s Tier B drops by 3. One press per day. Close it?')) return;
    App.state.days[today] = { ...(App.state.days[today] || { day: entry.day }), badDay: true };
    await saveDays();
    rerender();
  });

  root.querySelector('#tierb')?.addEventListener('click', e => {
    if (closed) return;
    const li = e.target.closest('li[data-bprob]');
    if (!li) return;
    App.pending = { problem: entry.tierB[+li.dataset.bprob], tier: 'B', ...(focused ? { forDay: entry.date, returnTo: '#/' } : {}) };
    location.hash = '#/recognize';
  });

  // the anchor record is always the REAL today's (he is solving now); in focus
  // mode the day number is still today's, never the focus day's
  const dayTag = () => preSprint() ? 0 : displayDayN();
  root.querySelector('#startday')?.addEventListener('click', async () => {
    App.state.days[today] = { ...(App.state.days[today] || {}), day: dayTag(), anchor: Date.now() };
    await saveDays();
    rerender();
    if (!focused) briefingModal(); // feature 3: one screen, then into the day (today-flow only)
  });

  root.querySelector('#reanchor')?.addEventListener('click', async () => {
    if (!confirm('Re-anchor the day to right now?')) return;
    App.state.days[today] = { ...(App.state.days[today] || {}), day: dayTag(), anchor: Date.now() };
    await saveDays();
    rerender();
  });

  // FOCUS DAY exits + picker
  root.querySelector('#backtoday')?.addEventListener('click', () => { clearFocusDay(); location.hash = '#/'; });
  root.querySelector('#runanother')?.addEventListener('click', () => dayPickerModal());
  root.querySelector('#runday')?.addEventListener('click', () => dayPickerModal());
  root.querySelector('#startcampaign')?.addEventListener('click', () => startCampaign(App.state.log.length ? 2 : 1)); // SEASON 2: enter the lane

  // NOW + NEXT: click the bar or press N — zero decisions mid-grind
  const runCue = () => {
    const c = cueData?.cue;
    if (!c) return;
    if (c.upsolve) {
      App.pending = { problem: c.upsolve.problem, tier: 'A', upsolve: true, source: c.upsolve.source };
      location.hash = '#/solve';
    }
    else if (c.solve) { App.pending = { problem: c.solve, tier: 'A' }; location.hash = '#/solve'; }
    else if (c.recog) { App.pending = { problem: c.recog, tier: 'B' }; location.hash = '#/recognize'; }
    else if (c.hash) location.hash = c.hash;
  };
  const bar = root.querySelector('#cuebar');
  if (bar && !bar.dataset.inert) bar.addEventListener('click', runCue);
  keyHandler = e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key.toLowerCase() === 'n') runCue();
  };
  window.addEventListener('keydown', keyHandler);
  // the live block shifts with the clock; keep the cue honest
  cueTimer = setInterval(() => {
    if ((location.hash || '#/') === '#/') rerender();
  }, 60000);
}
