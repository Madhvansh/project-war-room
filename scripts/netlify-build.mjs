#!/usr/bin/env node
// Netlify (and any static host) build step. Two jobs:
//
//   1. Stage the root JSON data files into public/ — the publish directory.
//      The local server serves these from the repo root; a static host only
//      serves what is inside the publish dir, so they are copied in here.
//
//   2. If Firebase env vars are present, generate public/firebase-config.js so
//      cloud mode turns on WITHOUT committing project-specific config. Leave the
//      env vars unset and the committed placeholder (local mode) is kept.
//
// Run automatically by netlify.toml. Safe to run locally too: `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUB = path.join(ROOT, 'public');

// root file -> name it should have inside public/
const STAGE = {
  'curriculum.json': 'curriculum.json',
  'curriculum.s2.json': 'curriculum.s2.json',
  'problems.json': 'problems.json',
  'warplan.s3.json': 'warplan.s3.json',
  'arena.s3.json': 'arena.s3.json',
  'doctrine.s3.json': 'doctrine.s3.json',
  'grill.example.json': 'grill.s3.json' // shipped example dossier is the default
};
for (const [src, dst] of Object.entries(STAGE)) {
  const from = path.join(ROOT, src);
  if (fs.existsSync(from)) {
    fs.copyFileSync(from, path.join(PUB, dst));
    console.log(`  staged public/${dst}`);
  } else {
    console.warn(`  skip ${src} (not found)`);
  }
}

const pid = process.env.FIREBASE_PROJECT_ID;
if (pid) {
  const cfg = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${pid}.firebaseapp.com`,
    projectId: pid,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${pid}.appspot.com`,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  fs.writeFileSync(path.join(PUB, 'firebase-config.js'),
    `// GENERATED AT DEPLOY TIME from environment variables — do not edit by hand.\n`
    + `export const firebaseConfig = ${JSON.stringify(cfg, null, 2)};\n`
    + `export const cloudEnabled = true;\n`);
  console.log(`  wrote public/firebase-config.js for "${pid}" — cloud mode ON`);
} else {
  console.log('  no FIREBASE_PROJECT_ID — keeping committed firebase-config.js (local/placeholder)');
}

console.log('  build staging complete.');
