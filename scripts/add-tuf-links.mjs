// Add deterministic TUF+ problem links to problems.json (Wave 4 follow-up).
// The trigger bank's canonical_name == the TUF+ display name (the doc was
// extracted from TUF+ screenshots), and a TUF+ slug is a slugify of that name
// with apostrophes KEPT. A few problems have hand-authored slug quirks that no
// rule can derive (trailing hyphen, possessive apostrophe dropped, an ad-hoc
// "Linked List"→"ll" abbreviation) — those live in SLUG_FIX, confirmed against
// the live site, and grow as 404s are reported. The link lands on the PROBLEM
// statement (no tab=editorial) so opening it before a solo attempt never
// spoils the solution. No model calls — pure, idempotent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(ROOT, 'problems.json');
const problems = JSON.parse(fs.readFileSync(FILE, 'utf8'));

export function tufSlug(name) {
  return String(name)
    .replace(/[''']/g, "'")                 // normalize curly apostrophes
    .replace(/\s*\([^)]*\)\s*$/, '')         // drop a trailing parenthetical (our dedupe suffix)
    .toLowerCase()
    .replace(/[^a-z0-9']+/g, '-')            // keep apostrophes; everything else → hyphen
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

// confirmed exceptions: default-slug → real-slug (verified on takeuforward.org)
const SLUG_FIX = {
  'maximum-path-sum': 'maximum-path-sum-',
  "topological-sort-or-kahn's-algorithm": 'topological-sort-or-kahns-algorithm',
  "sort-a-linked-list-of-0's-1's-and-2's": "sort-a-ll-of-0's-1's-and-2's"
};

export function tufLink(name) {
  let slug = tufSlug(name);
  slug = SLUG_FIX[slug] || slug;
  return `https://takeuforward.org/plus/dsa/problems/${slug}?subject=dsa&approach=brute`;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('add-tuf-links.mjs')) {
  let fixed = 0;
  for (const p of problems) {
    p.tuf_plus = tufLink(p.canonical_name);
    if (SLUG_FIX[tufSlug(p.canonical_name)]) fixed++;
  }
  fs.writeFileSync(FILE, JSON.stringify(problems, null, 2));
  console.log(`tuf_plus written to ${problems.length} entries (${fixed} via the override table).`);
  console.log('sample:');
  for (const p of problems.slice(0, 6)) console.log(`  ${p.canonical_name}\n    → ${p.tuf_plus}`);
}
