// Log view — the data room (§5.8): weak-topic readout deciding what Days
// 19–20 patch, the patch list, CSV export, and every raw row inspectable.
import { App, esc, deleteLog, rerender, todayStr, Laws, saveCandidates, problemInfo } from '../app.js';
import { TIERB_CEIL_MIN } from '../laws.js';
import { topicStats, patchList, toCsv, MIN_ATTEMPTS_FOR_SCORE, gapPile, readiness, trapLedger } from '../stats.js';

export function renderLog(root) {
  const rows = [...App.state.log].sort((a, b) => b.ts - a.ts);
  // solo rate counts real sheet attempts only — drill re-solves and contest
  // upsolves are different work and would distort the number
  const attempts = rows.filter(r => r.tier === 'A' && r.outcome !== 'resolve' && !r.upsolve);
  const solo = attempts.filter(r => r.outcome === 'solo').length;
  const flagged = rows.filter(r => r.flag).length;
  const soloRate = attempts.length ? Math.round(solo / attempts.length * 100) : 0;

  const topics = topicStats(App.cur, App.state.log);
  const scored = topics.filter(t => !t.lowData);
  const patches = patchList(App.cur, App.state.log);
  const gaps = gapPile(App.cur, App.state.log, App.state.cards);
  const ready = readiness(App.cur, App.state.log, todayStr()).filter(r => !r.lowData);
  const traps = trapLedger(App.cur, App.state.log, problemInfo);
  const trapShown = traps.items.slice(0, 15);

  const readyRows = ready.map((r, i) => `
    <li ${r.fix ? `data-fix="${i}"` : ''} class="${r.fix ? '' : 'nofix'}">
      <span class="readybar"><span class="readyfill r${r.ready >= 70 ? 'hi' : r.ready >= 40 ? 'mid' : 'lo'}" style="width:${Math.max(4, r.ready)}%"></span></span>
      <b class="${r.ready >= 70 ? 'ok' : r.ready >= 40 ? 'amber' : 'danger'}">${r.ready}%</b>
      <span class="nm">${esc(r.topic)}</span>
      ${r.fix ? `<span class="faint" style="margin-left:auto">fix → ${esc(r.fix.problem)} <span class="${r.fix.kind === 're-optimize' ? 'cyan' : 'amber'}">(${r.fix.kind})</span></span>`
        : `<span class="faint" style="margin-left:auto">${r.staleDays > 7 ? r.staleDays + 'd stale' : 'holding'}</span>`}
    </li>`).join('');

  const topicRows = topics.map(t => `
    <tr class="${t.lowData ? 'lowdata' : ''}">
      <td>${esc(t.topic)}${t.lowData ? ' <span class="faint" title="fewer than ' + MIN_ATTEMPTS_FOR_SCORE + ' Tier A attempts — neutral score until the log grows">(n&lt;${MIN_ATTEMPTS_FOR_SCORE})</span>' : ''}
        ${t.weakKind ? `<span class="${t.weakKind === 'approach-weak' ? 'danger' : 'amber'}" style="font-size:11px"
          title="R6 depth split: approach-weak = no working approach alone (${t.approachWeak}%), optimization-weak = optimal only with help (${t.optWeak}%)"> · ${esc(t.weakKind)}</span>` : ''}</td>
      <td>${t.attempts}</td>
      <td class="${t.soloRate == null ? 'faint' : t.soloRate >= 60 ? 'ok' : t.soloRate >= 40 ? 'amber' : 'danger'}">${t.soloRate == null ? '—' : t.soloRate + '%'}</td>
      <td>${t.avgMin == null ? '—' : t.avgMin + 'm'}</td>
      <td class="${t.flags ? 'danger' : 'faint'}">${t.flags ? '⚑ ' + t.flags : '·'}</td>
      <td>${t.bReps}${t.bLate ? ` <span class="amber" title="classified late (>2 min)">⏱${t.bLate}</span>` : ''}${t.bOver ? ` <span class="amber" title="over the ${TIERB_CEIL_MIN}-min ceiling">▲${t.bOver}</span>` : ''}</td>
    </tr>`).join('');

  root.innerHTML = `
    ${ready.length ? `<div class="panel">
      <h2>Readiness — interview-ready by topic <span class="right faint">solo-OPTIMAL, discounted for thin/stale data · least ready first · click a fix</span></h2>
      <ul class="probs readylist" id="readylist">${readyRows}</ul>
    </div>` : ''}
    <div class="panel">
      <h2>Weak topics — what Days 19–20 patch
        <span class="right muted" title="weakScore: accuracy-led (1 + (1−solo%)×2), flags and chronic slowness drift up; n<3 stays neutral. Constants reviewed at the Day 15–16 checkpoint.">${scored.length ? 'weakest first · by weakScore ⓘ' : ''}</span></h2>
      ${topics.length ? `
      <table class="logtbl topictbl">
        <tr><th>topic</th><th>A attempts</th><th>solo</th><th>avg</th><th>flags</th><th>B reps</th></tr>
        ${topicRows}
      </table>
      ${scored.length === 0 ? `<p class="muted" style="margin-top:8px">All topics are below ${MIN_ATTEMPTS_FOR_SCORE} attempts —
        scores stay neutral until the log grows. They sharpen daily.</p>` : ''}`
        : '<p class="muted">Nothing logged yet — the readout builds itself as you solve.</p>'}
      ${patches.length ? `
      <h2 style="margin-top:16px">Patch list — what Days 19–20 actually fix <span class="right faint">click → solve mode</span></h2>
      <ul class="probs" id="patchlist">
        ${patches.map((p, i) => `<li data-patch="${i}">
          <span class="st ${p.kind === 're-optimize' ? '' : p.flag ? 'danger' : 'amber'}">${p.kind === 're-optimize' ? '◇' : p.flag ? '⚑' : 'H'}</span>
          <span class="nm">${esc(p.problem)}</span>
          <span class="${p.kind === 're-optimize' ? 'cyan' : 'amber'}" style="font-size:11px;margin-left:8px">${esc(p.kind)}</span>
          <span class="faint" style="margin-left:auto">${esc(p.topic)}</span></li>`).join('')}
      </ul>
      <p class="faint" style="margin-top:4px">re-learn = the approach never came alone · re-optimize = optimal reached, but only with help (the gap pile)</p>` : ''}
      ${gaps.length ? `
      <h2 style="margin-top:16px">Gap list — optimal reached, but not alone <span class="right faint">the named trick is the whole distance · click → solve mode</span></h2>
      <ul class="probs" id="gaplist">
        ${gaps.map((g, i) => {
          const canon = problemInfo(g.problem)?.pattern; // fallback when the AI layer hasn't landed
          const insight = g.trick
            ? `<span class="ailayer" style="margin:0 0 0 10px;padding:2px 8px;font-size:12px"><span class="ailabel" style="display:inline;margin-right:6px">AI</span>${esc(g.trick)}</span>`
            : canon ? `<span class="pchip" style="margin-left:10px" title="canonical pattern (trigger bank) — the AI trick refines this once it lands">${esc(canon)}</span>`
            : '<span class="faint" style="margin-left:10px">trick arrives with the card\'s AI layer</span>';
          return `<li data-gap="${i}">
          <span class="st">◇</span>
          <span class="nm">${esc(g.problem)}</span>${insight}
          <span class="faint" style="margin-left:auto">${esc(g.source || '')} · ${esc(g.topic)}</span></li>`;
        }).join('')}
      </ul>` : ''}
      ${(App.state.candidates || []).length ? `
      <h2 style="margin-top:16px">Tier A candidates — ✗-graded reps you queued <span class="right faint">a suggestion pile, never the quota</span></h2>
      <ul class="probs" id="candlist">
        ${App.state.candidates.map((c, i) => `<li data-cand="${i}">
          <span class="st">▲</span><span class="nm">${esc(c.problem)}</span>
          <span class="faint" style="margin-left:auto">${esc(c.from || '')} · ${esc(c.date || '')}</span>
          <button class="del" data-canddel="${i}" title="dismiss">✕</button></li>`).join('')}
      </ul>` : ''}
    </div>
    ${traps.n ? `<div class="panel">
      <h2>Trap ledger — what actually bit you
        <span class="right faint">canonical traps from problems you flagged/missed · retrospective, no pre-solve spoilers</span></h2>
      ${traps.chips.length ? `<div class="trapchips">
        ${traps.chips.map(c => `<span class="trapchip">${esc(c.label)} <b>×${c.count}</b></span>`).join('')}
      </div>` : ''}
      <ul class="traplist">
        ${trapShown.map(it => `<li>
          <div class="trapline"><span class="st amber">✗</span><span class="nm">${esc(it.problem)}</span>
            <span class="faint" style="margin-left:auto">${esc(it.why)} · ${esc(it.topic)} · ${esc(it.date)}</span></div>
          <div class="traptext">${esc(it.trap)}</div></li>`).join('')}
      </ul>
      ${traps.n > trapShown.length ? `<p class="faint" style="margin-top:6px">+${traps.n - trapShown.length} more — the full set lives in the log below.</p>` : ''}
    </div>` : ''}
    <div class="panel">
      <h2>Solve log <span class="right muted">${rows.length} rows ·
        Tier A solo rate <b class="${soloRate >= 60 ? 'ok' : 'amber'}">${soloRate}%</b> ·
        <span class="danger">⚑ ${flagged}</span> flagged for Day 19–20 ·
        <button id="csvdl" style="padding:1px 10px;font-size:11px">EXPORT CSV</button>
        <button id="csvcopy" style="padding:1px 10px;font-size:11px">copy CSV</button></span></h2>
      ${rows.length ? `
      <table class="logtbl">
        <tr><th>date</th><th>day</th><th>problem</th><th>tier</th><th>outcome</th><th>min</th><th>flag</th><th>classification</th><th></th></tr>
        ${rows.map(r => {
          const overCeil = r.tier === 'B' && r.minutes > TIERB_CEIL_MIN;
          return `
          <tr class="${r.flag ? 'flagged' : ''}">
            <td class="faint">${esc(r.date)}</td>
            <td>${r.day ?? ''}</td>
            <td>${esc(r.problem)}</td>
            <td class="muted">${esc(r.tier)}</td>
            <td class="outcome-${esc(r.outcome)}">${esc(r.outcome)}${r.upsolve ? ` <span style="color:var(--cyan)" title="contest upsolve (${esc(r.source || 'contest')}) — not a sheet attempt">⚡</span>` : ''}${r.outcome === 'resolve' ? (r.beat ? ' <span class="ok" title="blank re-solve — beat the clock">✓</span>' : ' <span class="amber" title="blank re-solve — did not finish in time">✗</span>') : ''}${r.classified_in_time === false ? ' <span class="amber" title="pattern not named within 2 minutes">⏱</span>' : ''}${Laws.pauseMarker(r) ? ` <span class="pausemark" title="heavy pause: ${r.pause_count || 0} pauses, ${r.paused_minutes || 0} paused min — information, not judgment (R1)">⏸</span>` : ''}</td>
            <td class="${overCeil ? 'amber' : ''}" ${overCeil ? `title="over the ${TIERB_CEIL_MIN}-min recognition ceiling"` : ''}>${r.minutes ?? '—'}${overCeil ? '▲' : ''}</td>
            <td class="danger">${r.flag ? '⚑' : ''}</td>
            <td class="faint">${esc(r.classification ?? '')}</td>
            <td><button class="del" data-del="${esc(r.id)}" title="delete row">✕</button></td>
          </tr>`;
        }).join('')}
      </table>` : `<p class="muted">Nothing logged yet. The first row lands this morning.</p>`}
      <p class="faint" style="margin-top:10px">Raw data: <code>data/log.json</code> — yours to read or hand-edit.</p>
    </div>`;

  root.querySelector('#patchlist')?.addEventListener('click', e => {
    const li = e.target.closest('li[data-patch]');
    if (!li) return;
    App.pending = { problem: patches[+li.dataset.patch].problem, tier: 'A' };
    location.hash = '#/solve';
  });

  root.querySelector('#readylist')?.addEventListener('click', e => {
    const li = e.target.closest('li[data-fix]');
    if (!li) return;
    App.pending = { problem: ready[+li.dataset.fix].fix.problem, tier: 'A' };
    location.hash = '#/solve';
  });

  root.querySelector('#gaplist')?.addEventListener('click', e => {
    const li = e.target.closest('li[data-gap]');
    if (!li) return;
    App.pending = { problem: gaps[+li.dataset.gap].problem, tier: 'A' };
    location.hash = '#/solve';
  });

  root.querySelector('#candlist')?.addEventListener('click', async e => {
    const del = e.target.closest('button[data-canddel]');
    if (del) {
      App.state.candidates.splice(+del.dataset.canddel, 1);
      await saveCandidates();
      rerender();
      return;
    }
    const li = e.target.closest('li[data-cand]');
    if (!li) return;
    App.pending = { problem: App.state.candidates[+li.dataset.cand].problem, tier: 'A' };
    location.hash = '#/solve'; // a full solve like any other — quota math untouched
  });

  root.querySelector('#csvdl')?.addEventListener('click', () => {
    const blob = new Blob([toCsv(App.state.log)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `project435-log-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  root.querySelector('#csvcopy')?.addEventListener('click', async e => {
    try {
      await navigator.clipboard.writeText(toCsv(App.state.log));
      e.target.textContent = 'copied ✓';
    } catch {
      prompt('Copy the CSV:', toCsv(App.state.log));
    }
  });

  root.querySelector('.logtbl:not(.topictbl)')?.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-del]');
    if (!btn) return;
    const row = App.state.log.find(r => r.id === btn.dataset.del);
    if (!row) return;
    if (!confirm(`Delete the ${row.tier === 'B' ? 'recognition' : row.outcome} row for "${row.problem}"?`)) return;
    await deleteLog(row.id);
    rerender();
  });
}
