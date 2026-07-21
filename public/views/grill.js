// SEASON 3 — GRILL ROOM (#/grill): project defense as an evidence system.
// Three shipped dossiers (grill.s3.json): claim→evidence→limitation→counter→
// stance ledger, 30s/2min/10min pitches, deep READ, drilled Q&A (produce
// cockpit, miss-minted `project` cards), WHITEBOARD derivations, LANDMINES
// (the dangerous questions with honest answers — facts + limitation + fix,
// never a rehearsed heroic story), and a MOCK GRILL where the keyless Coach
// (claude -p) plays a Socratic adversarial interviewer over the dossier.
// The OWNERSHIP matrix stays BLANK until HE fills it — the app never invents
// his contribution. Off-sheet, additive — data/grill.json only.
import { App, esc, todayStr, saveGrill, rerender, s3Content } from '../app.js';
import { produceRep, cleanupProduce } from '../produce.js';

let DOC; // grill.s3.json: undefined = not requested, 'pending' = fetching, null = missing, object = loaded
let proj = null;         // active project id
let mode = 'read';       // read | claims | drill | board | mines | mock | own

export function cleanupGrill() { cleanupProduce(); }

const dd = () => (App.state.grill ||= { ownership: {}, drilled: [], whiteboard: {}, landmines: {}, pitches: {}, mocks: [] });

// pre-interview repo hygiene — READ-ONLY suggestions, written by you in your
// dossier's optional "fixlist" array. Touching the repos is out of scope for
// this app (separate decision, separate approval).
const fixlistFor = p => p?.fixlist || [];

export function renderGrill(root) {
  cleanupProduce();
  if (DOC === undefined) { // request exactly once — a null result must never re-trigger (render-loop guard)
    DOC = 'pending';
    s3Content('grill').then(x => {
      DOC = x;
      if ((location.hash || '').startsWith('#/grill')) rerender();
    });
  }
  if (DOC === 'pending') { root.innerHTML = '<div class="panel"><p class="faint">loading the dossiers…</p></div>'; return; }
  if (!DOC) { root.innerHTML = '<div class="panel"><p class="faint">No dossiers yet. Copy grill.example.json to grill.s3.json and describe your own projects — see the README.</p></div>'; return; }
  const projects = DOC.projects || [];
  if (!projects.length) { root.innerHTML = '<div class="panel"><p class="faint">No dossiers yet. Copy grill.example.json to grill.s3.json and describe your own projects — see the README.</p></div>'; return; }
  if (!proj || !projects.some(p => p.id === proj)) proj = projects[0].id;
  paint(root, projects.find(p => p.id === proj));
}

function progressChip(p) {
  const d = dd();
  const answered = d.drilled.filter(x => x.project === p.id).length;
  const pitched = !!(d.pitches[p.id]?.s30 && d.pitches[p.id]?.m2);
  const wb = Object.keys(d.whiteboard).filter(k => k.startsWith(p.id + '-')).length;
  const lm = Object.keys(d.landmines).filter(k => k.startsWith(p.id + '-')).length;
  const ok = pitched && answered >= 10 && wb >= 1 && lm >= 3;
  return { answered, pitched, wb, lm, ok };
}

function paint(root, p) {
  const d = dd();
  const pr = progressChip(p);
  const modes = [['read', 'READ'], ['claims', 'CLAIMS'], ['drill', `DRILL ${d.drilled.filter(x => x.project === p.id).length}/${(p.qa || []).length}`],
    ['board', `WHITEBOARD ${pr.wb}/${(p.whiteboard || []).length}`], ['mines', `LANDMINES ${pr.lm}/${(p.landmines || []).length}`],
    ['mock', 'MOCK GRILL'], ['own', 'OWNERSHIP']];
  root.innerHTML = `
    <div class="panel"><h2>GRILL ROOM — know everything about your own work
      <span class="right ${pr.ok ? 'ok' : 'faint'}">${pr.ok ? 'dossier gate cleared ✓' : `gate: pitches ${pr.pitched ? '✓' : '✗'} · ${pr.answered}/10 answers · ${pr.wb}/1 whiteboard · ${pr.lm}/3 landmines`}</span></h2>
      <div class="cc-tabs">${(DOC.projects || []).map(x => {
        const c = progressChip(x);
        return `<button class="cc-tab ${x.id === proj ? 'active' : ''}" data-proj="${esc(x.id)}">${esc(x.name)} ${c.ok ? '<span class="ok">✓</span>' : ''}</button>`;
      }).join('')}</div>
      <div class="cc-tabs" style="margin-top:6px">${modes.map(([k, label]) => `<button class="cc-tab ${mode === k ? 'active' : ''}" data-mode="${k}">${esc(label)}</button>`).join('')}</div>
    </div>
    <div id="grill-body"></div>`;
  root.querySelectorAll('button[data-proj]').forEach(b => b.addEventListener('click', () => { proj = b.dataset.proj; mode = 'read'; rerender(); }));
  root.querySelectorAll('button[data-mode]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; rerender(); }));
  const body = root.querySelector('#grill-body');
  ({ read: paintRead, claims: paintClaims, drill: paintDrill, board: paintBoard, mines: paintMines, mock: paintMock, own: paintOwn })[mode](body, p);
}

// ── READ: pitches + the dossier sections + the fix-list ─────────────────────
function paintRead(body, p) {
  const mine = dd().pitches[p.id] || {};
  body.innerHTML = `
    <div class="cols"><div>
      <div class="panel"><h2>Pitches <span class="faint right">say them OUT LOUD, on a timer</span></h2>
        <div class="ftag">30-SECOND (reference)</div><p style="white-space:pre-wrap">${esc(p.pitches?.s30 || '')}</p>
        <div class="ftag" style="margin-top:8px">2-MINUTE (reference)</div><p style="white-space:pre-wrap">${esc(p.pitches?.m2 || '')}</p>
        <div class="ftag" style="margin-top:8px">10-MINUTE WALKTHROUGH (outline)</div><p style="white-space:pre-wrap">${esc(p.pitches?.m10 || '')}</p>
        <div class="ailayer"><span class="ailabel">YOUR VERSIONS — the gate needs both</span>
          <label style="display:block;margin-top:6px">your 30-second pitch (your words, not the reference)</label>
          <textarea id="gp-s30" rows="2">${esc(mine.s30 || '')}</textarea>
          <label style="display:block;margin-top:6px">your 2-minute pitch</label>
          <textarea id="gp-m2" rows="4">${esc(mine.m2 || '')}</textarea>
          <button class="primary" id="gp-save" style="margin-top:8px">SAVE PITCHES ▸</button>
        </div>
      </div>
      ${fixlistFor(p).length ? `<div class="panel"><h2>Repo fix-list <span class="faint right">read-only suggestions — your call, outside this app</span></h2>
        <ul class="proto">${fixlistFor(p).map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
    </div><div>
      ${(p.read || []).map(s => `<div class="panel"><h2>${esc(s.h)}</h2><p style="white-space:pre-wrap;line-height:1.5">${esc(s.body)}</p></div>`).join('')}
    </div></div>`;
  body.querySelector('#gp-save').addEventListener('click', async () => {
    dd().pitches[p.id] = { s30: body.querySelector('#gp-s30').value.trim(), m2: body.querySelector('#gp-m2').value.trim(), ts: Date.now() };
    await saveGrill();
    rerender();
  });
}

// ── CLAIMS: the claim-evidence ledger ────────────────────────────────────────
const STANCE = { defend: 'ok', qualify: 'amber', concede: 'amber', correct: 'danger' };
function paintClaims(body, p) {
  body.innerHTML = `
    <div class="panel"><h2>Claim → evidence ledger <span class="faint right">every claim carries its limitation and its counter</span></h2>
      <p class="muted">In the room: state the claim in the safe wording, know exactly where the evidence lives, concede the limitation BEFORE they find it.</p></div>
    ${(p.claims || []).map(c => `<div class="panel">
      <div class="vline"><span class="vtag">▣</span><b>${esc(c.claim)}</b> <span class="sd-chip ${STANCE[c.stance] || ''}" style="margin-left:8px">${esc(c.stance)}</span></div>
      <div class="vline"><span class="vtag">⚑</span>evidence: ${esc(c.evidence)}</div>
      <div class="vline"><span class="vtag trap">✗</span>limitation: ${esc(c.limitation)}</div>
      <div class="vline"><span class="vtag">?</span>strongest counter: ${esc(c.counter)}</div>
      <div class="ailayer"><span class="ailabel">SAFE WORDING</span><div class="vline">${esc(c.wording)}</div></div>
    </div>`).join('')}`;
}

// ── DRILL: the grilled Q&A through the produce cockpit ──────────────────────
function paintDrill(body, p) {
  const d = dd();
  const last = new Map();
  for (const x of d.drilled) if (x.project === p.id && (!last.has(x.qid) || x.ts > last.get(x.qid).ts)) last.set(x.qid, x);
  const qa = p.qa || [];
  const fresh = qa.filter(q => !last.has(q.id));
  const missed = qa.filter(q => last.get(q.id) && last.get(q.id).grade !== 'pass');
  const queue = [...missed, ...fresh];
  body.innerHTML = `
    <div class="panel"><h2>Drill — ${qa.length} grounded questions
      <span class="right faint">${last.size} attempted · ${missed.length} to redeem</span></h2>
      <p class="muted">Answer from blank, out loud, THEN reveal the grounded answer. Misses mint deck cards and come back. 10 clean answers clear this dossier's drill bar.</p>
      ${queue.length ? `<button class="primary" id="gd-go">DRILL ${Math.min(queue.length, 8)} ▸</button>` : '<p class="ok">every question attempted and clean ✓</p>'}
    </div>
    <div class="panel"><h2>The questions <span class="faint right">retrospective grades</span></h2>
      <ul class="probs">${qa.map(q => {
        const l = last.get(q.id);
        return `<li style="cursor:default"><span class="st ${l ? (l.grade === 'pass' ? 'solo' : l.grade === 'partial' ? 'recognized' : 'abandoned') : ''}">${l ? (l.grade === 'pass' ? '✓' : l.grade === 'partial' ? '~' : '✗') : '·'}</span>
          <span class="nm">${esc(q.q)}</span></li>`;
      }).join('')}</ul></div>`;
  body.querySelector('#gd-go')?.addEventListener('click', () => drillChain(body, p, queue.slice(0, 8), 0));
}

function drillChain(body, p, list, i) {
  if (i >= list.length) { rerender(); return; }
  const q = list[i];
  produceRep(body, {
    item: {
      prompt: `[${i + 1}/${list.length}] ${q.q}`,
      problem: q.q.slice(0, 90), subject: p.name,
      canon: q.a, contentId: q.id,
      fields: [{ key: 'ans', label: 'YOUR ANSWER — as you\'d say it in the room', multiline: true, placeholder: '…' }],
      build: v => ({ produce: v.ans, trap: '', pattern: p.name })
    },
    kind: 'project',
    mintOn: g => g !== 'pass',
    onDone: async g => {
      dd().drilled.push({ project: p.id, qid: q.id, grade: g, date: todayStr(), ts: Date.now() });
      await saveGrill();
      drillChain(body, p, list, i + 1);
    }
  });
}

// ── WHITEBOARD: the derivations done unaided ─────────────────────────────────
function paintBoard(body, p) {
  const d = dd();
  body.innerHTML = `
    <div class="panel"><h2>Whiteboard — do each UNAIDED, then check
      <span class="right faint">pen and paper first; the reveal is for checking, not learning</span></h2></div>
    ${(p.whiteboard || []).map(w => {
      const st = d.whiteboard[w.id];
      return `<div class="panel">
        <h2>${esc(w.title)} <span class="right ${st ? (st.grade === 'pass' ? 'ok' : 'amber') : 'faint'}">${st ? (st.grade === 'pass' ? 'did it cold ✓' : 'needed the answer') : 'not attempted'}</span></h2>
        <details><summary class="faint" style="cursor:pointer">reveal the worked answer (after your attempt)</summary>
          <div style="white-space:pre-wrap;margin-top:8px;line-height:1.5">${esc(w.answer)}</div></details>
        <div class="actions" style="justify-content:flex-start;margin-top:8px">
          <button class="good" data-wb="${esc(w.id)}" data-g="pass">did it cold ✓</button>
          <button class="warn" data-wb="${esc(w.id)}" data-g="fail">needed the answer ✗</button>
        </div>
      </div>`;
    }).join('')}`;
  body.querySelectorAll('button[data-wb]').forEach(b => b.addEventListener('click', async () => {
    dd().whiteboard[b.dataset.wb] = { grade: b.dataset.g, ts: Date.now() };
    await saveGrill();
    rerender();
  }));
}

// ── LANDMINES: the dangerous questions, honestly rehearsed ───────────────────
function paintMines(body, p) {
  const d = dd();
  body.innerHTML = `
    <div class="panel"><h2 class="danger">Landmines — they WILL find these
      <span class="right faint">facts + limitation + what you'd do differently. never a rehearsed hero story.</span></h2></div>
    ${(p.landmines || []).map(l => {
      const done = d.landmines[l.id];
      return `<div class="panel">
        <div class="vline"><span class="vtag trap">☠</span><b>${esc(l.q)}</b></div>
        <div class="vline faint"><span class="vtag">!</span>why it's dangerous: ${esc(l.why)}</div>
        <details><summary class="faint" style="cursor:pointer">the honest answer — say YOUR version out loud first</summary>
          <div class="ailayer" style="margin-top:6px"><span class="ailabel">HONEST ANSWER</span><div class="vline" style="white-space:pre-wrap">${esc(l.answer)}</div></div></details>
        <button class="${done ? 'good' : 'ghost'}" data-lm="${esc(l.id)}" style="margin-top:8px">${done ? 'rehearsed ✓ (again)' : 'rehearsed OUT LOUD ✓'}</button>
      </div>`;
    }).join('')}`;
  body.querySelectorAll('button[data-lm]').forEach(b => b.addEventListener('click', async () => {
    dd().landmines[b.dataset.lm] = { ts: Date.now() };
    await saveGrill();
    rerender();
  }));
}

// ── MOCK GRILL: the Coach as the adversarial interviewer ────────────────────
function paintMock(body, p) {
  body.innerHTML = `
    <div class="panel"><h2>Mock grill — the interviewer knows your dossier
      <span class="right"><label class="faint" style="cursor:pointer"><input type="checkbox" id="gm-hard"> hard mode</label></span></h2>
      <p class="muted">Socratic, adversarial, one question at a time, presses the weakest thing you say. Transcript persists per project. Answer OUT LOUD, then type what you said.</p>
      <div id="gm-log" class="gm-log"><p class="faint">loading transcript…</p></div>
      <div class="ladder-add" style="margin-top:10px">
        <input id="gm-in" type="text" autocomplete="off" placeholder="your answer — or 'Begin the grill.'">
        <button id="gm-send" class="primary">SEND ▸</button>
      </div>
    </div>`;
  const log = body.querySelector('#gm-log');
  const paintLog = t => {
    log.innerHTML = t.length ? t.map(m => `<div class="vline" style="margin:6px 0"><span class="vtag">${m.role === 'grill' ? '⟁' : '›'}</span><span style="white-space:pre-wrap">${m.role === 'grill' ? '<b>Interviewer:</b> ' : ''}${esc(m.content)}</span></div>`).join('')
      : '<p class="faint">no exchanges yet — send "Begin the grill." and it opens on your hardest territory.</p>';
    log.scrollTop = log.scrollHeight;
  };
  fetch(`/api/grill/coach?project=${encodeURIComponent(p.id)}`).then(r => r.json())
    .then(x => paintLog(x.transcript || [])).catch(() => { log.innerHTML = '<p class="faint">transcript unavailable.</p>'; });
  const send = async () => {
    const inp = body.querySelector('#gm-in');
    const msg = inp.value.trim();
    if (!msg) return;
    inp.value = '';
    log.insertAdjacentHTML('beforeend', `<div class="vline"><span class="vtag">›</span>${esc(msg)}</div><div class="vline faint" id="gm-wait"><span class="vtag">⟁</span>thinking…</div>`);
    log.scrollTop = log.scrollHeight;
    try {
      const r = await fetch('/api/grill/coach', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: p.id, message: msg, hard: body.querySelector('#gm-hard').checked })
      }).then(x => x.json());
      if (r.error) throw new Error(r.error);
      paintLog(r.transcript || []);
      const d = dd();
      d.mocks.push({ project: p.id, ts: Date.now() });
      await saveGrill();
    } catch (e) {
      body.querySelector('#gm-wait')?.remove();
      log.insertAdjacentHTML('beforeend', `<p class="danger">interviewer offline (${esc(e.message)}) — drill the landmines list instead.</p>`);
    }
  };
  body.querySelector('#gm-send').addEventListener('click', send);
  body.querySelector('#gm-in').addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  body.querySelector('#gm-in').focus();
}

// ── OWNERSHIP: blank until HE fills it ───────────────────────────────────────
function paintOwn(body, p) {
  const mine = dd().ownership[p.id]?.answers || {};
  const prompts = p.ownership_prompts || [];
  body.innerHTML = `
    <div class="panel"><h2>Ownership matrix — YOUR truth, in YOUR words
      <span class="right faint">the app never invents your contribution</span></h2>
      <p class="muted">"What did YOU personally do?" opens most project rounds — and vague answers sink them. Write the specific, truthful version once: files, decisions, numbers. This stays blank until you fill it.</p>
      ${prompts.map((q, i) => `
        <label style="display:block;margin-top:10px">${esc(q)}</label>
        <textarea data-own="${i}" rows="2" placeholder="specific and truthful — files, decisions, numbers…">${esc(mine[i] || '')}</textarea>`).join('')}
      <button class="primary" id="go-save" style="margin-top:10px">SAVE OWNERSHIP ▸</button>
    </div>`;
  body.querySelector('#go-save').addEventListener('click', async () => {
    const answers = {};
    body.querySelectorAll('textarea[data-own]').forEach(t => { if (t.value.trim()) answers[t.dataset.own] = t.value.trim(); });
    dd().ownership[p.id] = { answers, ts: Date.now() };
    await saveGrill();
    rerender();
  });
}
