// End-of-sprint report — curriculum day-20 note: "total solves, solo rate,
// average solve time curve, topic radar, the 77 to 435 arc." Renders live any
// day (numbers grow into it); Days 19–20 it is the deliverable. SAVE AS PNG
// banks the headline card into the receipts.
import { App, esc, todayStr, record } from '../app.js';
import { reportData, MIN_ATTEMPTS_FOR_SCORE } from '../stats.js';
import { success } from '../audio.js';

const NS = 'http://www.w3.org/2000/svg';

function arcSvg(p) { // the 77 → 435 arc, full width
  const W = 560, H = 220, padL = 40, padB = 22, padT = 12, padR = 14, yMin = 50;
  const x = day => padL + (W - padL - padR) * day / 20;
  const y = v => padT + (H - padT - padB) * (1 - (v - yMin) / (435 - yMin));
  const target = p.days.map(d => `${x(d.day)},${y(d.target)}`).join(' ');
  const actual = p.days.filter(d => d.actual != null).map(d => `${x(d.day)},${y(d.actual)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="pacesvg big" role="img">
    <text x="2" y="${y(435) + 4}" class="axis">435</text>
    <text x="2" y="${y(p.baseline) + 4}" class="axis">${p.baseline}</text>
    ${[5, 10, 15, 18, 20].map(d => `<text x="${x(d) - 8}" y="${H - 6}" class="axis">D${d}</text>`).join('')}
    <line x1="${x(18)}" y1="${padT}" x2="${x(18)}" y2="${H - padB}" class="d18line"/>
    <polyline points="${target}" class="targetline"/>
    ${actual ? `<polyline points="${actual}" class="actualline"/>` : ''}
  </svg>`;
}

function curveSvg(curve) { // average solve-time per day
  const pts = curve.filter(c => c.avg != null);
  if (!pts.length) return '<p class="faint">no timed Tier A attempts yet.</p>';
  const W = 560, H = 160, padL = 34, padB = 20, padT = 10, padR = 14;
  const maxAvg = Math.max(35, ...pts.map(c => c.avg));
  const x = day => padL + (W - padL - padR) * day / 20;
  const y = v => padT + (H - padT - padB) * (1 - v / maxAvg);
  return `<svg viewBox="0 0 ${W} ${H}" class="pacesvg" role="img">
    <text x="2" y="${y(35) + 4}" class="axis">35m</text>
    ${[5, 10, 15, 20].map(d => `<text x="${x(d) - 8}" y="${H - 6}" class="axis">D${d}</text>`).join('')}
    <line x1="${padL}" y1="${y(35)}" x2="${W - padR}" y2="${y(35)}" class="d18line"/>
    <polyline points="${pts.map(c => `${x(c.day)},${y(c.avg)}`).join(' ')}" class="actualline"/>
    ${pts.map(c => `<circle cx="${x(c.day)}" cy="${y(c.avg)}" r="2.5" class="actualdot"/>`).join('')}
  </svg>`;
}

function radarSvg(axes) { // top-8 topics by attempts, axis = solo%
  if (axes.length < 3) return `<p class="faint">the radar needs 3+ topics with attempts — it fills in as the sprint moves.</p>`;
  const W = 360, H = 320, cx = W / 2, cy = H / 2 + 6, R = 104;
  const pt = (i, frac) => {
    const a = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
    return [cx + Math.cos(a) * R * frac, cy + Math.sin(a) * R * frac];
  };
  const ring = f => `<polygon points="${axes.map((_, i) => pt(i, f).join(',')).join(' ')}" class="radarring"/>`;
  const shape = axes.map((t, i) => pt(i, Math.max(0.06, t.soloRate / 100)).join(',')).join(' ');
  const labels = axes.map((t, i) => {
    const [lx, ly] = pt(i, 1.22);
    const short = t.topic.length > 16 ? t.topic.slice(0, 15) + '…' : t.topic;
    return `<text x="${lx}" y="${ly}" class="axis" text-anchor="middle">${esc(short)}${t.lowData ? ' (n<' + MIN_ATTEMPTS_FOR_SCORE + ')' : ''}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="radarsvg" role="img" aria-label="topic radar — solo rate">
    ${[0.25, 0.5, 0.75, 1].map(ring).join('')}
    ${axes.map((_, i) => { const [ax, ay] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${ax}" y2="${ay}" class="radarring"/>`; }).join('')}
    <polygon points="${shape}" class="radarshape"/>
    ${labels}
  </svg>`;
}

export function renderReport(root) {
  const today = todayStr();
  const d = reportData(App.cur, App.state, today);
  const rec = record();
  const stat = (label, value, cls = '') => `<div class="bigstat">
    <div class="bsv ${cls}">${value}</div><div class="bsl">${label}</div></div>`;

  root.innerHTML = `
    <div class="panel">
      <h2>End-of-sprint report — the 77 → 435 arc
        <span class="right"><button class="primary" id="reppng" style="padding:2px 12px;font-size:12px">SAVE AS PNG ▸</button></span></h2>
      <div class="bigstats">
        ${stat('sheet', `${d.pace.sheet}/435`)}
        ${stat('Tier A attempts', d.totalAttempts)}
        ${stat('solo rate', d.soloRate == null ? '—' : d.soloRate + '%', d.soloRate >= 60 ? 'ok' : 'amber')}
        ${stat('Tier B reps', d.bReps)}
        ${stat('record', `${rec.wins}W–${rec.losses}L`)}
        ${stat('flag pool', `⚑ ${d.flaggedRemaining.length}`, d.flaggedRemaining.length ? 'amber' : 'ok')}
      </div>
      <table class="logtbl" style="margin-top:12px;max-width:420px">
        <tr><th>week</th><th>attempts</th><th>solo rate</th></tr>
        ${d.byWeek.map(w => `<tr><td>week ${w.week}</td><td>${w.attempts}</td>
          <td class="${w.soloRate == null ? 'faint' : w.soloRate >= 60 ? 'ok' : 'amber'}">${w.soloRate == null ? '—' : w.soloRate + '%'}</td></tr>`).join('')}
      </table>
    </div>
    <div class="cols">
      <div>
        <div class="panel"><h2>The 435 line vs actual</h2>${arcSvg(d.pace)}</div>
        <div class="panel"><h2>Average solve time by day <span class="right faint">the 35-min line is the law</span></h2>${curveSvg(d.curve)}</div>
        ${d.contests.length ? `<div class="panel"><h2>Contests</h2><ul class="probs">
          ${d.contests.map(c => `<li style="cursor:default"><span class="st">⚔</span>
            <span class="nm">${esc(c.name)}</span><span class="faint" style="margin-left:auto">${esc(c.date)} · ${c.solved ?? '?'} solves</span></li>`).join('')}
        </ul></div>` : ''}
      </div>
      <div>
        <div class="panel"><h2>Topic radar — solo rate</h2>${radarSvg(d.radar)}</div>
        ${d.mocks.length ? `<div class="panel"><h2>Mocks</h2><ul class="probs">
          ${d.mocks.map(m => `<li style="cursor:default"><span class="st ${m.solved >= 3 ? 'ok' : 'amber'}">${m.solved}/${m.total}</span>
            <span class="nm">${new Date(m.ts).toLocaleDateString()}</span><span class="faint" style="margin-left:auto">${m.usedMin ?? '—'}m</span></li>`).join('')}
        </ul></div>` : ''}
        ${d.flaggedRemaining.length ? `<div class="panel"><h2 class="danger">Flag pool — still not solo</h2><ul class="probs">
          ${d.flaggedRemaining.slice(0, 12).map(p => `<li style="cursor:default"><span class="st danger">⚑</span><span class="nm">${esc(p)}</span></li>`).join('')}
          ${d.flaggedRemaining.length > 12 ? `<li style="cursor:default"><span class="faint">+ ${d.flaggedRemaining.length - 12} more</span></li>` : ''}
        </ul></div>` : ''}
      </div>
    </div>`;

  root.querySelector('#reppng').addEventListener('click', async e => {
    const cv = drawReportCard(d, rec);
    await fetch('/api/evidence', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: `report-${today}`, png: cv.toDataURL('image/png') })
    }).catch(() => {});
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `project435-report-${today}.png`;
    a.click();
    success();
    e.target.textContent = 'SAVED ✓';
  });
}

function drawReportCard(d, rec) {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const MONO = px => `${px}px Consolas, "Cascadia Code", monospace`;
  const BOLD = px => `bold ${px}px Consolas, "Cascadia Code", monospace`;
  x.fillStyle = '#0b0e13'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#46c46e'; x.fillRect(0, 0, W, 6);
  x.fillStyle = '#e5484d'; x.font = BOLD(36); x.fillText('WAR ROOM', 48, 84);
  x.fillStyle = '#7d8a9c'; x.font = MONO(24); x.textAlign = 'right';
  x.fillText(`${todayStr()}  ·  SPRINT REPORT`, W - 48, 84); x.textAlign = 'left';
  x.fillStyle = '#d7dde7'; x.font = BOLD(150);
  x.fillText(String(d.pace.sheet), 42, 300);
  const bw = x.measureText(String(d.pace.sheet)).width;
  x.fillStyle = '#4a5568'; x.font = BOLD(60); x.fillText('/435', 50 + bw, 300);
  x.fillStyle = '#7d8a9c'; x.font = MONO(22);
  x.fillText(`the ${d.pace.baseline} → 435 arc`, 50, 344);
  const rows = [
    ['TIER A ATTEMPTS', String(d.totalAttempts)],
    ['SOLO RATE', d.soloRate == null ? '—' : d.soloRate + '%'],
    ['TIER B REPS', String(d.bReps)],
    ['RECORD', `${rec.wins}W–${rec.losses}L`],
    ['FLAG POOL LEFT', `⚑ ${d.flaggedRemaining.length}`],
    ['MOCKS', d.mocks.map(m => `${m.solved}/${m.total}`).join('  ') || '—']
  ];
  let y = 180;
  for (const [k, v] of rows) {
    x.fillStyle = '#7d8a9c'; x.font = MONO(19); x.fillText(k, 700, y);
    x.fillStyle = '#d7dde7'; x.font = BOLD(26); x.textAlign = 'right';
    x.fillText(v, W - 60, y); x.textAlign = 'left';
    y += 52;
  }
  x.fillStyle = '#4a5568'; x.font = MONO(16);
  x.fillText('20-day sprint · Striver A2Z · interview-ready', 48, 600);
  x.textAlign = 'right'; x.font = BOLD(16);
  x.fillText('PROOF OF WORK', W - 48, 600); x.textAlign = 'left';
  return cv;
}
