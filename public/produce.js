// SEASON 2 Wave 7 — the shared produce-from-blank cockpit. ONE loop for every
// produce-then-check track (core-CS, System Design, …): read the prompt → TYPE
// the answer from blank (structured fields) → check → one-key ✓/~/✗ → mint a
// produce card (front = prompt, back = what you produced) and SEED its Leitner
// box so it enters spaced repetition immediately. "PRODUCE not recognize" is
// identical everywhere and tested once. Reuses the recognize.js REVEAL→grade UX.
import { App, Laws, esc, todayStr, appendCard, saveReviews } from './app.js';
import { success, blip } from './audio.js';

let keyHandler = null;
export function cleanupProduce() {
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
}

// produceRep(root, { item, kind, day, onDone, mintOn }) — runs ONE rep, then onDone(grade).
// item = { prompt, problem?, subject?, hint?, checklist?[],
//          fields:[{key,label,placeholder,multiline,sql}], build:(vals)=>({produce,trap,pattern}),
//          canon?, contentId? }
// SEASON 3 additions (defaults keep every existing caller byte-identical):
// - item.canon: a shipped MODEL ANSWER revealed at the grade step. When present,
//   the minted card's back-face (`produce`) is the CANON — never the user's
//   possibly-wrong text — and the user's text is kept apart as `attempt`.
// - mintOn(grade): predicate deciding whether to mint at all (doctrine/grill
//   drills pass g => g !== 'pass' so the deck holds exactly the misses).
// - item.contentId: dedup key for shipped content — a repeat miss RESCHEDULES
//   the existing card's Leitner box instead of minting a duplicate.
export function produceRep(root, { item, kind, day = null, onDone, mintOn = null }) {
  let phase = 'produce';
  const vals = {};

  const paintProduce = () => {
    cleanupProduce();
    root.innerHTML = `
      <div class="solve">
        <div class="phaselbl">PRODUCE FROM BLANK${item.subject ? ' · ' + esc(item.subject) : ''}</div>
        <div class="probname">${esc(item.prompt)}</div>
        ${item.hint ? `<div class="muted">${esc(item.hint)}</div>` : ''}
        <div class="recogform panel" style="text-align:left">
          ${item.fields.map(f => `
            <label>${esc(f.label)}${f.sql ? ' <span class="cyan">— write the query</span>' : ''}</label>
            ${f.multiline || f.sql
              ? `<textarea id="pf-${f.key}" rows="${f.sql ? 4 : 3}" placeholder="${esc(f.placeholder || '')}"${f.sql ? ' spellcheck="false"' : ''}></textarea>`
              : `<input id="pf-${f.key}" type="text" autocomplete="off" placeholder="${esc(f.placeholder || '')}">`}`).join('')}
          <div class="actions" style="margin-top:14px">
            <button class="primary" id="pf-reveal">PRODUCED — check it ▸<kbd>Ctrl+Enter</kbd></button>
          </div>
        </div>
      </div>`;
    root.querySelector(`#pf-${item.fields[0].key}`)?.focus();
    const reveal = () => {
      for (const f of item.fields) vals[f.key] = (root.querySelector(`#pf-${f.key}`)?.value || '').trim();
      phase = 'grade'; paintGrade();
    };
    root.querySelector('#pf-reveal').addEventListener('click', reveal);
    keyHandler = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reveal(); } };
    window.addEventListener('keydown', keyHandler);
  };

  const paintGrade = () => {
    cleanupProduce();
    const card = item.build(vals);
    root.innerHTML = `
      <div class="solve">
        <div class="phaselbl">CHECK — grade your recall honestly</div>
        <div class="probname">${esc(item.prompt)}</div>
        <div class="flipcard panel" style="text-align:left;max-width:640px;margin:14px auto">
          <div class="ftag">WHAT YOU PRODUCED</div>
          <div class="ftrap" style="white-space:pre-wrap">${esc(card.produce || '(nothing)')}</div>
          ${card.trap ? `<div class="ftag" style="margin-top:10px">TRAP YOU NOTED</div><div class="ftrap">${esc(card.trap)}</div>` : ''}
          ${item.canon ? `<div class="ailayer"><span class="ailabel">MODEL ANSWER</span><div class="vline" style="white-space:pre-wrap">${esc(item.canon)}</div></div>` : ''}
          ${item.checklist?.length ? `<div class="ailayer"><span class="ailabel">${item.canon ? 'MUST HIT' : 'CHECK AGAINST'}</span>${item.checklist.map(c => `<div class="vline"><span class="vtag">▣</span>${esc(c)}</div>`).join('')}</div>` : ''}
        </div>
        <div class="actions">
          <button class="good" data-grade="pass">✓ NAILED IT<kbd>1</kbd></button>
          <button class="warn" data-grade="partial">~ PARTIAL<kbd>2</kbd></button>
          <button class="primary" data-grade="fail">✗ MISSED<kbd>3</kbd></button>
        </div>
      </div>`;
    const grade = async g => {
      if (!mintOn || mintOn(g)) {
        const dup = item.contentId && (App.state.cards || []).find(x => x.contentId === item.contentId);
        if (dup) {
          // repeat drill on shipped content: reschedule the EXISTING card's box
          // instead of minting a duplicate (dedup-by-contentId, §S3)
          const lt = (App.state.reviews._leitner ||= {});
          lt[dup.id] = Laws.leitnerNext(lt[dup.id], g === 'pass', todayStr());
          await saveReviews();
        } else {
          const c = {
            kind, date: todayStr(), day,
            problem: item.problem || item.prompt, prompt: item.prompt,
            pattern: card.pattern || item.subject || '', produce: card.produce || '', trap: card.trap || '', grade: g
          };
          if (item.canon) { // shipped model answer = the card's back-face; his text kept apart
            c.produce = item.canon;
            c.attempt = card.produce || '';
          }
          if (item.contentId) { c.contentId = item.contentId; c.src = 's3'; }
          await appendCard(c);
        }
      }
      // The card enters the deck via buildReviewDeck's today-branch; its Leitner box
      // is created on the FIRST real review (cards.js / gauntlet), so a fresh produce
      // is honestly "unseen" until re-drilled — retention() then measures durability,
      // not coverage (consistent with the dp/cp cards, which also never seed on mint).
      g === 'pass' ? success() : blip();
      cleanupProduce();
      onDone?.(g, card); // card = { produce, trap, pattern } so callers can persist the artifact
    };
    for (const b of root.querySelectorAll('button[data-grade]')) b.addEventListener('click', () => grade(b.dataset.grade));
    keyHandler = e => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === '1') grade('pass');
      if (e.key === '2') grade('partial');
      if (e.key === '3') grade('fail');
    };
    window.addEventListener('keydown', keyHandler);
  };

  paintProduce();
}
