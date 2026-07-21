// SEASON 2 Wave 7 — RecallArena core-CS (#/corecs). The supporting act done
// RIGHT: produce OS/DBMS/CN/OOP answers from blank, never half-recognize them.
// Priority OS≈DBMS→CN→OOP (curriculum.s2.json). Every rep uses the definition →
// example → tradeoff 3-beat (the shape that scores in theory rounds) and banks a
// card into the unified durability deck. SQL topics get a write-the-query box.
// The full Q&A lives in the external RecallArena app; this is the produce-from-
// blank + spaced-repetition companion. Off-sheet — never touches log.json.
import {
  App, Laws, esc, todayStr, displayDayN, saveCorecs, rerender,
  campaignOn, campaignEntry, appendCard, saveReviews
} from '../app.js';
import { produceRep, cleanupProduce } from '../produce.js';

export function cleanupCorecs() { cleanupProduce(); }

const cat = () => App.s2?.corecs;
const subjectsList = () => {
  const c = cat(); if (!c) return [];
  return (c.priority || Object.keys(c.subjects || {})).filter(s => c.subjects?.[s]);
};
const keyOf = (subj, topic) => `${subj}::${topic}`;
const isSql = t => /\[SQL\]/i.test(t);
const cleanTopic = t => t.replace(/\s*\[SQL\]\s*/i, '').replace(/\s*—\s*WRITE them/i, '').trim();

let activeSubject = null;

export function renderCorecs(root) {
  cleanupProduce();
  if (!cat()) { root.innerHTML = '<div class="panel"><p class="faint">curriculum.s2.json not loaded — core-CS catalog unavailable.</p></div>'; return; }
  const subs = subjectsList();
  if (!activeSubject || !subs.includes(activeSubject)) activeSubject = subs[0];
  renderDash(root, subs);
}

function progressOf(subj) {
  const topics = cat().subjects[subj] || [];
  const done = App.state.corecs?.done || {};
  return { done: topics.filter(t => done[keyOf(subj, t)]).length, total: topics.length };
}

function renderDash(root, subs) {
  const done = App.state.corecs?.done || {};
  const topics = cat().subjects[activeSubject] || [];
  const nextTopic = topics.find(t => !done[keyOf(activeSubject, t)]);

  root.innerHTML = `
    <div class="panel"><h2>Core CS — produce, don't recognize <span class="right faint">OS ≈ DBMS → CN → OOP</span></h2>
      <p class="muted">Read the topic, <b>produce the answer from blank</b> (definition → example → tradeoff), then grade honestly. SQL gets a write-the-query box. Every rep banks a card into the durability deck. Full Q&A: <a href="https://recallarena.netlify.app/#/" target="_blank" rel="noopener">RecallArena ↗</a>.</p>
      <div class="cc-tabs">${subs.map(s => { const p = progressOf(s); return `<button class="cc-tab ${s === activeSubject ? 'active' : ''}" data-sub="${esc(s)}">${esc(s)} <span class="faint">${p.done}/${p.total}</span></button>`; }).join('')}</div>
    </div>
    <div class="cols"><div>
      <div class="panel"><h2>${esc(activeSubject)} — ${nextTopic ? 'next up' : 'all produced ✓'}</h2>
        ${nextTopic ? `<div class="cc-next"><div class="cc-topic">${esc(cleanTopic(nextTopic))}${isSql(nextTopic) ? ' <span class="cyan">[SQL]</span>' : ''}</div>
          <button class="primary" id="cc-go">PRODUCE ▸</button></div>` : '<p class="ok">Every topic produced — resurface them in the durability deck.</p>'}
      </div>
      <div class="panel"><h2>Topics <span class="faint right">click any to re-produce</span></h2>
        <ul class="probs">${topics.map(t => { const dn = done[keyOf(activeSubject, t)]; return `<li style="cursor:pointer" data-topic="${esc(t)}">
          <span class="st ${dn ? (dn.grade === 'pass' ? 'solo' : 'recognized') : ''}">${dn ? (dn.grade === 'pass' ? '✓' : dn.grade === 'partial' ? '~' : '✗') : '·'}</span>
          <span class="nm">${esc(cleanTopic(t))}</span>${isSql(t) ? '<span class="faint" style="margin-left:6px">SQL</span>' : ''}</li>`; }).join('')}</ul>
      </div>
    </div><div>
      <div class="panel"><h2>Bank a cross-subject connection <span class="faint">— the gap-maker</span></h2>
        <p class="muted">Almost nobody connects subjects out loud. One line linking two beats ten facts: "a DB index IS a B+ tree the OS pages in and out of memory".</p>
        <input id="cc-syn-q" type="text" autocomplete="off" placeholder="prompt — e.g. how does a DB index relate to OS paging?">
        <input id="cc-syn-a" type="text" autocomplete="off" placeholder="the connection — one line" style="margin-top:8px">
        <button class="primary" id="cc-syn-save" style="margin-top:10px">BANK SYNTH CARD ▸</button>
      </div>
    </div></div>`;

  for (const b of root.querySelectorAll('.cc-tab[data-sub]')) b.addEventListener('click', () => { activeSubject = b.dataset.sub; rerender(); });
  root.querySelector('#cc-go')?.addEventListener('click', () => startTopic(root, nextTopic));
  for (const li of root.querySelectorAll('li[data-topic]')) li.addEventListener('click', () => startTopic(root, li.dataset.topic));
  root.querySelector('#cc-syn-save')?.addEventListener('click', () => bankSynth(root));
}

function startTopic(root, topic) {
  if (!topic) return;
  const sql = isSql(topic), subj = activeSubject, name = cleanTopic(topic);
  const item = {
    prompt: `${sql ? 'Write the query' : 'Explain'} — ${name}`,
    problem: name, subject: subj,
    hint: sql ? 'produce the SQL from blank, then the gotcha' : 'definition → concrete example → one tradeoff / when to use',
    checklist: sql ? ['correct columns + joins', 'GROUP BY / HAVING where needed', 'handles ties / nulls']
      : ['one-line definition', 'a concrete example', 'one tradeoff / when to use'],
    fields: sql
      ? [{ key: 'query', label: name, sql: true, placeholder: 'SELECT …' }, { key: 'trap', label: 'THE GOTCHA', placeholder: 'e.g. ties → DENSE_RANK; = excludes NULLs' }]
      : [{ key: 'def', label: 'DEFINITION (one crisp line)', placeholder: '…' },
         { key: 'ex', label: 'CONCRETE EXAMPLE', placeholder: '…' },
         { key: 'trade', label: 'TRADEOFF / WHEN TO USE', placeholder: '…' }],
    build: v => sql
      ? { produce: v.query, trap: v.trap, pattern: subj }
      : { produce: `${v.def}\n\ne.g. ${v.ex}\n\ntradeoff: ${v.trade}`, trap: '', pattern: subj }
  };
  produceRep(root, {
    item, kind: 'corecs', day: campaignOn() ? campaignEntry()?.day : displayDayN(),
    onDone: async g => {
      App.state.corecs ||= { done: {}, cursor: {} };
      App.state.corecs.done[keyOf(subj, topic)] = { grade: g, ts: Date.now() };
      await saveCorecs();
      rerender();
    }
  });
}

async function bankSynth(root) {
  const q = root.querySelector('#cc-syn-q').value.trim();
  const a = root.querySelector('#cc-syn-a').value.trim();
  if (!q || !a) { root.querySelector(q ? '#cc-syn-a' : '#cc-syn-q').focus(); return; }
  const c = { kind: 'synth', date: todayStr(), day: campaignOn() ? campaignEntry()?.day : displayDayN(), problem: q, prompt: q, produce: a, pattern: 'cross-subject' };
  await appendCard(c); // enters the deck via the today-branch; Leitner box created on first review
  rerender();
}
