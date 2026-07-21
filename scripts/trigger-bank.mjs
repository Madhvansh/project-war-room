// WAR ROOM — trigger bank generator (Wave 4 item J).
// Parses TUF+_435_Questions_Context.md (the sheet inventory) into exactly 435
// problems, generates the fixed answer key (trigger/pattern/trap/depth_tiers)
// via chunked, RESUMABLE headless `claude -p` calls on the subscription, maps
// every problem to its plan day LOCALLY (curriculum.json is ground truth — the
// model never decides law-adjacent fields), then assembles problems.json and
// SHEET_MAP.md. Curriculum supplements (off-sheet, badged) are appended as
// supplement:true entries; sheet entries are validated to be exactly 435.
//
// Usage:
//   node scripts/trigger-bank.mjs parse      # parse + validate only (no model)
//   node scripts/trigger-bank.mjs generate   # parse + run remaining chunks
//   node scripts/trigger-bank.mjs assemble   # build problems.json + SHEET_MAP.md
//   node scripts/trigger-bank.mjs            # all three
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DOC = path.join(ROOT, 'TUF+_435_Questions_Context.md');
const OUTDIR = path.join(ROOT, 'build', 'trigger-bank');
const CHUNK_SIZE = 20;
const MODEL = 'sonnet';
const FALLBACK_MODEL = 'claude-fable-5';
const TIMEOUT_MS = 300000;

const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'curriculum.json'), 'utf8'));
const docText = fs.readFileSync(DOC, 'utf8');
const docHash = crypto.createHash('sha256').update(docText).digest('hex').slice(0, 16);

// ── 1. deterministic parse of the sheet inventory ────────────────────────────
function parseDoc() {
  const topics = [];
  let topic = null, section = null;
  for (const line of docText.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/^## (\d+)\. (.+?) \((\d+) questions?\)\s*$/))) {
      topic = { n: +m[1], name: m[2], declared: +m[3], context: '', sections: [] };
      section = null;
      topics.push(topic);
    } else if (topic && (m = line.match(/^\*\*Context:\*\* (.+)$/))) {
      topic.context = m[1];
    } else if (topic && (m = line.match(/^### (\d+)\.(\d+) (.+) \((\d+)\)\s*$/))) {
      section = { id: `${m[1]}.${m[2]}`, name: m[3], declared: +m[4], items: [] };
      topic.sections.push(section);
    } else if (section && (m = line.match(/^\d+\. (.+?)\s*$/))) {
      section.items.push(m[1]);
    } else if (/^## (Overview|Verification Summary)/.test(line)) {
      topic = null; section = null;
    }
  }
  // validate every count the doc itself declares — before any model call
  const errs = [];
  let total = 0;
  for (const t of topics) {
    let tn = 0;
    for (const s of t.sections) {
      if (s.items.length !== s.declared)
        errs.push(`§${s.id} ${s.name}: parsed ${s.items.length}, doc declares ${s.declared}`);
      tn += s.items.length;
    }
    if (tn !== t.declared) errs.push(`topic ${t.n} ${t.name}: parsed ${tn}, doc declares ${t.declared}`);
    total += tn;
  }
  if (total !== 435) errs.push(`grand total parsed ${total}, want exactly 435`);
  if (errs.length) {
    console.error('PARSE VALIDATION FAILED:\n  ' + errs.join('\n  '));
    process.exit(1);
  }
  return { topics, total };
}

// ── 2. local plan-day mapping (curriculum.json is the ground truth) ──────────
const norm = s => String(s).toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/['’`]/g, '')
  .replace(/\blinked\s*lists?\b/g, 'll')        // curriculum says LL, the doc says Linked List
  .replace(/\bparanthesis\b/g, 'parenthesis')   // doc spelling
  .replace(/\bneighbors\b/g, 'neighbours')
  .replace(/\btwo\b/g, '2')
  .replace(/\b(i{1,3})\b/g, m => ({ i: '1', ii: '2', iii: '3' }[m]))
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// hand-curated claims where fuzzy matching cannot decide safely:
// curriculum item → the sheet problem(s) it covers (a unit may cover several)
const PLAN_MAP = {
  'Subset Sum Equals K': ['Subset sum equals to target'],
  'Coin Change (minimum coins)': ['Minimum coins'],
  'Minimum Insertions/Deletions to Convert String': ['Minimum insertions or deletions to convert string A to B'],
  'Left and Right View': ['Right/Left View of BT'],
  'Top and Bottom View': ['Top View of BT', 'Bottom view of BT'],
  'Print Root to Leaf Paths': ['Print root to leaf path in BT'],
  'Validate BST': ['Check if a tree is a BST or not'],
  'Kth Smallest Element in BST': ['Kth Smallest and Largest element in BST'],
  'Recover BST (two swapped nodes)': ['Correct BST with two nodes swapped'],
  '0/1 Matrix': ['Distance of nearest cell having one'],
  'Shortest Path in Binary Maze': ['Shortest Distance in a Binary Maze'],
  'City with Smallest Number of Neighbours': ['Find the city with the smallest number of neighbors'],
  "Kruskal's MST": ['Find the MST weight'],
  'Minimum Operations to Make Network Connected': ['Number of operations to make network connected'],
  "Prim's MST": ['MST theory'],
  'Disjoint Set Union - by size + path compression [COACHED]': ['Disjoint Set'],
  'Kth Largest Element in a Stream': ['Kth largest element in a stream of running integers'],
  'Heapify & Build-Heap (one unit)': ['Heapify Algorithm', 'Build heap from a given Array'],
  "Detect Cycle + Find Cycle Start (Floyd's)": ['Detect a loop in LL', 'Find the starting point in LL'],
  'Flatten Linked List': ['Flattening of LL'],
  'Find How Many Times Array Has Been Rotated': ['Find out how many times the array is rotated'],
  'Traversal block: inorder + preorder + postorder + level order':
    ['Inorder Traversal', 'Preorder Traversal', 'Postorder Traversal', 'Level Order Traversal'],
  'BFS and DFS implementation (adjacency list)': ['Traversal Techniques', 'Connected Components'],
  'Implement lower_bound and upper_bound from scratch': ['Lower Bound', 'Upper Bound'],
  'Square Root and Nth Root via BS': ['Find square root of a number', 'Find Nth root of a number'],
  'KMP / LPS Array (understand the failure function)': ['KMP Algorithm or LPS array'],
  'Sort an array of 0s 1s 2s (Dutch National Flag)': ["Sort an array of 0's 1's and 2's"],
  'Trie Implementation and Advanced Operations': ['Trie Implementation and Advanced Operations'],
  'Implement Trie': ['Trie Implementation and Operations']
};
const tokens = s => new Set(norm(s).split(' ').filter(Boolean));
function similarity(a, b) {
  if (norm(a) === norm(b)) return 1; // exact beats containment ("Second Largest" ≠ "Largest")
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const contain = inter === Math.min(A.size, B.size); // one name inside the other
  return contain ? 0.9 : inter / (A.size + B.size - inter); // else Jaccard
}

function curriculumItems() {
  const items = [];
  for (const d of cur.days)
    for (const [tier, list] of [['A', d.tierA || []], ['B', d.tierB || []]])
      for (const p of list)
        if (!/^ALL remaining|^Overflow-log/i.test(p)) items.push({ name: p, day: d.day, tier });
  return items;
}

// ITEM-driven matching: every curriculum item claims its best sheet problem
// (explicit PLAN_MAP claims outrank fuzzy ones; conflicts go to the higher
// score). Greedy problem→item matching let containment steal across topics
// ("Detect a loop in LL" once landed on a Graphs day) — never again.
function mapPlanDays(allProblems) {
  const items = curriculumItems();
  const suppSet = new Set((cur.supplements || []).map(norm));
  const roSet = new Set((cur.read_only || []).map(norm));
  const sheet = allProblems.filter(p => !p.supplement);
  const byNorm = new Map(sheet.map(p => [norm(p.canonical_name), p]));

  const claims = new Map(); // problem -> { item, score }
  const claim = (p, it, score) => {
    const prev = claims.get(p);
    if (!prev || score > prev.score) claims.set(p, { item: it, score });
  };
  const itemMatched = new Set();

  for (const it of items) {
    if (PLAN_MAP[it.name]) {
      for (const name of PLAN_MAP[it.name]) {
        const p = byNorm.get(norm(name));
        if (!p) { console.warn(`  PLAN_MAP: "${name}" not found on the sheet`); continue; }
        claim(p, it, 2); // explicit claims outrank everything
        itemMatched.add(it.name);
      }
      continue;
    }
    let best = null, bestScore = 0;
    for (const p of sheet) {
      for (const n of [p.canonical_name, ...(p.aliases || [])]) {
        const s = similarity(n, it.name);
        if (s > bestScore) { bestScore = s; best = p; }
      }
    }
    if (best && bestScore >= 0.75) {
      claim(best, it, bestScore);
      itemMatched.add(it.name);
    }
  }

  for (const p of allProblems) {
    const c = claims.get(p);
    if (p.supplement) {
      const home = cur.days.find(d => (d.tierA || []).includes(p.canonical_name) || (d.tierB || []).includes(p.canonical_name));
      p.plan_day = home?.day ?? 18;
      p.plan_tier = home && (home.tierA || []).includes(p.canonical_name) ? 'A' : 'B';
      p.matched_item = p.canonical_name;
    } else if (c) {
      p.plan_day = c.item.day;
      p.plan_tier = c.item.tier;
      p.matched_item = c.item.name;
    } else {
      p.plan_day = 18; // the Great Sweep catches everything unscheduled
      p.plan_tier = 'B';
      p.matched_item = null;
    }
    p.read_only = roSet.has(norm(p.canonical_name));
    if (!p.supplement && suppSet.has(norm(p.canonical_name)))
      console.warn(`  WARN: "${p.canonical_name}" matches a supplement name but is ON the sheet`);
  }
  const unmatched = items.filter(it =>
    !itemMatched.has(it.name) && !suppSet.has(norm(it.name)));
  return { unmatched };
}

// ── 3. chunked, resumable generation via headless claude -p ──────────────────
function buildChunks(topics) {
  const chunks = [];
  for (const t of topics) {
    let buf = [], bufSections = new Set();
    const flush = () => {
      if (!buf.length) return;
      chunks.push({
        id: `t${String(t.n).padStart(2, '0')}-c${chunks.filter(c => c.topic === t.name).length + 1}`,
        topic: t.name, context: t.context, sections: [...bufSections], items: buf
      });
      buf = []; bufSections = new Set();
    };
    for (const s of t.sections) {
      for (const it of s.items) {
        buf.push({ name: it, section: `${s.id} ${s.name}` });
        bufSections.add(`${s.id} ${s.name}`);
        if (buf.length >= CHUNK_SIZE) flush();
      }
    }
    flush();
  }
  return chunks;
}

function supplementChunk() {
  const byDay = new Map(cur.days.map(d => [d.day, d]));
  const items = [];
  for (const name of cur.supplements || []) {
    const home = cur.days.find(d => (d.tierA || []).includes(name) || (d.tierB || []).includes(name));
    items.push({ name, section: `supplement (Day ${home?.day ?? '?'} — ${home ? byDay.get(home.day).focus : 'unplaced'})` });
  }
  return {
    id: 'supplements', topic: 'Supplements (off-sheet)', sections: ['supplement'],
    context: 'Off-sheet problems kept in the 20-day plan for depth; badged, excluded from the 435 count.',
    items
  };
}

function chunkPrompt(chunk) {
  const list = chunk.items.map((it, i) => `${i + 1}. ${it.name}   [section: ${it.section}]`).join('\n');
  return `You are generating the canonical "trigger bank" for Project 435 — a fixed answer key of pattern cards for problems from Striver's A2Z / TUF+ DSA sheet. The user is a competitive programmer (C++). Be precise and use canonical CP vocabulary.

Output ONLY a JSON array (no markdown fences, no prose) with EXACTLY ${chunk.items.length} objects, one per input problem, in input order:
{
  "canonical_name": "<the input name, copied VERBATIM>",
  "aliases": ["alternative names: the LeetCode title if it exists there, common Striver/GfG phrasing, well-known abbreviations"],
  "trigger": "<ONE line: what in a problem statement screams this pattern>",
  "pattern": "<the pattern family, 2-6 words>",
  "trap": "<ONE line: the classic mistake or edge case that kills solutions>",
  "depth_tiers": [{"name": "...", "complexity": "O(...)"}],
  "link": "<canonical URL: the official leetcode.com problem URL if it exists there, else takeuforward.org or geeksforgeeks.org practice URL, else null>"
}

depth_tiers lists this problem's meaningful solution depths, shallowest first (usually 2-3: e.g. "brute", "better", "optimal" with the actual idea named, like "optimal (Moore's voting)"). For DYNAMIC PROGRAMMING problems use exactly these four stage names: "recursion", "memoization", "tabulation", "space-optimization" (drop space-optimization only if it does not exist for the problem). For theory/setup/read items use a single tier named "read" or "implemented".

Topic: ${chunk.topic}
Topic context: ${chunk.context}

Problems:
${list}`;
}

function runClaude(prompt, model) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;       // no-key rule — subscription auth only
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.CLAUDECODE;              // escape any nested Claude Code session
    delete env.CLAUDE_CODE_ENTRYPOINT;
    delete env.CLAUDE_CODE_SSE_PORT;
    const child = spawn('claude', [
      '-p', prompt, '--model', model, '--tools', '', '--no-session-persistence'
    ], { env, cwd: os.tmpdir(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const killer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timeout')); }, TIMEOUT_MS);
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => err += d);
    child.on('close', code => {
      clearTimeout(killer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(err.trim() || `exit ${code}`));
    });
    child.on('error', e => { clearTimeout(killer); reject(e); });
  });
}

function parseModelJson(raw, chunk) {
  const start = raw.indexOf('['), end = raw.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no JSON array in output');
  const arr = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(arr) || arr.length !== chunk.items.length)
    throw new Error(`got ${arr.length} entries, want ${chunk.items.length}`);
  const wanted = new Map(chunk.items.map(it => [norm(it.name), it]));
  for (const e of arr) {
    const hit = wanted.get(norm(e.canonical_name || ''));
    if (!hit) throw new Error(`unexpected canonical_name "${e.canonical_name}"`);
    e.canonical_name = hit.name; // enforce verbatim doc spelling
    e.sheet_section = hit.section;
    if (!e.trigger || !e.pattern || !e.trap) throw new Error(`empty card field on "${e.canonical_name}"`);
    if (!Array.isArray(e.depth_tiers) || !e.depth_tiers.length) throw new Error(`no depth_tiers on "${e.canonical_name}"`);
    if (!Array.isArray(e.aliases)) e.aliases = [];
    wanted.delete(norm(e.canonical_name));
  }
  if (wanted.size) throw new Error(`missing: ${[...wanted.values()].map(w => w.name).join(', ')}`);
  return arr;
}

async function generate(chunks) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const manifest = { docHash, chunkIds: chunks.map(c => c.id) };
  fs.writeFileSync(path.join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  let done = 0, ran = 0;
  for (const chunk of chunks) {
    const file = path.join(OUTDIR, `chunk-${chunk.id}.json`);
    if (fs.existsSync(file)) {
      try {
        const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (saved.docHash === docHash && Array.isArray(saved.entries) && saved.entries.length === chunk.items.length) {
          done++; continue; // resumable: valid chunk already on disk
        }
      } catch {}
    }
    let entries = null, lastErr = null;
    for (const model of [MODEL, MODEL, FALLBACK_MODEL]) {
      try {
        const raw = await runClaude(chunkPrompt(chunk), model);
        entries = parseModelJson(raw, chunk);
        fs.writeFileSync(file, JSON.stringify({ docHash, model, ts: Date.now(), entries }, null, 2));
        break;
      } catch (e) { lastErr = e; console.error(`  chunk ${chunk.id} via ${model}: ${e.message} — retrying`); }
    }
    if (!entries) { console.error(`  chunk ${chunk.id} FAILED: ${lastErr?.message}`); continue; }
    done++; ran++;
    console.log(`  chunk ${chunk.id} ✓ (${chunk.items.length} problems) — ${done}/${chunks.length}`);
  }
  console.log(`generate: ${done}/${chunks.length} chunks on disk (${ran} new this run)`);
  return done === chunks.length;
}

// ── 4. assembly: problems.json + SHEET_MAP.md ────────────────────────────────
function assemble(topics, chunks) {
  const all = [];
  for (const chunk of chunks) {
    const file = path.join(OUTDIR, `chunk-${chunk.id}.json`);
    if (!fs.existsSync(file)) { console.error(`assemble: missing chunk ${chunk.id} — run generate`); process.exit(1); }
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const e of saved.entries) {
      all.push({ ...e, topic: chunk.topic, supplement: chunk.id === 'supplements' });
    }
  }
  const sheet = all.filter(p => !p.supplement);
  // the doc legitimately reuses two names across sections (array vs recursion
  // version, concept vs theory) — disambiguate the later one with its section
  const seen = new Map();
  for (const p of sheet) {
    if (seen.has(p.canonical_name)) {
      const secName = p.sheet_section.replace(/^[\d.]+\s*/, '');
      p.aliases = [p.canonical_name, ...(p.aliases || [])];
      p.canonical_name = `${p.canonical_name} (${secName})`;
      console.log(`  disambiguated duplicate: "${p.canonical_name}"`);
    }
    seen.set(p.canonical_name, true);
  }
  const names = new Set(sheet.map(p => p.canonical_name));
  if (sheet.length !== 435 || names.size !== 435) {
    console.error(`assemble: ${sheet.length} sheet entries / ${names.size} unique — want 435/435`);
    process.exit(1);
  }
  const { unmatched } = mapPlanDays(all);
  if (unmatched.length) {
    console.warn(`assemble: ${unmatched.length} curriculum items matched NO sheet problem (alias gaps — fix by hand):`);
    for (const it of unmatched) console.warn(`    Day ${it.day} [${it.tier}] ${it.name}`);
  }
  const out = all.map(p => ({
    canonical_name: p.canonical_name, aliases: p.aliases, topic: p.topic,
    sheet_section: p.supplement ? null : p.sheet_section, plan_day: p.plan_day,
    plan_tier: p.plan_tier, matched_item: p.matched_item,
    supplement: !!p.supplement, read_only: !!p.read_only,
    trigger: p.trigger, pattern: p.pattern, trap: p.trap,
    depth_tiers: p.depth_tiers, link: p.link || null
  }));
  fs.writeFileSync(path.join(ROOT, 'problems.json'), JSON.stringify(out, null, 2));
  console.log(`problems.json: ${out.length} entries (${sheet.length} sheet + ${out.length - sheet.length} supplements)`);

  // SHEET_MAP.md — section ↔ plan day, both directions
  const lines = ['# SHEET_MAP — TUF+ sheet section ↔ plan day', '',
    `Generated ${new Date().toISOString().slice(0, 10)} from TUF+_435_Questions_Context.md (${docHash}) + curriculum.json.`, '',
    '## Sheet section → plan days', ''];
  for (const t of topics) {
    lines.push(`### ${t.n}. ${t.name}`);
    for (const s of t.sections) {
      const days = new Map();
      for (const p of out) {
        if (p.supplement || p.sheet_section !== `${s.id} ${s.name}`) continue;
        days.set(p.plan_day, (days.get(p.plan_day) || 0) + 1);
      }
      const span = [...days.entries()].sort((a, b) => a[0] - b[0])
        .map(([d, n]) => `Day ${d} (${n})`).join(', ');
      lines.push(`- §${s.id} ${s.name} [${s.items.length}] → ${span || '—'}`);
    }
    lines.push('');
  }
  lines.push('## Plan day → sheet sections', '');
  for (const d of cur.days) {
    const secs = new Map();
    for (const p of out) {
      if (p.plan_day !== d.day || p.supplement) continue;
      secs.set(p.sheet_section, (secs.get(p.sheet_section) || 0) + 1);
    }
    const span = [...secs.entries()].sort()
      .map(([s, n]) => `§${s} (${n})`).join(', ');
    lines.push(`- **Day ${d.day} — ${d.focus}**: ${span || '— (sweep/contest day)'}`);
  }
  const supp = out.filter(p => p.supplement);
  lines.push('', `## Supplements (off-sheet, badged, excluded from 435): ${supp.length}`, '');
  for (const p of supp) lines.push(`- ${p.canonical_name} → Day ${p.plan_day}`);
  fs.writeFileSync(path.join(ROOT, 'SHEET_MAP.md'), lines.join('\n') + '\n');
  console.log('SHEET_MAP.md written');
}

// ── main ─────────────────────────────────────────────────────────────────────
const mode = process.argv[2] || 'all';
const { topics, total } = parseDoc();
console.log(`parse: ${topics.length} topics, ${total} problems — validated against the doc's own counts (435 ✓)`);
for (const t of topics) console.log(`  ${String(t.n).padStart(2)}. ${t.name}: ${t.sections.reduce((s, x) => s + x.items.length, 0)}`);

const chunks = [...buildChunks(topics), supplementChunk()];
console.log(`chunks: ${chunks.length} (≤${CHUNK_SIZE} problems each, incl. 1 supplement chunk)`);

if (mode === 'parse') process.exit(0);
if (mode === 'generate' || mode === 'all') {
  const complete = await generate(chunks);
  if (!complete && mode === 'generate') process.exit(1);
}
if (mode === 'assemble' || mode === 'all') assemble(topics, chunks);
