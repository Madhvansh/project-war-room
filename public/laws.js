// WAR ROOM — laws.js: the Regime 1 engine. MISSION.md §3 + curriculum.json
// rules, and nothing else, live here as pure functions (no DOM, no fetch, no
// globals) so the browser and `npm test` (scripts/laws.mjs) audit the same code.
// If code and data disagree, the data wins.

export const OUTCOME_RANK = { solo: 3, hint: 2, editorial: 1, abandoned: 0, recognized: 0, resolve: 0 };
export const COMPLETIONS = new Set(['solo', 'hint', 'editorial']);

// §3.1 solve protocol ceilings (minutes; CARD_SEC in seconds)
export const SOLO_MIN = 10, CEIL_MIN = 35, REIMPL_MIN = 15, DEBUG_MIN = 10, CARD_SEC = 60;
// §3.2 recognition ceilings (minutes)
export const TIERB_CEIL_MIN = 7, TIERB_CLASSIFY_MIN = 2;
// R1 pause [author-authorized 2026-06-12]: a 30+ minute pause offers
// abandon-to-overflow; >10 paused minutes or 3+ pauses earns a NEUTRAL ⏸
// marker on the log row (information, never judgment)
export const PAUSE_ABANDON_MIN = 30, PAUSE_MARK_MIN = 10, PAUSE_MARK_COUNT = 3;
// R2 [author-authorized 2026-06-12]: the minute-10 gate asks "Do you have ANY
// working approach?" (brute counts); a NON-GATING cue fires at minute 20 when
// an approach is banked: "brute banked — hunt optimal."
export const OPTIMAL_CUE_MIN = 20;

// R1: timers distinguish SOLVE time from PAUSED time. Every gate — the
// 10-minute checkpoint, the 35-minute ceiling, the 7-minute Tier B ceiling,
// the 2-minute classify sub-timer — fires on solve time ONLY.
export function pausedMs(s, now = Date.now()) {
  return (s.pausedMs || 0) + (s.pausedAt ? Math.max(0, now - s.pausedAt) : 0);
}
export function solveElapsedMin(s, now = Date.now()) {
  return Math.max(0, now - s.startTs - pausedMs(s, now)) / 60000 * (s.speed || 1);
}
export function pausedMin(s, now = Date.now()) {
  return pausedMs(s, now) / 60000 * (s.speed || 1);
}
export function pauseMarker(row) {
  return (row.paused_minutes || 0) > PAUSE_MARK_MIN || (row.pause_count || 0) >= PAUSE_MARK_COUNT;
}
// §3.5 bad-day protocol: "trim tomorrow Tier B by 3"
export const BAD_DAY_TRIM = 3;
// §3.7 odd-day timed blank re-solves [user ruling 2026-06-11]
export const RESOLVE_MIN = 20;
// §3.8 nightly review: "plus 10 random older cards"
export const REVIEW_RANDOM_OLD = 10;

export function parseHM(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + m;
}

// ── §3.9 the credit rule [R5, author-authorized 2026-06-12] ──────────────────
// dayNumber is a pure function of the IST date vs the curriculum dates — there
// is no counter anywhere. Every completion credits exactly ONE day's quota:
// its forDay target if that day was today or future at completion time,
// otherwise the day it really happened. Sealed (past) day results are
// immutable: credit routing can never reach a past date, and a sealed
// snapshot outranks any later log evidence.
export function istDate(ts = Date.now(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(ts);
}

export function creditDate(row) {
  return (row.forDay && row.forDay >= row.date) ? row.forDay : row.date;
}

// the frozen end-of-day snapshot, stored at days[date].sealed once the IST
// date has passed (the server writes it; sealDay only computes it)
export function sealDay(cur, state, dateStr) {
  const q = effectiveQuota(cur, state, dateStr);
  return {
    won: isWonLive(cur, state, dateStr),
    a: completedA(state.log, dateStr).size + contestCredit(cur, state, dateStr),
    b: recognizedB(state.log, dateStr).size,
    quotaA: q?.a ?? 0, quotaB: q?.b ?? 0, ts: Date.now()
  };
}

// ── status maps from the append-only log ─────────────────────────────────────
export function problemStatus(log) {
  const map = new Map();
  for (const r of log) {
    const prev = map.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]) map.set(r.problem, r);
  }
  return map;
}

// Block 4 re-solves (outcome 'resolve') and Block 0 upsolves (upsolve: true)
// never count toward the day's Tier A quota — only sheet solves do.
// Rows count toward the day they CREDIT (§3.9), not the day they happened.
export function completedA(log, dateStr) {
  const set = new Set();
  for (const r of log)
    if (creditDate(r) === dateStr && r.tier === 'A' && COMPLETIONS.has(r.outcome) && !r.upsolve)
      set.add(r.problem);
  return set;
}

export function recognizedB(log, dateStr) {
  const map = new Map(); // problem -> row id
  for (const r of log)
    if (creditDate(r) === dateStr && r.tier === 'B' && r.outcome === 'recognized') map.set(r.problem, r.id);
  return map;
}

// ── §3.3 the overflow engine ─────────────────────────────────────────────────
// Every Tier A problem from a day before todayDayN with no completion outcome.
// Nothing is ever silently dropped.
export function overflowQueue(cur, log, todayDayN) {
  const status = problemStatus(log);
  const out = [];
  for (const d of cur.days) {
    if (d.day >= todayDayN) break;
    for (const p of d.tierA || []) {
      const st = status.get(p);
      if (!st || !COMPLETIONS.has(st.outcome)) out.push({ problem: p, fromDay: d.day });
    }
  }
  return out;
}

// ── quota floors (curriculum rules.tier_quota_floors) ───────────────────────
export function baseQuota(cur, entry) {
  const f = cur.rules.tier_quota_floors;
  const dpGraph = entry.phase === 'DP completion' || entry.phase === 'Graphs';
  return {
    a: Math.min(dpGraph ? f.tierA_dp_graph_days : f.tierA_per_day, (entry.tierA || []).length),
    b: Math.min(f.tierB_per_day, (entry.tierB || []).length)
  };
}

// Tier B never trims below min(3, items available), under any stack of
// bad-day + compression [user ruling 2026-06-11].
export function tierBFloor(entry) {
  return Math.min(3, (entry.tierB || []).length);
}

// ── §3.4 the sleep guard ─────────────────────────────────────────────────────
// Projects day end from the anchor; past the compress threshold it applies
// schedule_template.sleep_guard.compression_order — in that exact order, each
// step at most once, stopping as soon as the projection fits. The order tokens
// are data: trim_tierB_by_N / breaks_to_minimum_A_B_C / block4_to_Nmin.
// Step 1 frees TIERB_CEIL_MIN per trimmed problem (§3.2's 7-minute ceiling)
// [user ruling 2026-06-11]. Never touches B5 or sleep.
function limitTs(anchorTs, hm) {
  const d = new Date(anchorTs);
  const [h, m] = String(hm).split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function compressSchedule(cur, anchorTs, quotaB, floorB) {
  const tpl = cur.schedule_template;
  const blocks = tpl.blocks.map(b => ({ ...b, baseMinutes: b.minutes }));
  const steps = [];
  let trimmedB = 0;
  if (anchorTs == null) {
    // no stored anchor (day never started in-app): uncompressed, no crash
    return { blocks, steps, quotaB, trimmedB, projectedEnd: null, limit: null, over: false };
  }
  const limit = limitTs(anchorTs, tpl.sleep_guard.compress_when_projected_end_after);
  const end = () => anchorTs + blocks.reduce((s, b) => s + b.minutes, 0) * 60000;

  for (const token of tpl.sleep_guard.compression_order) {
    if (end() <= limit) break;
    let m;
    if ((m = token.match(/^trim_tierB_by_(\d+)$/))) {
      trimmedB = Math.min(+m[1], Math.max(0, quotaB - floorB));
      quotaB -= trimmedB;
      const b3 = blocks.find(b => b.id === 'B3');
      if (b3) b3.minutes = Math.max(0, b3.minutes - TIERB_CEIL_MIN * trimmedB);
    } else if ((m = token.match(/^breaks_to_minimum_(\d+)_(\d+)_(\d+)$/))) {
      const mins = [+m[1], +m[2], +m[3]];
      blocks.filter(b => /^(BREAK|LUNCH|DINNER)/.test(b.id))
        .forEach((b, i) => { if (mins[i] != null) b.minutes = Math.min(b.minutes, mins[i]); });
    } else if ((m = token.match(/^block4_to_(\d+)min$/))) {
      const b4 = blocks.find(b => b.id === 'B4');
      if (b4) b4.minutes = Math.min(b4.minutes, +m[1]);
    } else {
      continue; // unknown token: data may grow, code must not misapply it
    }
    steps.push(token);
  }
  return { blocks, steps, quotaB, trimmedB, projectedEnd: end(), limit, over: end() > limit };
}

// ── effective quota: base − yesterday's bad day (§3.5) − compression (§3.4) ──
export function effectiveQuota(cur, state, dateStr) {
  const entry = cur.days.find(d => d.date === dateStr);
  if (!entry) return null;
  const base = baseQuota(cur, entry);
  const floorB = Math.min(tierBFloor(entry), base.b);
  let b = base.b;
  const prev = cur.days.find(d => d.day === entry.day - 1);
  const badDayTrim = prev && state.days[prev.date]?.badDay
    ? Math.min(BAD_DAY_TRIM, Math.max(0, b - floorB)) : 0;
  b -= badDayTrim;
  const comp = compressSchedule(cur, state.days[dateStr]?.anchor ?? null, b, floorB);
  return { a: base.a, b: comp.quotaB, baseA: base.a, baseB: base.b, badDayTrim, compTrim: comp.trimmedB, comp };
}

// ── §3.6 contests ────────────────────────────────────────────────────────────
// "Contest's 4 problems credit that day's Tier A quota" — only once the
// contest is actually logged, and only where the calendar grants credits.
export function contestCredit(cur, state, dateStr) {
  const entry = cur.days.find(d => d.date === dateStr);
  if (!entry?.contest?.credits_tierA) return 0;
  return state.days[dateStr]?.contest?.logged ? entry.contest.credits_tierA : 0;
}

// §3.6 upsolve rule: the morning after ANY logged contest, Block 0 carries
// exactly ONE upsolve task — the first unsolved problem. With several
// contests logged the previous day, the pick is deterministic: the most
// recently logged one that has an unsolved problem ("solved everything"
// contributes nothing). Done once an upsolve row exists today.
export function upsolveTask(cur, state, dateStr) {
  const entry = cur.days.find(d => d.date === dateStr);
  if (!entry) return null;
  const prev = cur.days.find(d => d.day === entry.day - 1);
  if (!prev) return null;
  if (state.log.some(r => r.date === dateStr && r.upsolve)) return null;
  const rec = state.days[prev.date] || {};
  const logged = [rec.contest, rec.cfRound, rec.biweekly]
    .filter(c => c?.logged && c.firstUnsolved)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (!logged.length) return null;
  return { problem: logged[0].firstUnsolved, source: logged[0].name || 'contest' };
}

// §3.6 Codeforces gating: "Div 3/4 live (cap N rounds during Days A-B),
// Div 2 only Days C-D" — numbers parsed from the data, fallback 3 / 1-18 / 19-20.
export function canLogCfRound(cur, state, dateStr) {
  const entry = cur.days.find(d => d.date === dateStr);
  if (!entry) return { allowed: false, divs: [], used: 0, cap: 0 };
  const rules = cur.contests.codeforces.live_rules || '';
  const capM = rules.match(/cap\s*(\d+)\s*rounds?\s*during\s*Days?\s*(\d+)\s*-\s*(\d+)/i);
  const [cap, lo, hi] = capM ? [+capM[1], +capM[2], +capM[3]] : [3, 1, 18];
  const d2M = rules.match(/Div\s*2\s*only\s*(?:on\s*)?Days?\s*(\d+)\s*-\s*(\d+)/i);
  const [d2lo, d2hi] = d2M ? [+d2M[1], +d2M[2]] : [19, 20];
  if (entry.day >= d2lo && entry.day <= d2hi) {
    return { allowed: true, divs: ['Div 2'], used: 0, cap: Infinity };
  }
  let used = 0;
  for (const d of cur.days) {
    if (d.day < lo || d.day > hi) continue;
    if (state.days[d.date]?.cfRound) used++;
  }
  const already = !!state.days[dateStr]?.cfRound;
  return { allowed: already || used < cap, divs: ['Div 3', 'Div 4'], used, cap };
}

// ── §3.7 speed drill (Block 4) ───────────────────────────────────────────────
// Odd days: pick problems_per_session problems from the log solved ≥3 days
// ago — random but weighted toward flagged/hinted, deprioritizing ones
// already re-solved, deterministic for the whole day (date-seeded rand).
// Shortfall fills from the CF ladder [user ruling 2026-06-11]. Even days:
// the CF ladder itself.
export function speedDrillPick(cur, log, dateStr) {
  const entry = cur.days.find(d => d.date === dateStr);
  if (!entry) return null;
  const want = cur.contests.codeforces.ladder.problems_per_session ?? 2;
  if (entry.day % 2 === 0) return { mode: 'ladder', want };

  const cutoff = Date.parse(dateStr) - 3 * 864e5;
  const best = new Map(); // problem -> best completion row
  const resolvedEver = new Set(), resolvedToday = new Set();
  for (const r of log) {
    if (r.tier !== 'A') continue;
    if (r.outcome === 'resolve') {
      resolvedEver.add(r.problem);
      if (r.date === dateStr) resolvedToday.add(r.problem);
      continue;
    }
    if (!COMPLETIONS.has(r.outcome) || r.upsolve) continue;
    const prev = best.get(r.problem);
    if (!prev || OUTCOME_RANK[r.outcome] > OUTCOME_RANK[prev.outcome]) best.set(r.problem, r);
  }
  const pool = [];
  for (const [problem, r] of best) {
    if (Date.parse(r.date) > cutoff || resolvedToday.has(problem)) continue;
    const weak = r.flag || r.outcome === 'hint' || r.outcome === 'editorial';
    const weight = (weak ? 3 : 1) * (resolvedEver.has(problem) ? 1 : 2);
    pool.push({ problem, weight, firstMinutes: r.minutes, outcome: r.outcome, flag: !!r.flag });
  }
  // date-seeded LCG: the day's picks are stable across reloads, no persistence
  let seed = 0;
  for (const ch of dateStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const picks = [];
  while (picks.length < want && pool.length) {
    let t = rand() * pool.reduce((s, p) => s + p.weight, 0);
    let i = 0;
    while (i < pool.length - 1 && (t -= pool[i].weight) > 0) i++;
    picks.push(pool.splice(i, 1)[0]);
  }
  return { mode: 'resolve', want, picks, ladderFill: want - picks.length, minutes: RESOLVE_MIN };
}

// ── §3.5 the binary win condition ────────────────────────────────────────────
// WON iff the (possibly compressed) quota is met — hint usage irrelevant.
// Logged contest credits count toward Tier A (§3.6). A sealed day (§3.9)
// answers from its frozen snapshot, never from live recomputation.
function isWonLive(cur, state, dateStr) {
  const q = effectiveQuota(cur, state, dateStr);
  if (!q) return false;
  return completedA(state.log, dateStr).size + contestCredit(cur, state, dateStr) >= q.a
    && recognizedB(state.log, dateStr).size >= q.b;
}

export function isWonOn(cur, state, dateStr) {
  const sealed = state.days?.[dateStr]?.sealed;
  if (sealed) return !!sealed.won;
  return isWonLive(cur, state, dateStr);
}

// Past days are decided; today is decided early only by the bad-day close,
// which books an honest L (or W, if the quota was already met).
export function record(cur, state, today) {
  const decided = [];
  for (const d of cur.days) {
    if (d.date > today) break;
    if (d.date === today && !state.days[today]?.badDay) break;
    decided.push(isWonOn(cur, state, d.date));
  }
  let wins = 0, losses = 0, streak = 0;
  for (const w of decided) w ? wins++ : losses++;
  for (let i = decided.length - 1; i >= 0 && decided[i]; i--) streak++;
  if (!state.days[today]?.badDay && cur.days.some(d => d.date === today)
    && isWonOn(cur, state, today)) streak++;
  return { wins, losses, streak };
}

export function canPressBadDay(state, dateStr) {
  return !state.days[dateStr]?.badDay; // one press per day, maximum
}

// ── sheet progress ───────────────────────────────────────────────────────────
// Re-solves and contest upsolves are not sheet problems — they never move 435.
// Supplements (cur.supplements: off-sheet, kept, badged) are excluded from the
// count and the pace [Wave 4 item I, author-authorized 2026-06-12].
export function supplementSet(cur) {
  return new Set(cur.supplements || []);
}

export function sheetCount(cur, log) {
  const supp = supplementSet(cur);
  const touched = new Set();
  for (const r of log)
    if (r.outcome !== 'abandoned' && r.outcome !== 'resolve' && !r.upsolve && !supp.has(r.problem))
      touched.add(r.problem);
  return (cur.meta.baseline_done ?? 0) + touched.size;
}

// ── §3.8 nightly review deck — amended R7 [author-authorized 2026-06-12] ─────
// Today's new cards + missed cards resurfacing from the previous review + the
// old-card slots: Leitner-DUE cards first (✓ → 1/3/7-day spacing), random
// fill to the UNCHANGED cap; ✗ → tomorrow + box reset (subsumes the old
// miss-resurfacing guarantee — the missed list remains the primary carrier).
// Box state lives at reviews._leitner[cardId] = { box, due } and applies
// uniformly to B-cards [amendment]. rand is injectable for the audit.
export const LEITNER_DAYS = [1, 3, 7];

export function leitnerNext(prev, got, dateStr) {
  const box = got ? Math.min(LEITNER_DAYS.length, (prev?.box || 0) + 1) : 1;
  const due = new Date(Date.parse(dateStr) + LEITNER_DAYS[box - 1] * 864e5)
    .toISOString().slice(0, 10);
  return { box, due };
}

export function buildReviewDeck(cards, reviews, dateStr, rand = Math.random) {
  const today = cards.filter(c => c.date === dateStr);
  const ids = new Set(today.map(c => c.id));
  const prevDates = Object.keys(reviews).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < dateStr).sort();
  const lastPrev = prevDates[prevDates.length - 1];
  const missedIds = new Set(lastPrev ? reviews[lastPrev].missed || [] : []);
  const missed = cards.filter(c => missedIds.has(c.id) && !ids.has(c.id));
  for (const c of missed) ids.add(c.id);
  const lt = reviews._leitner || {};
  const due = [], rest = [];
  for (const c of cards) {
    if (c.date >= dateStr || ids.has(c.id)) continue;
    (lt[c.id]?.due && lt[c.id].due <= dateStr ? due : rest).push(c);
  }
  const old = [];
  while (old.length < REVIEW_RANDOM_OLD && due.length)
    old.push(due.splice(Math.floor(rand() * due.length), 1)[0]);
  while (old.length < REVIEW_RANDOM_OLD && rest.length)
    old.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  const deck = [
    ...today.map(card => ({ card, why: 'today' })),
    ...missed.map(card => ({ card, why: 'missed' })),
    ...old.map(card => ({ card, why: lt[card.id]?.due && lt[card.id].due <= dateStr ? 'due' : 'random' }))
  ];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ── rules.dp_keep_warm: days 1–5, rotate the listed DP problems ──────────────
export function dpKeepWarm(cur, dayN) {
  const rule = cur.rules.dp_keep_warm || '';
  const range = rule.match(/Days?\s*(\d+)\s*-\s*(\d+)/i);
  const [lo, hi] = range ? [+range[1], +range[2]] : [1, 5];
  if (dayN < lo || dayN > hi) return null;
  const list = rule.match(/\(([^)]+?)(?:\s*-\s*rotate)?\)/i);
  const problems = list ? list[1].split(',').map(s => s.trim()).filter(Boolean)
    : ['climbing stairs', 'frog jump', 'grid paths'];
  const minutes = +(rule.match(/(\d+)-minute/)?.[1] ?? 15);
  return { problem: problems[(dayN - lo) % problems.length], minutes };
}
