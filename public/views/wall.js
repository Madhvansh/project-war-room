// Evidence Wall — §5.5. Every fully-solo solve on a growing list, the 20-day
// solo heat strip, today's evidence card and the gallery of saved ones.
// Arriving with #/wall?evidence=1 (end of the Block 5 chain) auto-saves
// today's card — the screenshot ritual, replaced.
import { App, esc, todayStr } from '../app.js';
import {
  todayEvidenceData, drawEvidenceCard, saveEvidence, downloadEvidence, copyEvidence,
  daySummaryText
} from './evidence.js';
import { soloOptimalRate, recognitionStats, catchUpLedger } from '../stats.js';
import { success } from '../audio.js';

export function renderWall(root) {
  const solos = App.state.log
    .filter(r => r.tier === 'A' && r.outcome === 'solo')
    .sort((a, b) => b.ts - a.ts);

  const counts = new Map();
  for (const r of solos) counts.set(r.date, (counts.get(r.date) || 0) + 1);
  const cells = App.cur.days.map(d => {
    const n = counts.get(d.date) || 0;
    const lvl = n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : n >= 1 ? 1 : 0;
    return `<div class="heatcell h${lvl} ${d.date === todayStr() ? 'today' : ''}"
      title="day ${d.day} · ${esc(d.date)} · ${n} solo"></div>`;
  }).join('');

  root.innerHTML = `
    <div class="cols">
      <div>
        <div class="panel">
          <h2>Evidence wall — every fully-solo solve <span class="right muted">${solos.length} and counting</span></h2>
          ${(() => {
            const so = soloOptimalRate(App.state.log);
            return `<p style="margin-bottom:8px">SOLO-OPTIMAL <b class="${so.lowData ? '' : so.rate >= 50 ? 'ok' : 'amber'}">${so.rate ?? '—'}${so.rate != null ? '%' : ''}</b>
              <span class="faint">${so.lowData ? `(n=${so.n})` : `over ${so.n} depth-logged solves`} · the interview number: optimal tier, no help</span></p>`;
          })()}
          ${(() => {
            const cu = catchUpLedger(App.state.log, todayStr()); // idea 3: catch-up made visible
            return cu.total ? `<p class="faint makeupchip" style="margin-bottom:8px">🛠 make-up grind: <b class="ok">${cu.total}</b> missed-day problem${cu.total > 1 ? 's' : ''} cleared later${cu.week ? ` · ${cu.week} this week` : ''} across ${cu.daysTouched} day${cu.daysTouched > 1 ? 's' : ''} <span class="faint">— catch-up, credited honestly (§3.9)</span></p>` : '';
          })()}
          <div class="heatstrip">${cells}</div>
          ${solos.length ? `<ul class="probs" style="margin-top:12px">
            ${solos.map(r => `<li style="cursor:default"><span class="st solo">✓</span>
              <span class="nm">${esc(r.problem)}</span>
              <span class="faint" style="margin-left:auto;white-space:nowrap">${r.minutes ?? '—'}m · d${r.day ?? '—'}</span></li>`).join('')}
          </ul>` : '<p class="muted" style="margin-top:12px">The first solo solve lands here tomorrow. Watch this list grow.</p>'}
        </div>
        ${(() => {
          const rec = recognitionStats(App.state.log, todayStr());
          if (!rec.reps) return `<div class="panel"><h2>Recognition — the volume engine</h2>
            <p class="muted">The first Tier B rep lands here. This is the bulk of the work — it gets its own evidence.</p></div>`;
          const maxR = Math.max(1, ...rec.recent.map(d => d.reps));
          const bars = rec.recent.map(d =>
            `<span class="recogbar" title="${esc(d.date)} · ${d.reps} reps" style="height:${Math.round(d.reps / maxR * 38) + 4}px"></span>`).join('');
          const cls = p => p == null ? '' : p >= 70 ? 'ok' : p >= 45 ? 'amber' : 'danger';
          return `<div class="panel">
            <h2>Recognition — the volume engine <span class="right muted">${rec.reps} reps${rec.today ? ` · ${rec.today} today` : ''}</span></h2>
            <p style="margin-bottom:8px">
              named in time <b class="${cls(rec.inTimePct)}">${rec.inTimePct ?? '—'}${rec.inTimePct != null ? '%' : ''}</b>
              <span class="faint">(${rec.inTimeN})</span> ·
              recall <b class="ok">✓ ${rec.pass}</b> <b class="amber">~ ${rec.partial}</b> <b class="danger">✗ ${rec.fail}</b>
              <span class="faint">of ${rec.gradedN}</span></p>
            <div class="recogbars">${bars}</div>
            <p class="faint" style="margin-top:4px">reps over the last ${rec.recent.length} active day${rec.recent.length === 1 ? '' : 's'} · named-in-time = pattern inside the 2:00 sub-timer</p>
          </div>`;
        })()}
      </div>
      <div>
        <div class="panel">
          <h2>Evidence card — today</h2>
          <div id="evhost" class="evhost"></div>
          <div class="actions" style="justify-content:flex-start;margin-top:10px">
            <button class="primary" id="ev-save">SAVE + DOWNLOAD ▸</button>
            <button id="ev-copy">copy image</button>
            <button id="ev-text" title="plain-text day summary, ready to paste to Coach/Claude">copy day summary</button>
          </div>
        </div>
        <div class="panel">
          <h2>The receipts <span class="right"><a href="#/report">end-of-sprint report ▸</a></span></h2>
          <div id="evgallery" class="evgallery"><p class="muted">…</p></div>
        </div>
        <div class="panel" id="cfpanel" hidden>
          <h2>Codeforces — <span id="cfh"></span> <span class="right" id="cfnow"></span></h2>
          <div id="cfspark"></div>
        </div>
      </div>
    </div>`;

  const canvas = drawEvidenceCard(todayEvidenceData());
  canvas.style.width = '100%';
  canvas.style.height = 'auto';
  root.querySelector('#evhost').appendChild(canvas);

  const gallery = root.querySelector('#evgallery');
  const paintGallery = async () => {
    const files = await fetch('/api/evidence').then(r => r.json()).catch(() => []);
    gallery.innerHTML = files.length
      ? files.map(f => `<a href="/evidence/${esc(f)}" target="_blank" rel="noopener">
          <img src="/evidence/${esc(f)}" alt="${esc(f)}" title="${esc(f)}"></a>`).join('')
      : '<p class="muted">none yet — the first one saves tonight at review end.</p>';
  };

  const today = todayStr();
  (async () => {
    if (location.hash.includes('evidence=1')) { // end of the Block 5 ritual
      await saveEvidence(canvas, today);
      success();
    }
    paintGallery();
  })();

  // CF rating sparkline (Wave 4 feature 2) — the second scoreboard
  fetch('/api/cf').then(r => r.json()).then(cf => {
    if (!cf?.rating?.length) return;
    const panel = root.querySelector('#cfpanel');
    panel.hidden = false;
    root.querySelector('#cfh').textContent = cf.handle;
    const last = cf.rating[cf.rating.length - 1];
    const delta = cf.rating.length >= 2 ? last.newRating - cf.rating[cf.rating.length - 2].newRating : null;
    root.querySelector('#cfnow').innerHTML = `<b>${last.newRating}</b>${delta != null
      ? ` <span class="${delta >= 0 ? 'ok' : 'danger'}">(${delta >= 0 ? '+' : ''}${delta})</span>` : ''}${cf.stale ? ' <span class="amber">cached</span>' : ''}`;
    const pts = cf.rating.slice(-20);
    const lo = Math.min(...pts.map(p => p.newRating)) - 20, hi = Math.max(...pts.map(p => p.newRating)) + 20;
    const W = 320, H = 70;
    const xy = pts.map((p, i) => `${(i / Math.max(1, pts.length - 1)) * (W - 10) + 5},${H - 8 - (p.newRating - lo) / (hi - lo) * (H - 16)}`);
    root.querySelector('#cfspark').innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="CF rating sparkline">
        <polyline points="${xy.join(' ')}" fill="none" stroke="var(--cyan)" stroke-width="1.5"/>
        <circle cx="${xy[xy.length - 1].split(',')[0]}" cy="${xy[xy.length - 1].split(',')[1]}" r="2.5" fill="var(--cyan)"/>
      </svg>
      <p class="faint" style="margin-top:2px">${pts.length} rated rounds · last: ${esc(last.contest || '')}</p>`;
  }).catch(() => {});

  root.querySelector('#ev-save').addEventListener('click', async () => {
    await saveEvidence(canvas, today);
    downloadEvidence(canvas, today);
    paintGallery();
  });
  root.querySelector('#ev-copy').addEventListener('click', async e => {
    try {
      await copyEvidence(canvas);
      e.target.textContent = 'copied ✓';
    } catch {
      alert('Clipboard unavailable here — use SAVE + DOWNLOAD.');
    }
  });
  root.querySelector('#ev-text').addEventListener('click', async e => {
    try {
      await navigator.clipboard.writeText(daySummaryText());
      e.target.textContent = 'copied ✓';
    } catch {
      prompt('Copy the summary:', daySummaryText());
    }
  });
}
