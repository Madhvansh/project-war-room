// SEASON 2 Wave 8 — multi-round live mock interview (#/interview). A full sim:
// first-5-minutes clarifying → DSA think-out-loud → LLD machine-coding → core-CS
// rapid-fire → behavioral STAR. Each round forces a typed/spoken ARTICULATION (the
// whole point — interviews are won thinking aloud under pressure), and the keyless
// Coach (claude -p, §6) plays a Socratic interviewer that pushes the weakest
// decision — never a full solution. Sessions in data/interviews.json. Off-sheet.
import { App, esc, todayStr, mmss, saveInterviews, rerender, campaignOn, campaignEntry } from '../app.js';
import { chime, success } from '../audio.js';

let timerId = null, keyHandler = null;
export function cleanupInterview() { if (timerId) clearInterval(timerId); timerId = null; if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = null; }

const active = () => { const a = App.state.interviews; const last = a[a.length - 1]; return last && !last.finished ? last : null; };

function pickDsaProblem() {
  const flagged = App.state.log.filter(r => r.flag).map(r => r.problem);
  if (flagged.length) return flagged[flagged.length - 1];
  const entry = campaignOn() ? campaignEntry() : null;
  return entry?.tierA?.[0] || 'Maximum Subarray (Kadane)';
}
function buildRounds() {
  const lld = (App.s2?.sysd?.lld?.machine_coding || ['Parking Lot'])[0];
  const cc = (App.s2?.corecs?.subjects?.OS || ['process vs thread', 'deadlock', 'paging']).slice(0, 3).map(t => t.replace(/\s*\[SQL\].*/i, ''));
  const dsa = pickDsaProblem();
  return [
    { kind: 'clarify', label: 'First 5 minutes — clarify', minutes: 5, prompt: `Before solving "${dsa}", list the questions YOU ask first: inputs, constraints, edge cases, output format, scale. The opening 5 minutes silently decides most rounds.` },
    { kind: 'dsa', label: 'DSA — think out loud', minutes: 35, prompt: `Solve OUT LOUD: ${dsa}. Narrate brute → optimal, dry-run a small example, state time + space unprompted.` },
    { kind: 'lld', label: 'LLD — machine coding', minutes: 30, prompt: `Design ${lld}: nouns → classes, relationships (has-a / is-a), NAME the patterns as you apply them, one concurrency hazard + where the lock goes.` },
    { kind: 'corecs', label: 'Core-CS rapid-fire', minutes: 10, prompt: `Produce (definition → concrete example → one tradeoff) for: ${cc.join(' · ')}.` },
    { kind: 'behavioral', label: 'Behavioral — STAR', minutes: 10, prompt: `STAR story: a time you handled conflict or ambiguity. Situation · Task · Action · Result — quantify the result.` }
  ].map(r => ({ ...r, articulation: '', coachTurns: 0, self: null }));
}

export function renderInterview(root) {
  cleanupInterview();
  const m = active();
  if (!m) return renderLobby(root);
  if (m.curRound >= m.rounds.length) return renderSummary(root, m);
  return renderRound(root, m);
}

function renderLobby(root) {
  const past = App.state.interviews.filter(m => m.finished).slice().reverse();
  root.innerHTML = `
    <div class="panel"><h2>Mock interview — 5 rounds · ~90 min · think out loud</h2>
      <p class="muted">The closest rehearsal to the real thing: clarify → DSA → LLD → core-CS → behavioral. Every round forces you to articulate, and the Coach pushes Socratically — it never hands you the answer. Talk to the screen as if the interviewer is there.</p>
      <div class="actions" style="justify-content:flex-start;margin-top:12px"><button class="primary" id="iv-start">START THE INTERVIEW ▸</button></div>
    </div>
    ${past.length ? `<div class="panel"><h2>Past interviews</h2><ul class="probs">${past.map(m => {
      const strong = m.rounds.filter(r => r.self === 'strong').length;
      return `<li style="cursor:default"><span class="st ${strong >= 3 ? 'ok' : 'amber'}">${strong}/${m.rounds.length}</span><span class="nm">${new Date(m.ts).toLocaleDateString()} — ${m.rounds.map(r => esc(r.label.split(' ')[0])).join(' · ')}</span><span class="faint" style="margin-left:auto">${m.usedMin ?? '—'}m</span></li>`;
    }).join('')}</ul></div>` : ''}`;
  root.querySelector('#iv-start').addEventListener('click', async () => {
    App.state.interviews.push({ id: crypto.randomUUID(), ts: Date.now(), rounds: buildRounds(), curRound: 0, roundStartTs: Date.now(), startTs: Date.now(), finished: false, usedMin: null });
    await saveInterviews(); rerender();
  });
}

function renderRound(root, m) {
  const r = m.rounds[m.curRound];
  if (!m.roundStartTs) { m.roundStartTs = Date.now(); }
  root.innerHTML = `<div class="solve" style="max-width:900px">
    <div class="phaselbl">ROUND ${m.curRound + 1}/${m.rounds.length} · ${esc(r.label)}</div>
    <div class="bigclock" id="iv-clock">--:--</div>
    <div class="probname" style="font-size:18px;text-align:left;max-width:760px;margin:6px auto">${esc(r.prompt)}</div>
    <div class="recogform panel" style="text-align:left;max-width:760px">
      <label>ARTICULATE — type what you'd SAY out loud (approach · complexity · trade-offs)</label>
      <textarea id="iv-art" rows="5" placeholder="Talk through it as if the interviewer is listening…">${esc(r.articulation || '')}</textarea>
      <div class="actions" style="margin-top:10px">
        <button class="ghost" id="iv-coach">⟁ Coach: push me</button>
        <button class="primary" id="iv-next">${m.curRound < m.rounds.length - 1 ? 'NEXT ROUND ▸' : 'FINISH ▸'}</button>
      </div>
      <div id="iv-coachzone" style="margin-top:10px"></div>
      <label style="margin-top:12px">SELF-RATING</label>
      <div class="actions" id="iv-self">${['strong', 'ok', 'weak'].map(s => `<button class="ghost ${r.self === s ? 'sel' : ''}" data-self="${s}">${s}</button>`).join('')}</div>
    </div></div>`;
  let chimed = false;
  const tick = () => {
    const remain = r.minutes - (Date.now() - m.roundStartTs) / 60000 * (App.speed || 1);
    const bc = root.querySelector('#iv-clock'); if (!bc) return;
    bc.textContent = remain > 0 ? mmss(remain * 60) : 'TIME'; bc.classList.toggle('late', remain <= 1);
    if (remain <= 0 && !chimed) { chimed = true; chime(); }
  };
  timerId = setInterval(tick, 300); tick();
  const saveArt = () => { r.articulation = root.querySelector('#iv-art').value; };
  root.querySelectorAll('#iv-self button').forEach(b => b.addEventListener('click', () => {
    r.self = b.dataset.self; root.querySelectorAll('#iv-self button').forEach(x => x.classList.toggle('sel', x === b)); saveInterviews();
  }));
  root.querySelector('#iv-coach').addEventListener('click', async e => {
    saveArt(); const zone = root.querySelector('#iv-coachzone');
    e.target.disabled = true; zone.innerHTML = '<p class="faint">⟁ Coach is pushing…</p>';
    try {
      const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: `Interview ${r.label}`, message: `Be a Socratic interviewer. Push on the WEAKEST part of my answer below with ONE sharp question — do NOT give a solution.\n\nPrompt: ${r.prompt}\n\nMy answer: ${r.articulation || '(blank so far)'}`, level: 1, context: {} }) }).then(x => x.json());
      if (res.error) throw new Error(res.error);
      r.coachTurns = (r.coachTurns || 0) + 1;
      zone.innerHTML = `<div class="ailayer"><span class="ailabel">INTERVIEWER</span><div class="vline" style="white-space:pre-wrap">${esc(res.reply)}</div></div>`;
      await saveInterviews();
    } catch (err) { zone.innerHTML = `<p class="danger">Coach offline (${esc(err.message)}) — keep going; self-rate honestly.</p>`; }
    finally { e.target.disabled = false; }
  });
  root.querySelector('#iv-next').addEventListener('click', async () => {
    saveArt(); m.curRound++; m.roundStartTs = Date.now();
    // NOTE: do NOT set finished here — leave the session "active" so renderInterview
    // routes curRound>=length to renderSummary. finished is set on the summary's DONE,
    // so the recap (self-ratings, coach pushes, articulations) is actually shown.
    if (m.curRound >= m.rounds.length) m.usedMin = Math.round((Date.now() - m.startTs) / 60000);
    await saveInterviews(); success(); rerender();
  });
  keyHandler = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) root.querySelector('#iv-next').click(); };
  window.addEventListener('keydown', keyHandler);
}

function renderSummary(root, m) {
  cleanupInterview();
  const strong = m.rounds.filter(r => r.self === 'strong').length;
  root.innerHTML = `<div class="solve" style="max-width:900px"><div class="phaselbl">INTERVIEW COMPLETE</div>
    <div class="bigclock" style="font-size:56px"><span class="${strong >= 3 ? 'ok' : 'amber'}">${strong}</span>/${m.rounds.length} <span class="faint" style="font-size:22px">strong · ${m.usedMin}m</span></div>
    <div style="text-align:left;margin-top:14px">${m.rounds.map(r => `<div class="panel">
      <div style="display:flex;gap:10px;align-items:center"><span class="st ${r.self === 'strong' ? 'solo' : r.self === 'weak' ? 'abandoned' : 'amber'}" style="width:20px">${r.self === 'strong' ? '✓' : r.self === 'weak' ? '✗' : '~'}</span>
        <b>${esc(r.label)}</b><span class="faint" style="margin-left:auto">${r.coachTurns || 0} coach push${r.coachTurns === 1 ? '' : 'es'}</span></div>
      ${r.articulation ? `<div class="sd-art-body">${esc(r.articulation.slice(0, 220))}${r.articulation.length > 220 ? '…' : ''}</div>` : ''}</div>`).join('')}</div>
    <p class="muted" style="margin-top:8px">Re-watch your own articulations — the rambles and silences you can't feel in the moment are right here.</p>
    <div class="actions"><button class="primary" id="iv-done">DONE ▸</button> <a href="#/command"><button>command center</button></a></div></div>`;
  root.querySelector('#iv-done').addEventListener('click', async () => { m.finished = true; await saveInterviews(); location.hash = '#/command'; });
}
