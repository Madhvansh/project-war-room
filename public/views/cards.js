// Card Vault + Block 5 shuffle review — §3.8. Vault searchable by pattern;
// the review serves today's new cards + misses resurfacing from the last
// review + 10 random older ones as flip-cards (trigger → recall → flip →
// self-grade). Missed cards persist to data/reviews.json and resurface
// tomorrow. Days 1–5 append the DP keep-warm re-implement, then the one-line
// day log (§3.8's ritual chain; the evidence card hangs off the end).
import {
  App, Laws, esc, todayStr, logDayN, mmss, saveReviews, rerender
} from '../app.js';
import { chime, success, blip } from '../audio.js';

let timerId = null, keyHandler = null;

// SEASON 2: produce-from-blank card kinds share ONE render arm — the FRONT is a
// produce PROMPT (never the answer), the BACK is the model answer (after flip),
// so failure-mode #2 (spoiling the answer) is impossible. The existing flip→grade
// loop IS the produce-from-blank rep; leitnerNext advances the same boxes.
const PRODUCE_KINDS = new Set(['dp', 'cp', 'corecs', 'sysd', 'synth', 'star', 'project', 'graph', 'mix']); // + SEASON 3 arena kinds
const isProduce = c => PRODUCE_KINDS.has(c.kind);
const KIND_LABEL = { dp: 'DP recurrence', cp: 'CP technique', corecs: 'Core CS', sysd: 'System design', synth: 'Cross-subject', star: 'STAR story', project: 'Project deep-dive', graph: 'Graph (arena)', mix: 'Mixed (arena)' };

export function cleanupCards() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
}

export function renderCards(root) {
  renderVault(root);
}

// ── the vault ────────────────────────────────────────────────────────────────
// the user layer and the AI layer of a card, rendered apart — never merged (R3)
function vcardHtml(c) {
  const userLines = c.kind === 'B'
    ? `<div class="vline"><span class="vtag">?</span>guessed: ${esc(c.guess || '—')} ${gradeChip(c.grade)}</div>`
    : isProduce(c)
    ? [
      c.prompt ? `<div class="vline"><span class="vtag">?</span>${esc(c.prompt)}</div>` : '',
      c.produce ? `<div class="vline"><span class="vtag">▣</span>${esc(c.produce)}</div>` : '',
      c.trap ? `<div class="vline"><span class="vtag trap">✗</span>${esc(c.trap)}</div>` : ''
    ].join('')
    : [
      c.note ? `<div class="vline"><span class="vtag">∙</span>${esc(c.note)}</div>` : '',
      c.trigger ? `<div class="vline"><span class="vtag">⚡</span>${esc(c.trigger)}</div>` : '',
      c.trap ? `<div class="vline"><span class="vtag trap">✗</span>${esc(c.trap)}</div>` : ''
    ].join('');
  const canonical = c.kind === 'B' && c.canonical ? `
    <div class="ailayer"><span class="ailabel">CANONICAL</span>
      <div class="vline"><span class="vtag">⚡</span>${esc(c.canonical.trigger || '')}</div>
      <div class="vline"><span class="vtag">▣</span>${esc(c.canonical.pattern || '')}</div>
      <div class="vline"><span class="vtag trap">✗</span>${esc(c.canonical.trap || '')}</div>
    </div>` : '';
  const ai = c.ai ? `
    <div class="ailayer"><span class="ailabel">AI</span>
      <div class="vline"><span class="vtag">⚡</span>${esc(c.ai.trigger)}</div>
      <div class="vline"><span class="vtag trap">✗</span>${esc(c.ai.trap)}</div>
      <div class="vline"><span class="vtag">◇</span>${esc(c.ai.optimal_insight)}</div>
    </div>` : '';
  return `
    <div class="vcard">
      <div class="vpattern">${esc(c.pattern || c.guess || (isProduce(c) ? KIND_LABEL[c.kind] : ''))}${c.kind === 'B' ? ' <span class="faint">· B-rep</span>' : isProduce(c) ? ` <span class="faint">· ${esc(KIND_LABEL[c.kind])}</span>` : ''}</div>
      ${userLines}${canonical}${ai}
      <div class="vmeta">${esc(c.problem)} · day ${c.day ?? '—'}</div>
    </div>`;
}
function gradeChip(g) {
  return g === 'pass' ? '<span class="ok">✓</span>' : g === 'partial' ? '<span class="amber">~</span>'
    : g === 'fail' ? '<span class="danger">✗</span>' : '';
}

function renderVault(root) {
  cleanupCards();
  const cards = [...App.state.cards].sort((a, b) => b.ts - a.ts);
  const today = todayStr();
  const rv = App.state.reviews[today];
  root.innerHTML = `
    <div class="panel">
      <h2>Card vault — ${cards.length} pattern${cards.length === 1 ? '' : 's'} banked
        <span class="right"><span id="enrichline" class="faint"></span>
        ${rv?.completed ? '<span class="ok">tonight’s review done ✓</span> ' : ''}
        <button class="primary" id="reviewbtn">SHUFFLE REVIEW ▸</button></span></h2>
      <input id="cardsearch" type="text" placeholder="search pattern / trigger / trap / note / problem…" autocomplete="off">
      <div id="cardlist" class="cardlist"></div>
    </div>`;
  const list = root.querySelector('#cardlist');
  const paint = q => {
    const t = q.trim().toLowerCase();
    const hits = t
      ? cards.filter(c => [c.pattern, c.trigger, c.trap, c.note, c.guess, c.problem,
          c.ai?.trigger, c.ai?.trap, c.ai?.optimal_insight]
          .some(f => (f || '').toLowerCase().includes(t)))
      : cards;
    list.innerHTML = hits.length ? hits.map(vcardHtml).join('')
      : `<p class="muted" style="padding:12px 0">${cards.length ? 'no cards match.' : 'no cards yet — every solve and recognition rep banks one.'}</p>`;
  };
  paint('');
  root.querySelector('#cardsearch').addEventListener('input', e => paint(e.target.value));
  root.querySelector('#reviewbtn').addEventListener('click', () => startReview(root));
  // the enrichment queue status — offline cards stay user-only with a retry
  fetch('/api/enrich').then(r => r.json()).then(({ pending, dead }) => {
    const el = root.querySelector('#enrichline');
    if (!el || (!pending && !dead)) return;
    el.innerHTML = `${pending ? `${pending} awaiting AI layer · ` : ''}${dead ? `<a href="#" id="enrichretry">${dead} parked — retry</a> · ` : ''}`;
    el.querySelector('#enrichretry')?.addEventListener('click', async e => {
      e.preventDefault();
      await fetch('/api/enrich/retry', { method: 'POST' });
      e.target.textContent = 'retrying…';
    });
  }).catch(() => {});
}

// ── the Block 5 ritual chain ─────────────────────────────────────────────────
function startReview(root) {
  const today = todayStr();
  const deck = Laws.buildReviewDeck(App.state.cards, App.state.reviews, today);
  if (!deck.length) {
    alert('No cards to review yet — solve something first.');
    return;
  }
  const res = { gotIt: [], missed: [] };
  let i = 0, flipped = false;

  const paint = () => {
    cleanupCards();
    const { card: c, why } = deck[i];
    // front: B-cards show the problem (name the pattern); solve cards prefer
    // the user's trigger, fall back to the AI layer's, then the note (R3/R4)
    const front = c.kind === 'B'
      ? { tag: 'PROBLEM', text: c.problem }
      : isProduce(c) ? { tag: KIND_LABEL[c.kind].toUpperCase(), text: c.prompt || c.problem }
      : c.trigger ? { tag: 'TRIGGER', text: c.trigger }
      : c.ai?.trigger ? { tag: 'TRIGGER · AI', text: c.ai.trigger }
      : { tag: 'NOTE', text: c.note || c.problem };
    const backUser = c.kind === 'B' ? `
        <div class="ftag">CANONICAL</div>
        <div class="fpattern">${esc(c.canonical?.pattern || '—')}</div>
        <div class="vline" style="margin-top:6px"><span class="vtag">⚡</span>${esc(c.canonical?.trigger || '')}</div>
        <div class="vline"><span class="vtag trap">✗</span>${esc(c.canonical?.trap || '')}</div>
        <div class="vline" style="margin-top:6px"><span class="vtag">?</span>you guessed: ${esc(c.guess || '—')} ${gradeChip(c.grade)}</div>` : isProduce(c) ? `
        <div class="ftag">ANSWER</div>
        <div class="fpattern">${esc(c.produce || c.pattern || '—')}</div>
        ${c.pattern && c.produce ? `<div class="vline" style="margin-top:6px"><span class="vtag">▣</span>${esc(c.pattern)}</div>` : ''}
        ${c.trap ? `<div class="ftag" style="margin-top:10px">TRAP</div><div class="ftrap">${esc(c.trap)}</div>` : ''}` : `
        <div class="ftag">PATTERN</div>
        <div class="fpattern">${esc(c.pattern)}</div>
        ${c.note ? `<div class="ftag" style="margin-top:10px">YOUR LINE</div><div class="ftrap">${esc(c.note)}</div>` : ''}
        ${c.trap ? `<div class="ftag" style="margin-top:10px">TRAP</div><div class="ftrap">${esc(c.trap)}</div>` : ''}
        ${c.ai ? `<div class="ailayer"><span class="ailabel">AI</span>
          <div class="vline"><span class="vtag">⚡</span>${esc(c.ai.trigger)}</div>
          <div class="vline"><span class="vtag trap">✗</span>${esc(c.ai.trap)}</div>
          <div class="vline"><span class="vtag">◇</span>${esc(c.ai.optimal_insight)}</div></div>` : ''}`;
    root.innerHTML = `
      <div class="solve">
        <div class="phaselbl">SHUFFLE REVIEW · ${i + 1}/${deck.length}
          <span class="whychip why-${why}">${why}</span></div>
        <div class="flipcard panel" id="flip">
          <div class="ftag">${esc(front.tag)}</div>
          <div class="ftrigger">${esc(front.text)}</div>
          ${flipped ? `
            <div class="fdivider"></div>
            ${backUser}
            <div class="vmeta" style="margin-top:12px">${esc(c.problem)} · day ${c.day ?? '—'}</div>`
          : '<div class="faint" style="margin-top:14px">say the pattern out loud, then flip</div>'}
        </div>
        <div class="actions">
          ${flipped
            ? `<button class="good" id="got">GOT IT<kbd>G</kbd></button>
               <button class="warn" id="miss">MISSED<kbd>M</kbd></button>`
            : `<button class="primary" id="flipbtn">FLIP<kbd>Space</kbd></button>`}
          <button id="quitbtn">✕ quit</button>
        </div>
      </div>`;
    const flip = () => { flipped = true; paint(); };
    const grade = got => {
      (got ? res.gotIt : res.missed).push(deck[i].card.id);
      got ? blip() : 0;
      i++; flipped = false;
      i < deck.length ? paint() : finishFlips();
    };
    root.querySelector('#flipbtn')?.addEventListener('click', flip);
    root.querySelector('#flip').addEventListener('click', () => { if (!flipped) flip(); });
    root.querySelector('#got')?.addEventListener('click', () => grade(true));
    root.querySelector('#miss')?.addEventListener('click', () => grade(false));
    root.querySelector('#quitbtn').addEventListener('click', () => {
      if (confirm('Quit the review? Tonight’s grades are discarded.')) renderVault(root);
    });
    keyHandler = e => {
      if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.key === ' ' && !flipped) { e.preventDefault(); flip(); }
      if (flipped && e.key.toLowerCase() === 'g') grade(true);
      if (flipped && e.key.toLowerCase() === 'm') grade(false);
    };
    window.addEventListener('keydown', keyHandler);
  };

  const finishFlips = async () => {
    App.state.reviews[today] = {
      ...(App.state.reviews[today] || {}),
      gotIt: res.gotIt, missed: res.missed, completed: true, ts: Date.now()
    };
    // R7: advance the Leitner boxes — ✓ climbs 1/3/7, ✗ resets to tomorrow
    const lt = (App.state.reviews._leitner ||= {});
    for (const id of res.gotIt) lt[id] = Laws.leitnerNext(lt[id], true, today);
    for (const id of res.missed) lt[id] = Laws.leitnerNext(lt[id], false, today);
    await saveReviews();
    success();
    const kw = Laws.dpKeepWarm(App.cur, logDayN()); // day 0 (warm-up) → rule's days 1–5 window says no
    kw ? renderKeepWarm(root, kw, res) : renderDayLog(root, res);
  };

  paint();
}

// days 1–5: one timed re-implement-from-blank (rules.dp_keep_warm)
function renderKeepWarm(root, kw, res) {
  cleanupCards();
  const startTs = Date.now();
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">DP KEEP-WARM — days 1–5 ritual</div>
      <div class="probname">${esc(kw.problem)}</div>
      <div class="muted">blank file. re-implement from memory. ${kw.minutes} minutes.</div>
      <div class="bigclock" id="kwclock">${kw.minutes}:00</div>
      <div class="actions">
        <button class="primary" id="kwdone">DONE — day log ▸<kbd>Enter</kbd></button>
      </div>
    </div>`;
  let chimed = false;
  const tick = () => {
    const remain = kw.minutes - (Date.now() - startTs) / 60000 * App.speed;
    const bc = root.querySelector('#kwclock');
    bc.textContent = mmss(Math.max(remain, 0) * 60);
    bc.classList.toggle('late', remain <= 2);
    if (remain <= 0 && !chimed) { chime(); chimed = true; }
  };
  timerId = setInterval(tick, 200);
  tick();
  const done = () => renderDayLog(root, res);
  root.querySelector('#kwdone').addEventListener('click', done);
  keyHandler = e => { if (e.key === 'Enter' && !/INPUT|TEXTAREA/.test(e.target.tagName)) done(); };
  window.addEventListener('keydown', keyHandler);
}

// §3.8: "prompts the one-line day log and the screenshot ritual"
// + Wave 4 feature 6: the Coach nightly debrief — one call, three lines,
// the watch-item threads into tomorrow morning's briefing.
function renderDayLog(root, res) {
  cleanupCards();
  const today = todayStr();
  const existing = App.state.reviews[today]?.debrief;
  root.innerHTML = `
    <div class="solve">
      <div class="phaselbl">ONE-LINE DAY LOG</div>
      <div class="muted" style="margin:10px 0">
        ${res.gotIt.length} got · <span class="${res.missed.length ? 'amber' : 'ok'}">${res.missed.length} missed</span>
        ${res.missed.length ? '— they resurface tomorrow.' : '— clean sweep.'}</div>
      <div class="recogform panel">
        <label>${logDayN() === 0 ? 'warm-up night' : `day ${logDayN()}`} in one line</label>
        <input id="dl" type="text" autocomplete="off"
          value="${esc(App.state.reviews[today]?.dayLog || '')}"
          placeholder="e.g. quota met, sliding window finally clicked, 3-sum was ugly">
        <div class="actions" style="margin-top:14px">
          <button class="primary" id="dlsave">SAVE — evidence card ▸<kbd>Enter</kbd></button>
          <button id="debriefbtn" class="ghost">⟁ coach debrief</button>
        </div>
        <div id="debriefzone" style="text-align:left;margin-top:10px">${existing ? debriefHtml(existing) : ''}</div>
      </div>
    </div>`;
  const input = root.querySelector('#dl');
  input.focus();
  const save = async () => {
    App.state.reviews[today] = { ...(App.state.reviews[today] || {}), dayLog: input.value.trim() };
    await saveReviews();
    location.hash = '#/wall?evidence=1'; // §5.5 — the ritual ends on the evidence card
  };
  root.querySelector('#dlsave').addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  root.querySelector('#debriefbtn').addEventListener('click', async e => {
    e.target.disabled = true;
    e.target.textContent = '⟁ thinking…';
    try {
      const { daySummaryText } = await import('./evidence.js');
      const r = await fetch('/api/debrief', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today, summary: daySummaryText() })
      }).then(x => x.json());
      if (r.error) throw new Error(r.error);
      App.state.reviews[today] = { ...(App.state.reviews[today] || {}), debrief: r.debrief };
      root.querySelector('#debriefzone').innerHTML = debriefHtml(r.debrief);
      e.target.textContent = '⟁ debriefed ✓';
    } catch (err) {
      e.target.disabled = false;
      e.target.textContent = '⟁ coach debrief (retry)';
      root.querySelector('#debriefzone').innerHTML = `<p class="danger">debrief failed: ${esc(err.message)} — offline is fine, the night survives without it.</p>`;
    }
  });
}

function debriefHtml(d) {
  return `
    <div class="ailayer"><span class="ailabel">COACH DEBRIEF</span>
      <div class="vline"><span class="vtag trap">↯</span>drifted: ${esc(d.drifted)}</div>
      <div class="vline"><span class="vtag">✓</span>held: ${esc(d.held)}</div>
      <div class="vline"><span class="vtag">👁</span>tomorrow: ${esc(d.watch)} <span class="faint">— pinned to the morning briefing</span></div>
    </div>`;
}
