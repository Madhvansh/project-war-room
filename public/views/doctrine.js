// SEASON 3 — DOCTRINE (#/doctrine): teach first, test second. Shipped, verified
// theory + Q&A (doctrine.s3.json) so ZERO authoring falls on the user. The loop
// per unit: COLD PROBE (attempt before reading — baseline + encoding primer) →
// the 80/20 LESSON → close it → immediate RECALL → D+1 / D+3 delayed recall.
// Mastery = correct DELAYED recall; reading alone moves no gate. Cards mint
// ONLY on miss/partial, deduped by contentId, with the MODEL answer as the
// back-face (produce.js canon variant). LLD/HLD get BUILD mode: worked design →
// COLD blank build → change request → failure injection. Off-sheet, additive.
import { App, esc, todayStr, saveDoctrine, rerender, s3Content } from '../app.js';
import { produceRep, cleanupProduce } from '../produce.js';

let DOC; // doctrine.s3.json: undefined = not requested, 'pending' = fetching, null = missing, object = loaded
let tab = null;      // active subject id | 'lld' | 'hld'

export function cleanupDoctrine() { cleanupProduce(); }

const dd = () => (App.state.doctrine ||= { read: {}, probes: {}, recalls: [], builds: [] });
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export function renderDoctrine(root) {
  cleanupProduce();
  if (DOC === undefined) { // request exactly once — a null result must never re-trigger (render-loop guard)
    DOC = 'pending';
    s3Content('doctrine').then(x => {
      DOC = x;
      if ((location.hash || '').startsWith('#/doctrine')) rerender();
    });
  }
  if (DOC === 'pending') { root.innerHTML = '<div class="panel"><p class="faint">loading the doctrine…</p></div>'; return; }
  if (!DOC || !DOC.subjects?.length) { root.innerHTML = '<div class="panel"><p class="faint">doctrine.s3.json missing — the theory engine is unavailable.</p></div>'; return; }
  const tabs = [...DOC.subjects.map(s => s.id), 'lld', 'hld'];
  if (!tab || !tabs.includes(tab)) tab = tabs[0];
  if (tab === 'lld' || tab === 'hld') return renderDesign(root, tab);
  renderSubject(root, DOC.subjects.find(s => s.id === tab));
}

// last recall per question id
function lastRecall(qid) {
  let last = null;
  for (const r of dd().recalls) if (r.qid === qid && (!last || r.ts > last.ts)) last = r;
  return last;
}
// a question is DUE when: never recalled but its unit was read (unlocked);
// last recall missed and a day has passed (D+1); or passed and 3 days have
// passed (D+3 — the delayed proof).
function dueQa(subj) {
  const t = todayStr();
  return (subj.qa || []).filter(q => {
    const l = lastRecall(q.id);
    if (!l) return dd().read[q.unit] != null;
    if (l.grade !== 'pass') return l.date < t;
    return daysBetween(l.date, t) >= 3;
  });
}
// delayed = there was an earlier-date recall, or the unit was read on an
// earlier date — either way this rep is retrieval across a real delay
function isDelayed(q) {
  const l = lastRecall(q.id);
  const rd = dd().read[q.unit];
  return !!((l && l.date < todayStr()) || (!l && rd && rd < todayStr()));
}

function tabsHtml(active) {
  const stat = s => {
    const read = (s.units || []).filter(u => dd().read[u.id]).length;
    return `${read}/${s.units.length}`;
  };
  return `<div class="cc-tabs">
    ${DOC.subjects.map(s => `<button class="cc-tab ${active === s.id ? 'active' : ''}" data-tab="${esc(s.id)}">${esc(s.name)} <span class="faint">${stat(s)}</span></button>`).join('')}
    <button class="cc-tab ${active === 'lld' ? 'active' : ''}" data-tab="lld">LLD BUILD <span class="faint">${(DOC.design?.lld || []).length}</span></button>
    <button class="cc-tab ${active === 'hld' ? 'active' : ''}" data-tab="hld">HLD BUILD <span class="faint">${(DOC.design?.hld || []).length}</span></button>
  </div>`;
}
function wireTabs(root) {
  root.querySelectorAll('.cc-tab[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; rerender(); }));
}

// ── subject dashboard ─────────────────────────────────────────────────────────
function renderSubject(root, subj) {
  const d = dd();
  const due = dueQa(subj);
  const delayedDue = due.filter(isDelayed);
  const recallsBySubj = d.recalls.filter(r => r.subject === subj.id);

  const unitRow = u => {
    const probed = !!d.probes[u.id];
    const read = !!d.read[u.id];
    const qs = (subj.qa || []).filter(q => q.unit === u.id);
    const passed = qs.filter(q => lastRecall(q.id)?.grade === 'pass').length;
    return `<li style="cursor:pointer" data-unit="${esc(u.id)}">
      <span class="st ${read ? (passed >= Math.min(3, qs.length) ? 'solo' : 'recognized') : ''}">${read ? '✓' : probed ? '~' : '·'}</span>
      <span class="nm">${esc(u.title)}</span>
      <span class="faint" style="margin-left:auto">${probed ? 'probed' : 'probe first'} · ${read ? 'read' : 'unread'} · recall ${passed}/${qs.length}</span></li>`;
  };

  root.innerHTML = `
    <div class="panel"><h2>DOCTRINE — teach first, test second
      <span class="right faint">${d.recalls.length} recalls banked · ${d.recalls.filter(r => r.delayed).length} delayed</span></h2>
      <p class="muted">Shipped, verified theory — you author nothing. Per unit: <b>cold probe → lesson → recall</b>, then it comes back D+1/D+3. Only correct <b>delayed</b> recall moves the theory gate. Misses mint deck cards with the MODEL answer on the back.</p>
      ${tabsHtml(subj.id)}
    </div>
    <div class="cols"><div>
      <div class="panel"><h2>${esc(subj.name)} — units <span class="faint right">click a unit: probe → lesson → recall</span></h2>
        <ul class="probs">${(subj.units || []).map(unitRow).join('')}</ul>
      </div>
    </div><div>
      <div class="panel"><h2 class="${due.length ? 'amber' : 'ok'}">Drill queue — ${due.length} due${delayedDue.length ? ` (${delayedDue.length} delayed)` : ''}</h2>
        ${due.length ? `<p class="muted">Due questions across this subject — misses return tomorrow, passes in 3 days.</p>
          <button class="primary" id="dr-drill">DRILL ${Math.min(due.length, 10)} ▸</button>`
        : '<p class="ok">Nothing due here — read the next unit or switch subjects.</p>'}
        <p class="faint" style="margin-top:8px">recalls so far: ${recallsBySubj.length} · pass rate ${recallsBySubj.length ? Math.round(recallsBySubj.filter(r => r.grade === 'pass').length / recallsBySubj.length * 100) + '%' : '—'}</p>
      </div>
      <div class="panel"><h2>Rapid sheet <span class="faint right">taper-day sweep material</span></h2>
        <p class="muted">Every unit's one-liners, one place — for the Day-10 must-know sweep, not for first learning.</p>
        <button class="ghost" id="dr-rapid">SHOW RAPID FACTS ▸</button>
        <div id="dr-rapidzone" hidden style="margin-top:8px;text-align:left"></div>
      </div>
    </div></div>`;
  wireTabs(root);
  root.querySelectorAll('li[data-unit]').forEach(li => li.addEventListener('click', () => startUnit(root, subj, subj.units.find(u => u.id === li.dataset.unit))));
  root.querySelector('#dr-drill')?.addEventListener('click', () => drillChain(root, subj, due.slice(0, 10), 0));
  root.querySelector('#dr-rapid')?.addEventListener('click', () => {
    const z = root.querySelector('#dr-rapidzone');
    z.hidden = !z.hidden;
    if (!z.hidden) z.innerHTML = (subj.units || []).map(u => `<div class="ftag" style="margin-top:8px">${esc(u.title)}</div>${(u.rapid || []).map(rr => `<div class="vline"><span class="vtag">·</span>${esc(rr)}</div>`).join('')}`).join('');
  });
}

// ── the unit loop: cold probe → lesson → recall 3 ────────────────────────────
function startUnit(root, subj, unit) {
  if (!unit) return;
  if (!dd().probes[unit.id]) return startProbe(root, subj, unit);
  renderLesson(root, subj, unit);
}

function startProbe(root, subj, unit) {
  produceRep(root, {
    item: {
      prompt: `COLD PROBE — ${unit.cold_probe}`,
      problem: unit.title, subject: subj.name,
      hint: 'answer BEFORE reading — this is the baseline; a miss here is the point, not a failure',
      canon: (unit.must_hit || []).map(m => '• ' + m).join('\n'),
      fields: [{ key: 'ans', label: 'YOUR ANSWER (whatever you know right now)', multiline: true, placeholder: '…' }],
      build: v => ({ produce: v.ans, trap: '', pattern: subj.name })
    },
    kind: 'corecs',
    mintOn: () => false, // probes are measurement, never deck cards
    onDone: async (g, card) => {
      dd().probes[unit.id] = { grade: g, text: card?.produce || '', ts: Date.now() };
      await saveDoctrine();
      renderLesson(root, subj, unit);
    }
  });
}

function renderLesson(root, subj, unit) {
  cleanupProduce();
  root.innerHTML = `
    <div class="solve" style="max-width:860px">
      <div class="phaselbl">DOCTRINE · LESSON — ${esc(subj.name)}</div>
      <div class="probname" style="font-size:20px">${esc(unit.title)}</div>
      <div class="panel" style="text-align:left;margin-top:10px">
        <div style="white-space:pre-wrap;line-height:1.55">${esc(unit.brief || '')}</div>
        ${(unit.must_hit || []).length ? `<div class="ailayer"><span class="ailabel">MUST HIT</span>${unit.must_hit.map(m => `<div class="vline"><span class="vtag">▣</span>${esc(m)}</div>`).join('')}</div>` : ''}
        ${(unit.misconceptions || []).length ? `<div class="ailayer"><span class="ailabel">MISCONCEPTIONS</span>${unit.misconceptions.map(m => `<div class="vline"><span class="vtag trap">✗</span>${esc(m)}</div>`).join('')}</div>` : ''}
      </div>
      <div class="actions">
        <button class="primary" id="dr-close">CLOSE THE LESSON → RECALL ▸</button>
        <button class="ghost" id="dr-back">back</button>
      </div>
      <p class="faint">Reading this moved nothing. The recall you're about to do — and the D+1/D+3 returns — move the gate.</p>
    </div>`;
  root.querySelector('#dr-back').addEventListener('click', rerender);
  root.querySelector('#dr-close').addEventListener('click', async () => {
    dd().read[unit.id] = todayStr(); // date string — later recalls count as delayed
    await saveDoctrine();
    const qs = (subj.qa || []).filter(q => q.unit === unit.id).slice(0, 3);
    qs.length ? drillChain(root, subj, qs, 0) : rerender();
  });
}

// ── the drill chain: shipped Q&A through the produce cockpit ─────────────────
function drillChain(root, subj, list, i) {
  if (i >= list.length) { rerender(); return; }
  const q = list[i];
  const sql = q.type === 'sql';
  const delayed = isDelayed(q);
  produceRep(root, {
    item: {
      prompt: `${delayed ? '◆ DELAYED · ' : ''}[${i + 1}/${list.length}] ${q.q}`,
      problem: q.q.slice(0, 90), subject: subj.name,
      canon: q.a, checklist: q.must_hit || [], contentId: q.id,
      fields: sql
        ? [{ key: 'ans', label: 'WRITE THE QUERY', sql: true, placeholder: 'SELECT …' }]
        : [{ key: 'ans', label: 'YOUR ANSWER — the 2-minute version, from blank', multiline: true, placeholder: '…' }],
      build: v => ({ produce: v.ans, trap: '', pattern: subj.name })
    },
    kind: 'corecs',
    mintOn: g => g !== 'pass', // the deck holds exactly the misses
    onDone: async g => {
      dd().recalls.push({ qid: q.id, subject: subj.id, unit: q.unit, grade: g, delayed, date: todayStr(), ts: Date.now() });
      await saveDoctrine();
      drillChain(root, subj, list, i + 1);
    }
  });
}

// ── LLD / HLD BUILD mode ─────────────────────────────────────────────────────
function renderDesign(root, kind) {
  const mods = DOC.design?.[kind] || [];
  const d = dd();
  const built = id => d.builds.filter(b => b.moduleId === id);
  root.innerHTML = `
    <div class="panel"><h2>DOCTRINE — ${kind.toUpperCase()} BUILD mode
      <span class="right faint">${d.builds.filter(b => b.kind === kind && b.cold).length} cold builds banked</span></h2>
      <p class="muted">Worked design → <b>COLD blank build</b> (graded) → the interviewer's change request → failure injection. The design gate counts <b>cold</b> builds only — study first if you must, but the cold build is the evidence. Sprint minimum: 2 cold LLD + 1 cold HLD.</p>
      ${tabsHtml(kind)}
    </div>
    ${mods.map(m => {
      const bs = built(m.id);
      const cold = bs.filter(b => b.cold);
      const studiedNow = sessionStorage.getItem('p435.doctrine.studied.' + m.id) === todayStr();
      return `<div class="panel">
        <h2>${esc(m.title)} <span class="right ${cold.length ? 'ok' : 'faint'}">${cold.length ? `cold ✓ ${cold.map(b => b.grade === 'pass' ? '✓' : b.grade === 'partial' ? '~' : '✗').join(' ')}` : 'not built cold yet'}</span></h2>
        <div class="actions" style="justify-content:flex-start">
          <button class="ghost" data-study="${esc(m.id)}">STUDY the worked design</button>
          <button class="primary" data-build="${esc(m.id)}">${studiedNow ? 'BUILD (warm — studied today)' : 'COLD BUILD ▸'}</button>
        </div>
        <div id="dsg-${esc(m.id)}" hidden style="margin-top:10px;text-align:left"></div>
      </div>`;
    }).join('')}`;
  wireTabs(root);
  root.querySelectorAll('button[data-study]').forEach(b => b.addEventListener('click', () => {
    const m = mods.find(x => x.id === b.dataset.study);
    const z = root.querySelector(`#dsg-${CSS.escape(m.id)}`);
    sessionStorage.setItem('p435.doctrine.studied.' + m.id, todayStr()); // an honest cold flag needs an honest warm flag
    z.hidden = !z.hidden;
    if (!z.hidden) z.innerHTML = `<div style="white-space:pre-wrap;line-height:1.5">${esc(m.worked || '')}</div>
      ${(m.tradeoffs || []).length ? `<div class="ailayer"><span class="ailabel">TRADEOFFS</span>${m.tradeoffs.map(t => `<div class="vline"><span class="vtag">▣</span>${esc(t)}</div>`).join('')}</div>` : ''}`;
  }));
  root.querySelectorAll('button[data-build]').forEach(b => b.addEventListener('click', () => startBuild(root, kind, mods.find(x => x.id === b.dataset.build))));
}

function startBuild(root, kind, m) {
  if (!m) return;
  const cold = sessionStorage.getItem('p435.doctrine.studied.' + m.id) !== todayStr();
  produceRep(root, {
    item: {
      prompt: `${cold ? 'COLD BUILD' : 'BUILD (warm)'} — ${m.cold_prompt || m.title}`,
      problem: m.title, subject: kind.toUpperCase(),
      hint: kind === 'hld' ? 'requirements → estimation WITH arithmetic → API → data model → components → deep dive → bottlenecks' : 'requirements → entities/classes → relationships → patterns (name them) → core flow → concurrency',
      canon: m.worked || '', checklist: m.tradeoffs || [], contentId: m.id,
      fields: [{ key: 'ans', label: 'THE FULL DESIGN — from blank', multiline: true, placeholder: '…' }],
      build: v => ({ produce: v.ans, trap: '', pattern: kind.toUpperCase() })
    },
    kind: 'sysd',
    mintOn: g => g !== 'pass',
    onDone: async (g, card) => {
      // stage 2: the interviewer moves the goalposts — answer both, then bank
      renderCurveballs(root, kind, m, g, card?.produce || '', cold);
    }
  });
}

function renderCurveballs(root, kind, m, grade, designText, cold) {
  cleanupProduce();
  root.innerHTML = `
    <div class="solve" style="max-width:820px">
      <div class="phaselbl">DOCTRINE · ${kind.toUpperCase()} — the interviewer pushes back</div>
      <div class="probname" style="font-size:20px">${esc(m.title)}</div>
      <div class="recogform panel" style="text-align:left">
        <label>CHANGE REQUEST — ${esc(m.change_request || 'requirements just changed; adapt the design')}</label>
        <textarea id="dsg-chg" rows="3" placeholder="what changes, what survives…"></textarea>
        <label style="margin-top:10px">FAILURE INJECTION — ${esc(m.failure_injection || 'a core component just died; now what?')}</label>
        <textarea id="dsg-fail" rows="3" placeholder="detection, degradation, recovery…"></textarea>
        <div class="actions" style="margin-top:12px">
          <button class="primary" id="dsg-done">BANK THE BUILD ▸</button>
        </div>
      </div>
    </div>`;
  root.querySelector('#dsg-done').addEventListener('click', async () => {
    dd().builds.push({
      id: crypto.randomUUID(), kind, moduleId: m.id, title: m.title, cold, grade,
      design: designText, change: root.querySelector('#dsg-chg').value.trim(),
      failure: root.querySelector('#dsg-fail').value.trim(), date: todayStr(), ts: Date.now()
    });
    await saveDoctrine();
    rerender();
  });
}
