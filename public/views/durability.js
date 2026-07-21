// Durability dashboard (Season 2) — the instrument that makes forgetting VISIBLE.
// Per-track production/retention rate, the Leitner box distribution, and the
// decay-risk list (cards overdue for review or never drilled). The actual
// produce-from-blank review is the EXISTING #/cards Block-5 shuffle, now
// kind-agnostic via the frozen buildReviewDeck. Pure-read; reuses
// stats.retention / stats.decayRisk. Additive — nothing here touches Regime 1.
import { App, esc, todayStr, reviewDueCount, campaignOn, startCampaign } from '../app.js';
import { retention, decayRisk } from '../stats.js';

const KIND_LABEL = {
  dsa: 'DSA patterns', B: 'Tier-B recall', dp: 'DP (LeetCode)', cp: 'CP (Codeforces)',
  corecs: 'Core CS', sysd: 'System Design', synth: 'Cross-subject', star: 'Behavioral / STAR', project: 'Project deep-dive',
  graph: 'Graph (arena)', mix: 'Mixed (arena)' // SEASON 3
};

export function renderDurability(root) {
  const today = todayStr();
  const ret = retention(App.state.cards, App.state.reviews, today);
  const risk = decayRisk(App.state.cards, App.state.reviews, today, 7);
  const due = reviewDueCount();

  const kindRow = k => {
    const seg = (n, cls) => `<span class="box ${cls}" style="flex:${n || 0.001}" title="${cls}: ${n}">${n || ''}</span>`;
    return `<tr>
      <td class="kn">${esc(KIND_LABEL[k.kind] || k.kind)}</td>
      <td class="kt">${k.total}</td>
      <td class="kr"><b class="${k.retained == null ? 'faint' : k.retained >= 60 ? 'ok' : 'amber'}">${k.retained == null ? '—' : k.retained + '%'}</b></td>
      <td class="kd ${k.due ? 'amber' : ''}">${k.due || '—'}</td>
      <td class="kb"><div class="boxbar">${seg(k.boxes[0], 'b0')}${seg(k.boxes[1], 'b1')}${seg(k.boxes[2], 'b2')}${seg(k.boxes[3], 'b3')}</div></td></tr>`;
  };

  root.innerHTML = `
    <div class="panel">
      <h2>Durability — produce from blank, beat the 70% cliff
        <span class="right">${due ? `<a class="primary" href="#/cards">REVIEW ${due} ▸</a>` : '<span class="ok">nothing due ✓</span>'}</span></h2>
      <div class="durhead">
        <div class="durstat"><span class="big ${ret.retained == null ? 'faint' : ret.retained >= 60 ? 'ok' : 'amber'}">${ret.retained == null ? '—' : ret.retained + '%'}</span><span class="dl">retained<br><span class="faint">drilled cards past box 1</span></span></div>
        <div class="durstat"><span class="big">${ret.total}</span><span class="dl">cards total</span></div>
        <div class="durstat"><span class="big">${ret.seen}</span><span class="dl">drilled ≥ once</span></div>
        <div class="durstat"><span class="big ${ret.due ? 'amber' : 'ok'}">${ret.due}</span><span class="dl">due now</span></div>
      </div>
      ${!campaignOn() ? `<p class="muted" style="margin-top:8px">▶ The durability deck spans every track. <a href="#" id="durstart">start the second attempt ▸</a></p>` : ''}
    </div>

    <div class="panel">
      <h2>Production by track <span class="right faint">boxes: new · 1d · 3d · 7d — further right = more durable</span></h2>
      <table class="durtable">
        <thead><tr><th>track</th><th>cards</th><th>retained</th><th>due</th><th>Leitner spread</th></tr></thead>
        <tbody>${ret.kinds.length ? ret.kinds.map(kindRow).join('') : '<tr><td colspan="5" class="faint">no cards yet — solves and produce-reps fill the deck</td></tr>'}</tbody>
      </table>
    </div>

    <div class="panel">
      <h2 class="${risk.length ? 'danger' : 'ok'}">Decay risk — about to be forgotten (${risk.length})</h2>
      ${risk.length ? `<ul class="risklist">
        ${risk.slice(0, 25).map(r => `<li>
          <span class="rk-kind">${esc(KIND_LABEL[r.kind] || r.kind)}</span>
          <span class="rk-nm">${esc(r.problem)}</span>
          <span class="rk-stale ${r.staleDays >= 14 ? 'danger' : 'amber'}">${r.staleDays}d ${esc(r.why)}</span>
        </li>`).join('')}
      </ul>
      ${risk.length > 25 ? `<p class="faint">+${risk.length - 25} more</p>` : ''}
      <p class="muted" style="margin-top:8px">These resurface first in tomorrow's Block 0 and the review deck. <a href="#/cards">drill them now ▸</a></p>`
      : '<p class="ok">Nothing decaying past 7 days — the spacing is holding.</p>'}
    </div>`;

  root.querySelector('#durstart')?.addEventListener('click', e => { e.preventDefault(); startCampaign(2); });
}
