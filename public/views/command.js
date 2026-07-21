// SEASON 2 Wave 8 — the command center (#/command): the NEW scoreboard. One
// cross-track INTERVIEW-READY % north-star (production, not coverage), the five
// per-track rows, the weakest-3-to-fix-tomorrow (click-to-launch), the adherence
// meter (your own realistic load, anti-fantasy), a self-scheduling triage that
// becomes tomorrow's first block, a company filter, a STAR story bank, and the
// interview-day calm protocol. Pure-read over existing state; nothing frozen.
import {
  App, Laws, esc, todayStr, rerender, appendCard, saveReviews, saveCompanies, sheetCount, problemLink
} from '../app.js';
import { crossTrackReadiness, adherenceMeter, decayRisk, retention } from '../stats.js';

const KIND_LABEL = { dsa: 'DSA', B: 'Tier-B', dp: 'DP', cp: 'CP', corecs: 'Core CS', sysd: 'SysD', synth: 'synth', star: 'STAR', project: 'project', graph: 'Graph', mix: 'Mixed' }; // + SEASON 3
const PROTOCOL = [
  'Sleep 8h — a wrecked night quietly deletes the prep.',
  'Morning: re-read ONLY the two framework spines (HLD + LLD) + the estimation numbers. No new content.',
  'Warm-up: one easy blank re-solve to prime the pattern reflex — not a hard problem.',
  'In the round: restate → clarify (first 5 min) → think OUT LOUD through the spine → manage the clock → end on trade-offs.',
  'If stuck: say the brute force, then optimize out loud; silence scores zero.',
  'They test trajectory + structure, not perfection — a clear, narrated 80% beats a silent 100%.'
];

export function renderCommand(root) {
  let cf = null;
  paint(root, cf);
  fetch('/api/cf').then(r => r.json()).then(d => { cf = d; paint(root, cf); }).catch(() => {});
}

function paint(root, cf) {
  const ct = crossTrackReadiness(App.cur, App.state, todayStr(), cf);
  const adh = adherenceMeter(App.cur, App.state, todayStr());
  const ret = retention(App.state.cards, App.state.reviews, todayStr());
  const risk = decayRisk(App.state.cards, App.state.reviews, todayStr(), 7).slice(0, 5);
  const cov = sheetCount();

  const bar = (label, ready, lowData, detail, hash, weight) => `
    <div class="ct-row" ${hash ? `data-go="${hash}"` : ''}>
      <div class="ct-top"><span class="ct-label">${esc(label)} <span class="faint">· ${Math.round(weight * 100)}%</span></span>
        <span class="ct-pct ${ready >= 60 ? 'ok' : ready >= 35 ? 'amber' : 'danger'}">${ready}%${lowData ? ' <span class="faint">n<3</span>' : ''}</span></div>
      <div class="bar"><div class="fill ${ready >= 60 ? 'full' : ''}" style="width:${ready}%"></div></div>
      <div class="ct-detail faint">${esc(detail)}</div>
    </div>`;

  // company filter
  const tiers = App.s2?.companies?.tiers || {};
  const tags = App.s2?.companies?.pattern_tags || {};
  const shortlist = App.state.companies || [];
  const tierChips = Object.entries(tiers).map(([k, list]) => `<div class="co-tier"><span class="co-tname">${esc(k.replace(/_/g, ' '))}</span>
    ${list.map(c => `<button class="co-chip${tags[c] ? ' has-tags' : ''}" data-co="${esc(c)}" title="${tags[c] ? esc(tags[c].join(' · ')) : 'no tags yet'}">${esc(c)}</button>`).join('')}</div>`).join('');

  root.innerHTML = `
    <div class="panel cmd-head">
      <div class="cmd-hero">
        <div class="cmd-ready"><span class="big ${ct.overall >= 60 ? 'ok' : ct.overall >= 35 ? 'amber' : 'danger'}">${ct.overall}%</span>
          <span class="dl">INTERVIEW-READY<br><span class="faint">production across all tracks</span></span></div>
        <div class="cmd-vs faint">vs Season-1 coverage <b>${cov}/435</b> <span class="faint">(history)</span> · deck retained <b>${ret.retained == null ? '—' : ret.retained + '%'}</b> · <span class="faint">legacy S2 metric — the <a href="#/warplan">evidence gates</a> govern Season 3</span></div>
      </div>
      <div class="cmd-drills">
        <a href="#/oa" class="drill-btn">⏱ OA simulator</a>
        <a href="#/interview" class="drill-btn">🎙 mock interview</a>
        <a href="#/gauntlet" class="drill-btn">⚔ produce gauntlet</a>
        <a href="#/rapidfire" class="drill-btn">⚡ rapid-fire</a>
      </div>
    </div>
    <div class="cols"><div>
      <div class="panel"><h2>Readiness by track <span class="right faint">weighted: deciders heaviest</span></h2>
        ${ct.rows.map(r => bar(r.label, r.ready, r.lowData, r.detail, r.hash, r.weight)).join('')}</div>
      <div class="panel"><h2>Adherence <span class="right faint">your load, not a fantasy quota</span></h2>
        <div class="durhead">
          <div class="durstat"><span class="big ${adh.met ? 'ok' : 'amber'}">${adh.today}</span><span class="dl">today<br><span class="faint">items of real work</span></span></div>
          <div class="durstat"><span class="big">${adh.bar}</span><span class="dl">your realistic bar<br><span class="faint">~median of last 7</span></span></div>
          <div class="durstat"><span class="big ${adh.streak ? 'ok' : ''}">${adh.streak}🔥</span><span class="dl">consistency streak<br><span class="faint">days the bar was met</span></span></div>
        </div>
        <p class="faint" style="margin-top:8px">${adh.met ? 'Today\'s bar is met — consistency beats volume.' : `${adh.bar - adh.today} more item(s) to hit your realistic bar. No 8/day fantasy.`}</p>
      </div>
    </div><div>
      <div class="panel"><h2 class="amber">Fix tomorrow — the weakest 3</h2>
        <ul class="probs">${ct.weakest.map(w => `<li data-go="${w.hash}" style="cursor:pointer">
          <span class="st amber">▸</span><span class="nm">${esc(w.label)} <span class="faint">${w.ready}%</span></span>
          <span class="faint" style="margin-left:auto">${esc(w.fix)} →</span></li>`).join('')}</ul>
        ${risk.length ? `<h2 style="margin-top:12px">+ resurface (decaying)</h2><ul class="probs">${risk.map(r => `<li style="cursor:default">
          <span class="st">◆</span><span class="nm">${esc(r.problem)} <span class="faint">${KIND_LABEL[r.kind] || r.kind} · ${r.staleDays}d</span></span></li>`).join('')}</ul>
          <p class="faint" style="margin-top:6px"><a href="#/durability">durability deck ▸</a> · <a href="#/gauntlet">run the gauntlet ▸</a></p>` : ''}
      </div>
      <div class="panel"><h2>Target companies <span class="faint right">tags aim the prep</span></h2>
        ${tierChips}
        <div id="co-detail" class="co-detail faint">click a company to see its known patterns</div>
        <div class="ladder-add" style="margin-top:10px"><input id="co-add" type="text" placeholder="add your dream shortlist…" autocomplete="off"><button id="co-save" class="primary">ADD</button></div>
        ${shortlist.length ? `<div class="sd-chips" style="margin-top:8px">${shortlist.map(c => `<span class="sd-chip">${esc(c)} <a href="#" data-rmco="${esc(c)}">✕</a></span>`).join('')}</div>` : ''}
      </div>
    </div></div>
    <div class="cols"><div>
      <div class="panel"><h2>Behavioral — STAR bank <span class="faint">a cheap round that sinks the unprepared</span></h2>
        <p class="muted">Map a story to each theme (Situation·Task·Action·Result). Banks into the deck — they decay too.</p>
        <select id="star-theme" style="width:100%">${['conflict', 'failure', 'leadership', 'ambiguity', 'biggest impact', 'why this company'].map(t => `<option>${t}</option>`).join('')}</select>
        <textarea id="star-story" rows="3" placeholder="S: … T: … A: … R: (quantified)" style="margin-top:8px"></textarea>
        <button id="star-save" class="primary" style="margin-top:8px">BANK STAR CARD ▸</button>
      </div>
    </div><div>
      <div class="panel"><h2>Interview-day protocol <span class="faint">sharp, not fried</span></h2>
        <ul class="proto">${PROTOCOL.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
        <button id="proto-bank" class="ghost" style="margin-top:8px">pin as a card</button>
      </div>
    </div></div>`;

  // wiring
  for (const el of root.querySelectorAll('[data-go]')) el.addEventListener('click', () => { location.hash = el.dataset.go; });
  for (const b of root.querySelectorAll('.co-chip[data-co]')) b.addEventListener('click', () => {
    const c = b.dataset.co, t = tags[c];
    root.querySelector('#co-detail').innerHTML = t ? `<b>${esc(c)}</b> → ${t.map(esc).join(' · ')}` : `<b>${esc(c)}</b> — no pattern tags yet; add via the shortlist.`;
  });
  root.querySelector('#co-save')?.addEventListener('click', async () => {
    const v = root.querySelector('#co-add').value.trim(); if (!v) return;
    App.state.companies = [...new Set([...(App.state.companies || []), v])];
    await saveCompanies(); rerender();
  });
  for (const a of root.querySelectorAll('[data-rmco]')) a.addEventListener('click', async e => {
    e.preventDefault();
    App.state.companies = (App.state.companies || []).filter(c => c !== a.dataset.rmco);
    await saveCompanies(); rerender();
  });
  root.querySelector('#star-save')?.addEventListener('click', async () => {
    const theme = root.querySelector('#star-theme').value, story = root.querySelector('#star-story').value.trim();
    if (!story) { root.querySelector('#star-story').focus(); return; }
    await bankCard({ kind: 'star', problem: theme, prompt: `STAR — ${theme}`, produce: story, pattern: 'behavioral' });
    rerender();
  });
  root.querySelector('#proto-bank')?.addEventListener('click', async () => {
    await bankCard({ kind: 'project', problem: 'interview-day protocol', prompt: 'Interview-day protocol — recite it', produce: PROTOCOL.join('\n'), pattern: 'protocol' });
    rerender();
  });
}

async function bankCard(fields) {
  await appendCard({ ...fields, date: todayStr(), day: null }); // Leitner box created on first review
}
