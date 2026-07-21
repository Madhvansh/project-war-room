// Season-2 schedule compressor (Regime 2, additive) — the FROZEN laws.js
// compressSchedule only knows the §3.4 tokens (B3/B4/B5) and SKIPS unknown
// block ids, so the 5-track Season-2 day needs its own. The cut order protects
// the spine: trim System Design → CF-Ascent → DP-from-LC → Core-CS, then breaks,
// then the speed drill — NEVER the durability review (S5) or the DSA blocks
// (S0/S1/S2/S3). Pure; never imports or mutates laws.js.
export const S2_CUT_ORDER = [
  { id: 'SSYSD', to: 0, label: 'drop System Design' },
  { id: 'SCF', to: 0, label: 'drop CF-Ascent' },
  { id: 'SDP', to: 0, label: 'drop DP-from-LC' },
  { id: 'SCORECS', to: 0, label: 'drop Core-CS' },
  { id: 'SBREAK1', to: 10, label: 'trim break' },
  { id: 'SBREAK2', to: 10, label: 'trim break' },
  { id: 'S4', to: 25, label: 'trim speed drill' }
];
const NEVER = new Set(['S0', 'S1', 'S2', 'S3', 'S5', 'SLUNCH', 'SDINNER']);

function limitTs(tpl, anchorTs) {
  const hm = (tpl.sleep_guard_s2 || {}).compress_when_projected_end_after || '22:00';
  const [h, m] = String(hm).split(':').map(Number);
  const d = new Date(anchorTs); d.setHours(h, m, 0, 0); return d.getTime();
}

// Returns { blocks (with baseMinutes + possibly trimmed minutes), steps[],
// projectedEnd, over, limit }. anchorTs null → uncompressed T+ guide.
export function compressS2(tpl, anchorTs) {
  const blocks = (tpl.blocks || []).map(b => ({ ...b, baseMinutes: b.minutes }));
  const steps = [];
  if (anchorTs == null) return { blocks, steps, projectedEnd: null, over: false, limit: null };
  const limit = limitTs(tpl, anchorTs);
  const end = () => anchorTs + blocks.reduce((s, b) => s + b.minutes, 0) * 60000;
  for (const cut of S2_CUT_ORDER) {
    if (end() <= limit) break;
    if (NEVER.has(cut.id)) continue;
    const b = blocks.find(x => x.id === cut.id);
    if (!b || b.minutes <= cut.to) continue;
    b.minutes = cut.to;
    steps.push(cut.label);
  }
  return { blocks, steps, projectedEnd: end(), over: end() > limit, limit };
}
