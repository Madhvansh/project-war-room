// SEASON 2 Wave 8 — the Produce Gauntlet (#/gauntlet). 10 random OLD items across
// ALL card kinds, reproduced FROM BLANK and scored. It measures durable skill, not
// coverage — the truest interview predictor and the direct rebuttal to "recognize
// but can't produce". Uses stats.produceGauntlet (NOT the frozen nightly deck);
// the flip→grade loop advances the same Leitner boxes via leitnerNext.
import { App, Laws, esc, todayStr, saveReviews, rerender } from '../app.js';
import { produceGauntlet } from '../stats.js';
import { success, blip } from '../audio.js';

let keyHandler = null;
export function cleanupGauntlet() { if (keyHandler) window.removeEventListener('keydown', keyHandler); keyHandler = null; }

const PRODUCE = new Set(['dp', 'cp', 'corecs', 'sysd', 'synth', 'star', 'project', 'graph', 'mix']); // + SEASON 3 arena kinds
const KIND_TAG = { dp: 'DP RECURRENCE', cp: 'CP TECHNIQUE', corecs: 'CORE CS', sysd: 'SYSTEM DESIGN', synth: 'CROSS-SUBJECT', star: 'STAR STORY', project: 'PROJECT', graph: 'GRAPH (ARENA)', mix: 'MIXED (ARENA)' };
function faces(c) {
  if (c.kind === 'B') return { tag: 'PROBLEM', front: c.problem, backTag: 'CANONICAL', back: c.canonical?.pattern || c.guess || '—' };
  if (PRODUCE.has(c.kind)) return { tag: KIND_TAG[c.kind] || c.kind.toUpperCase(), front: c.prompt || c.problem, backTag: 'ANSWER', back: c.produce || c.pattern || '—' };
  return { tag: 'TRIGGER', front: c.trigger || c.ai?.trigger || c.note || c.problem, backTag: 'PATTERN', back: c.pattern || c.ai?.optimal_insight || '—' };
}

export function renderGauntlet(root) {
  cleanupGauntlet();
  const deck = produceGauntlet(App.state.cards, App.state.reviews, todayStr(), Math.random, 10);
  if (!deck.length) { root.innerHTML = '<div class="panel"><p class="muted">No older cards yet — solve and produce a few, then run the gauntlet tomorrow.</p></div>'; return; }
  let i = 0, flipped = false;
  const res = { got: [], missed: [] };

  const paint = () => {
    cleanupGauntlet();
    const c = deck[i].card; const f = faces(c);
    root.innerHTML = `<div class="solve">
      <div class="phaselbl">PRODUCE GAUNTLET · ${i + 1}/${deck.length} <span class="whychip why-random">${esc((c.kind || 'dsa'))}</span></div>
      <div class="flipcard panel" id="g-flip" style="max-width:620px;margin:14px auto;text-align:left">
        <div class="ftag">${esc(f.tag)}</div><div class="ftrigger">${esc(f.front)}</div>
        ${flipped ? `<div class="fdivider"></div><div class="ftag">${esc(f.backTag)}</div><div class="fpattern" style="white-space:pre-wrap">${esc(f.back)}</div>
          ${c.trap ? `<div class="ftag" style="margin-top:8px">TRAP</div><div class="ftrap">${esc(c.trap)}</div>` : ''}
          <div class="vmeta" style="margin-top:10px">${esc(c.problem || '')}</div>`
        : '<div class="faint" style="margin-top:14px">reproduce it from blank — out loud — then flip</div>'}
      </div>
      <div class="actions">${flipped
        ? '<button class="good" id="g-got">GOT IT<kbd>G</kbd></button><button class="warn" id="g-miss">MISSED<kbd>M</kbd></button>'
        : '<button class="primary" id="g-flipbtn">FLIP<kbd>Space</kbd></button>'}
        <button id="g-quit">✕ quit</button></div></div>`;
    const flip = () => { flipped = true; paint(); };
    const grade = got => { (got ? res.got : res.missed).push(deck[i].card.id); got ? blip() : 0; i++; flipped = false; i < deck.length ? paint() : finish(); };
    root.querySelector('#g-flipbtn')?.addEventListener('click', flip);
    root.querySelector('#g-flip').addEventListener('click', () => { if (!flipped) flip(); });
    root.querySelector('#g-got')?.addEventListener('click', () => grade(true));
    root.querySelector('#g-miss')?.addEventListener('click', () => grade(false));
    root.querySelector('#g-quit').addEventListener('click', () => { if (confirm('Quit the gauntlet? Grades are discarded.')) rerender(); });
    keyHandler = e => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' && !flipped) { e.preventDefault(); flip(); }
      if (flipped && e.key.toLowerCase() === 'g') grade(true);
      if (flipped && e.key.toLowerCase() === 'm') grade(false); };
    window.addEventListener('keydown', keyHandler);
  };

  const finish = async () => {
    cleanupGauntlet();
    const lt = (App.state.reviews._leitner ||= {});
    const today = todayStr();
    for (const id of res.got) lt[id] = Laws.leitnerNext(lt[id], true, today);
    for (const id of res.missed) lt[id] = Laws.leitnerNext(lt[id], false, today);
    App.state.reviews._gauntlet ||= {};
    App.state.reviews._gauntlet[today] = { got: res.got.length, total: deck.length, ts: Date.now() };
    await saveReviews(); success();
    const pct = Math.round(res.got.length / deck.length * 100);
    root.innerHTML = `<div class="solve"><div class="phaselbl">GAUNTLET COMPLETE</div>
      <div class="bigclock" style="font-size:64px"><span class="${pct >= 70 ? 'ok' : 'amber'}">${res.got.length}</span>/${deck.length}</div>
      <p class="muted">${pct}% reproduced from blank — the truest interview predictor. Missed cards resurface sooner.</p>
      <div class="actions"><button class="primary" id="g-done">DONE ▸</button> <a href="#/command"><button>command center</button></a></div></div>`;
    root.querySelector('#g-done').addEventListener('click', () => { location.hash = '#/durability'; });
  };

  paint();
}
