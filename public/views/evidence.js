// Evidence card — §5.5. A shareable 1200×630 PNG in the war-paint theme:
// date, day N/20, today's work, the big sheet number, streak, honest record.
// This replaces the manual screenshot ritual and targets failure mode #3.
import {
  App, todayStr, displayDayN, preSprint, sheetCount, record, isWonOn, completedA, recognizedB, effQuota
} from '../app.js';
import { TIERB_CEIL_MIN } from '../laws.js';

const C = {
  bg: '#0b0e13', panel: '#11161f', line: '#232c3b', fg: '#d7dde7',
  dim: '#7d8a9c', faint: '#4a5568', red: '#e5484d', amber: '#f5a524',
  green: '#46c46e', cyan: '#4cc2ff'
};
const MONO = px => `${px}px Consolas, "Cascadia Code", monospace`;
const BOLD = px => `bold ${px}px Consolas, "Cascadia Code", monospace`;

export function todayEvidenceData() {
  const today = todayStr();
  const rows = App.state.log.filter(r => r.date === today);
  // sheet attempts only — re-solves/upsolves are tracked separately
  const a = rows.filter(r => r.tier === 'A' && r.outcome !== 'resolve' && !r.upsolve);
  const upsolveRow = rows.find(r => r.upsolve);
  const rec = App.state.days[today] || {};
  const contestLine = [rec.contest, rec.biweekly, rec.cfRound]
    .filter(c => c?.logged)
    .map(c => `${c.name}: ${c.solved} solves${c.firstUnsolved ? ' · upsolve queued' : ' · clean sweep'}`)
    .join('  ·  ');
  return {
    contestLine,
    date: today,
    warmup: preSprint(),
    dayN: displayDayN(),
    totalDays: App.cur.days.length,
    sheet: sheetCount(),
    baseline: App.cur.meta.baseline_done ?? 0,
    aDone: completedA(today).size,
    solo: a.filter(r => r.outcome === 'solo').length,
    hint: a.filter(r => r.outcome === 'hint').length,
    editorial: a.filter(r => r.outcome === 'editorial').length,
    bReps: recognizedB(today).size,
    upsolveDone: upsolveRow ? `${upsolveRow.problem} (${upsolveRow.source || 'contest'})` : null,
    flagged: App.state.log.filter(r => r.flag).length,
    ...record(),
    won: isWonOn(today),
    closed: !!App.state.days[today]?.badDay,
    dayLog: App.state.reviews[today]?.dayLog || ''
  };
}

export function drawEvidenceCard(d) {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');

  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  x.fillStyle = C.red; x.fillRect(0, 0, W, 6);

  // header
  x.fillStyle = C.red; x.font = BOLD(36);
  x.fillText('WAR ROOM', 48, 84);
  x.fillStyle = C.dim; x.font = MONO(24);
  x.textAlign = 'right';
  x.fillText(`${d.date}  ·  ${d.warmup ? 'WARM-UP' : `DAY ${d.dayN}/${d.totalDays}`}`, W - 48, 84);
  x.textAlign = 'left';

  // the big number
  x.fillStyle = C.fg; x.font = BOLD(180);
  x.fillText(String(d.sheet), 42, 330);
  const bigW = x.measureText(String(d.sheet)).width;
  x.fillStyle = C.faint; x.font = BOLD(66);
  x.fillText('/435', 50 + bigW, 330);
  x.fillStyle = C.dim; x.font = MONO(21);
  x.fillText('STRIVER A2Z — PROBLEMS TOUCHED', 50, 372);

  // progress bar with the day-0 baseline tick
  const bx = 48, by = 402, bw = 600, bh = 20;
  x.fillStyle = '#161d29'; x.fillRect(bx, by, bw, bh);
  x.strokeStyle = C.line; x.strokeRect(bx, by, bw, bh);
  x.fillStyle = C.red; x.fillRect(bx, by, bw * Math.min(d.sheet / 435, 1), bh);
  const tickX = bx + bw * d.baseline / 435;
  x.fillStyle = C.amber; x.fillRect(tickX - 1, by - 5, 2, bh + 10);
  x.fillStyle = C.faint; x.font = MONO(15);
  x.fillText(`start ${d.baseline}`, tickX - 30, by + bh + 24);

  // today's work, right column
  const rx = 740, vx = 1020;
  const row = (y, label, value, color = C.fg) => {
    x.fillStyle = C.dim; x.font = MONO(19);
    x.fillText(label, rx, y);
    x.fillStyle = color; x.font = BOLD(28);
    x.textAlign = 'right'; x.fillText(value, vx + 130, y); x.textAlign = 'left';
  };
  x.fillStyle = C.faint; x.font = MONO(16);
  x.fillText('— TODAY —', rx, 168);
  row(212, 'TIER A SOLVES', String(d.aDone));
  x.fillStyle = C.faint; x.font = MONO(16);
  x.fillText(`solo ${d.solo} · hint ${d.hint} · editorial ${d.editorial}${d.upsolveDone ? ' · upsolve ⚡' : ''}`, rx, 240);
  row(290, 'TIER B REPS', String(d.bReps));
  row(340, 'STREAK', d.streak > 0 ? `${d.streak}\u{1F525}` : '0', d.streak > 0 ? C.green : C.dim);
  row(390, 'RECORD', `${d.wins}W–${d.losses}L`);
  row(440, 'DAY 19–20 POOL', `⚑ ${d.flagged}`, d.flagged ? C.amber : C.dim);

  // the verdict badge — honest books, neutral copy
  const badge = d.warmup ? ['WARM-UP — SCOREBOARD STARTS DAY 1', C.cyan]
    : d.won ? ['DAY WON', C.green] : d.closed ? ['CLOSED — BAD DAY PROTOCOL', C.amber] : ['IN PLAY', C.dim];
  x.font = BOLD(26);
  const padX = 18, tw = x.measureText(badge[0]).width;
  const bxx = rx, bxy = 478, bxh = 48;
  x.strokeStyle = badge[1]; x.lineWidth = 2;
  x.strokeRect(bxx, bxy, tw + padX * 2, bxh);
  x.fillStyle = badge[1];
  x.fillText(badge[0], bxx + padX, bxy + 33);
  x.lineWidth = 1;

  // contest stamp — proof-days look like proof
  if (d.contestLine) {
    x.fillStyle = C.cyan; x.font = MONO(19);
    x.fillText(`⚔ ${d.contestLine}`, 48, 528);
  }
  // one-line day log
  if (d.dayLog) {
    x.fillStyle = C.dim; x.font = `italic ${MONO(20)}`;
    const line = d.dayLog.length > 86 ? d.dayLog.slice(0, 85) + '…' : d.dayLog;
    x.fillText(`“${line}”`, 48, 560);
  }
  x.fillStyle = C.faint; x.font = MONO(16);
  x.fillText('20-day sprint · 77 → 435', 48, 600);
  x.textAlign = 'right';
  x.fillStyle = C.faint; x.font = BOLD(16);
  x.fillText('PROOF OF WORK', W - 48, 600);
  x.textAlign = 'left';

  return cv;
}

export async function saveEvidence(canvas, date) {
  await fetch('/api/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, png: canvas.toDataURL('image/png') })
  });
}

export function downloadEvidence(canvas, date) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = `project435-day-${date}.png`;
  a.click();
}

export async function copyEvidence(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

// plain-text day summary, formatted for pasting straight to his Claude coach
export function daySummaryText() {
  const today = todayStr();
  const d = todayEvidenceData();
  const q = effQuota(today);
  const aRows = App.state.log.filter(r =>
    r.date === today && r.tier === 'A' && r.outcome !== 'resolve' && !r.upsolve);
  const mins = aRows.map(r => r.minutes).filter(m => typeof m === 'number');
  const avg = mins.length ? (mins.reduce((a, b) => a + b, 0) / mins.length).toFixed(1) : '—';
  const overB = App.state.log.filter(r =>
    r.date === today && r.tier === 'B' && r.minutes > TIERB_CEIL_MIN).length;
  const flaggedToday = App.state.log.filter(r => r.date === today && r.flag).map(r => r.problem);
  const lateB = App.state.log.filter(r =>
    r.date === today && r.tier === 'B' && r.classified_in_time === false).length;
  return [
    `WAR ROOM — ${d.warmup ? `warm-up night (${today}), day 0` : `Day ${d.dayN}/${d.totalDays} (${today})`} — ${d.warmup ? 'no quota' : d.won ? 'WON' : d.closed ? 'CLOSED (bad day protocol)' : 'in play'}${d.warmup ? '' : ` · quota A ${d.aDone}/${q?.a ?? '—'} · B ${d.bReps}/${q?.b ?? '—'}`}`,
    `Tier A: ${d.aDone} done — ${d.solo} solo · ${d.hint} hint · ${d.editorial} editorial · avg ${avg} min`,
    `Tier B: ${d.bReps} reps${overB ? ` · ${overB} over the ${TIERB_CEIL_MIN}-min ceiling` : ''}${lateB ? ` · ${lateB} classified late (>2 min)` : ''}`,
    `Flagged today: ${flaggedToday.length ? flaggedToday.join(', ') : 'none'}`,
    `Sheet: ${d.sheet}/435 · streak ${d.streak} · record ${d.wins}W–${d.losses}L · Day 19–20 pool ⚑${d.flagged}`,
    d.upsolveDone ? `Upsolve done: ${d.upsolveDone}` : '',
    d.contestLine ? `Contest: ${d.contestLine}` : '',
    d.dayLog ? `Day log: ${d.dayLog}` : ''
  ].filter(Boolean).join('\n');
}
