// WAR ROOM — CLOUD MODE adapter (Firebase Auth + Firestore).
//
// When firebase-config.js is filled in (cloudEnabled === true), this module
// takes over the data layer so the app can run as a plain static site (Netlify,
// GitHub Pages, …) with one saved record per signed-in user. When it is NOT
// filled in, this module is inert and the app behaves exactly as the local-first
// original talking to ./server.js.
//
// It plugs in behind the SAME seam the app already uses — jfetch / api.post /
// api.put in app.js — by answering the handful of routes those helpers hit and
// PASS-ing everything else back to a normal fetch(). So no view code changes.
//
// Firestore layout (one document per state file, so each keeps its own ~1MB
// budget; the value is stored as a JSON string to sidestep Firestore's nested-
// map key rules for arbitrary problem/date keys):
//   users/{uid}/warroom/{name}  ->  { json: "<stringified doc>", at: <ms> }
// ponytail: single doc per file; if log/cards ever pass 1MB, shard into a
// subcollection — that is the only upgrade this model needs.
import { firebaseConfig, cloudEnabled } from './firebase-config.js';

const PASS = Symbol('cloud-pass'); // "not mine — let the real fetch() handle it"
const SDK = '10.12.5';             // pinned Firebase modular SDK (gstatic CDN)

// ── default doc shapes — must mirror server.js DOCS defs exactly ─────────────
const DEFAULTS = {
  log: [], cards: [], days: {}, ladder: [], session: null, reviews: {},
  mocks: [], candidates: [],
  campaign: { season: 2, schema: 1, mode: 'off', pointer: 2, started: null, completed: [], perDay: {}, baseline: null },
  dp: { solved: {}, upsolve: [] },
  cfAscent: { attempts: [], ratingTarget: 1850 },
  corecs: { done: {}, cursor: {} },
  sysd: { artifacts: [] },
  oaSims: [], interviews: [], companies: [],
  arena: { activeSession: null, attempts: [], resolveQueue: [] },
  doctrine: { read: {}, probes: {}, recalls: [], builds: [] },
  grill: { ownership: {}, drilled: [], whiteboard: {}, landmines: {}, pitches: {}, mocks: [] },
  warplan: { checked: {}, diagnostic: {} }
};

// ── date helpers — ported verbatim from server.js so rebasing matches ────────
const isoDate = (ts, tz) => new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(ts));
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortWeekday = dateStr => new Date(dateStr + 'T00:00:00Z')
  .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

let sdk = null;   // { initializeApp, getAuth, ... } once loaded
let auth = null, db = null, uid = null, configCache = null;
let realFetch = null; // the un-patched fetch, so our own raw reads don't recurse

async function loadSDK() {
  if (sdk) return sdk;
  const base = `https://www.gstatic.com/firebasejs/${SDK}`;
  const [app, authM, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  sdk = { ...app, ...authM, ...fs };
  const fbApp = sdk.initializeApp(firebaseConfig);
  auth = sdk.getAuth(fbApp);
  db = sdk.getFirestore(fbApp);
  return sdk;
}

// ── Firestore doc read/write (each state file = one document, JSON string) ───
const docRef = name => sdk.doc(db, 'users', uid, 'warroom', name);
async function readDoc(name, def) {
  const snap = await sdk.getDoc(docRef(name));
  if (!snap.exists()) return def === undefined ? structuredClone(DEFAULTS[name]) : def;
  try { return JSON.parse(snap.data().json); }
  catch { return def === undefined ? structuredClone(DEFAULTS[name]) : def; }
}
async function writeDoc(name, value) {
  await sdk.setDoc(docRef(name), { json: JSON.stringify(value), at: Date.now() });
}
async function readAll() {
  const out = {};
  const qs = await sdk.getDocs(sdk.collection(db, 'users', uid, 'warroom'));
  qs.forEach(d => { try { out[d.id] = JSON.parse(d.data().json); } catch {} });
  return out;
}

// ── per-user config — replaces data/config.json + `npm run setup` ────────────
function ensureConfig(saved) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    user: '', timezone: tz, start_date: isoDate(Date.now(), tz),
    baseline_done: 0, warplan_start: null, cf_handle: '', language: 'C++',
    ...(saved || {})
  };
}
async function getConfig() {
  if (configCache) return configCache;
  const saved = await readDoc('config', null);
  configCache = ensureConfig(saved);
  if (!configCache.user) configCache.user = Cloud.user?.name || '';
  if (!saved) await writeDoc('config', configCache); // first sign-in seeds it
  return configCache;
}

// Re-base the shipped (template-dated) plans onto the user's start date, in the
// browser — the same transform server.js does in memory. The raw files on the
// CDN stay pristine.
function rebaseCurriculum(cur, cfg) {
  const tz = cfg.timezone || cur.meta?.timezone || 'UTC';
  cur.meta.user = cfg.user;
  cur.meta.timezone = tz;
  cur.meta.language = cfg.language;
  cur.meta.baseline_done = cfg.baseline_done;
  cur.meta.start_date = cfg.start_date;
  cur.days.forEach((d, i) => { d.date = addDays(cfg.start_date, i); d.weekday = shortWeekday(d.date); });
  cur.meta.end_date = cur.days[cur.days.length - 1].date;
  delete cur.meta.start_state;
  return cur;
}
function rebaseWarplan(wp, cfg) {
  const wpStart = cfg.warplan_start || cfg.start_date;
  wp.meta.start = wpStart;
  wp.days.forEach((d, i) => { d.date = addDays(wpStart, i); });
  wp.meta.end = wp.days[wp.days.length - 1].date;
  return wp;
}

async function cloudState() {
  const all = await readAll();
  const out = { s2drift: null };
  for (const [name, def] of Object.entries(DEFAULTS)) {
    out[name] = name in all ? all[name] : structuredClone(def);
  }
  return out;
}

// ── the router: answer the app's data routes, PASS the rest ──────────────────
async function handle(url, method, rawBody) {
  const path = url.split('?')[0];
  const body = rawBody ? JSON.parse(rawBody) : null;

  // the two date-bearing plans: fetch raw, rebase client-side
  if (path === '/curriculum.json') return rebaseCurriculum(await fetchRaw(path), await getConfig());
  if (path === '/warplan.s3.json') return rebaseWarplan(await fetchRaw(path), await getConfig());

  if (path === '/api/state' && method === 'GET') return cloudState();

  if (path === '/api/log' && method === 'POST') {
    const log = await readDoc('log'); log.push(body); await writeDoc('log', log);
    return { ok: true, row: body };
  }
  if (path === '/api/log/delete' && method === 'POST') {
    await writeDoc('log', (await readDoc('log')).filter(r => r.id !== body.id));
    return { ok: true };
  }
  if (path === '/api/cards' && method === 'POST') {
    delete body.enrich; // queue context is server-only; no AI layer in cloud mode
    const cards = await readDoc('cards'); cards.push(body); await writeDoc('cards', cards);
    return { ok: true, card: body };
  }

  const put = path.match(/^\/api\/(\w+)$/);
  if (put && method === 'PUT' && put[1] in DEFAULTS) {
    await writeDoc(put[1], body);
    return { ok: true };
  }

  // ── server-only endpoints — honest degradation, never a raw 404 ────────────
  if ((path === '/api/coach' || path === '/api/grill/coach') && method === 'GET') return { transcript: [] };
  if (path === '/api/coach' || path === '/api/grill/coach' || path === '/api/debrief') {
    throw new Error('The AI Coach runs only in local mode — it drives the Claude CLI on your own machine. Clone the repo and `npm start` to use it.');
  }
  if (path === '/api/cf') return { handle: '', rating: [], current: null, autoChecked: 0, recentContests: [], disabled: true };
  if (path === '/api/enrich' && method === 'GET') return { pending: 0, dead: 0 };
  if (path === '/api/enrich/retry') return { ok: true, pending: 0 };
  if (path === '/api/evidence' && method === 'GET') return [];
  if (path === '/api/evidence' && method === 'POST') return { ok: true }; // PNG stays client-side (download/share)

  return PASS; // static assets (problems.json, *.s3.json, css, …) → normal fetch
}

async function fetchRaw(path) {
  const r = await (realFetch || fetch)(path); // real fetch: never re-enter the patch
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

// One interception point for BOTH jfetch and the views' direct fetch('/api/…')
// calls: patch window.fetch so any app route is answered by Firestore and
// everything else (assets, the CDN) hits the network untouched.
function installFetchPatch() {
  realFetch = window.fetch.bind(window);
  const mine = url => url && (url.startsWith('/api/')
    || url === '/curriculum.json' || url === '/warplan.s3.json');
  const jsonResponse = (code, obj) => new Response(JSON.stringify(obj), {
    status: code, headers: { 'Content-Type': 'application/json' }
  });
  window.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    if (!mine(url)) return realFetch(input, opts);
    const method = (opts.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    try {
      const out = await handle(url, method, opts.body || null);
      if (out !== PASS) return jsonResponse(200, out);
    } catch (e) {
      return jsonResponse(502, { error: String(e.message || e) }); // mirrors server error shape
    }
    return realFetch(input, opts);
  };
}

// ── auth gate + chrome (overlay, top bar, settings) ──────────────────────────
async function init() {
  if (!cloudEnabled) return;             // local mode: do nothing at all
  await loadSDK();
  installFetchPatch();
  injectChrome();
  try { await sdk.setPersistence(auth, sdk.browserLocalPersistence); } catch {}
  return new Promise(resolve => {
    let resolved = false;
    sdk.onAuthStateChanged(auth, async user => {
      if (user) {
        uid = user.uid;
        configCache = null;
        Cloud.user = {
          uid: user.uid, email: user.email, photo: user.photoURL,
          name: user.displayName || (user.email || '').split('@')[0] || 'candidate'
        };
        await getConfig();
        showOverlay(false);
        renderTopbar();
        if (!resolved) { resolved = true; resolve(); } // let boot() proceed once
      } else {
        Cloud.user = null; uid = null;
        renderTopbar();
        showOverlay(true);               // gate the app until signed in
      }
    });
  });
}

async function signIn() {
  try { await sdk.signInWithPopup(auth, new sdk.GoogleAuthProvider()); }
  catch (e) { alert('Sign-in failed: ' + (e.message || e)); }
}
async function signOutNow() {
  await sdk.signOut(auth);
  location.reload(); // fresh boot re-gates and clears the previous user's state
}

// ---- DOM chrome (self-contained; injected only in cloud mode) ----
function injectChrome() {
  const style = document.createElement('style');
  style.textContent = `
  #cloudgate{position:fixed;inset:0;z-index:9000;display:none;place-items:center;
    background:#0b0e13;color:#e6edf3;font-family:system-ui,sans-serif;text-align:center}
  #cloudgate.on{display:grid}
  #cloudgate .box{max-width:34ch;padding:2rem}
  #cloudgate h1{font-size:1.3rem;letter-spacing:.15em;margin:0 0 .3rem}
  #cloudgate p{opacity:.7;font-size:.9rem;line-height:1.5;margin:.4rem 0 1.4rem}
  #cloudgate button,#cloudbar button,#cloudset button{cursor:pointer;font:inherit}
  #cloudgate .gbtn{background:#fff;color:#111;border:0;border-radius:6px;
    padding:.7rem 1.4rem;font-weight:600}
  #cloudbar{position:fixed;bottom:10px;right:12px;z-index:8000;display:none;gap:.5rem;
    align-items:center;background:#11161d;border:1px solid #263040;border-radius:20px;
    padding:.3rem .5rem .3rem .8rem;color:#9fb0c3;font:12px system-ui,sans-serif}
  #cloudbar.on{display:flex}
  #cloudbar b{color:#e6edf3}
  #cloudbar button{background:#1b2530;color:#9fb0c3;border:1px solid #263040;
    border-radius:14px;padding:.2rem .6rem}
  #cloudset{position:fixed;inset:0;z-index:9500;display:none;place-items:center;
    background:rgba(0,0,0,.6)}
  #cloudset.on{display:grid}
  #cloudset .card{background:#11161d;color:#e6edf3;border:1px solid #263040;
    border-radius:10px;padding:1.4rem;width:min(92vw,420px);font:13px system-ui,sans-serif}
  #cloudset h2{margin:0 0 1rem;font-size:1rem;letter-spacing:.1em}
  #cloudset label{display:block;margin:.6rem 0 .2rem;opacity:.7}
  #cloudset input,#cloudset select{width:100%;box-sizing:border-box;background:#0b0e13;
    color:#e6edf3;border:1px solid #263040;border-radius:5px;padding:.45rem}
  #cloudset .row{display:flex;gap:1rem}#cloudset .row>div{flex:1}
  #cloudset .actions{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1.3rem}
  #cloudset .save{background:#2563eb;color:#fff;border:0;border-radius:5px;padding:.5rem 1rem}
  #cloudset .cancel{background:transparent;color:#9fb0c3;border:1px solid #263040;
    border-radius:5px;padding:.5rem 1rem}`;
  document.head.appendChild(style);

  const gate = document.createElement('div');
  gate.id = 'cloudgate';
  gate.innerHTML = `<div class="box">
    <h1>WAR ROOM</h1>
    <p>Sign in to save your record to the cloud and pick up on any device.</p>
    <button class="gbtn" id="cloudsignin">Sign in with Google</button>
  </div>`;
  document.body.appendChild(gate);
  gate.querySelector('#cloudsignin').addEventListener('click', signIn);

  const bar = document.createElement('div');
  bar.id = 'cloudbar';
  document.body.appendChild(bar);

  const set = document.createElement('div');
  set.id = 'cloudset';
  document.body.appendChild(set);
}

function showOverlay(on) { document.getElementById('cloudgate')?.classList.toggle('on', on); }

function renderTopbar() {
  const bar = document.getElementById('cloudbar');
  if (!bar) return;
  if (!Cloud.user) { bar.classList.remove('on'); return; }
  bar.classList.add('on');
  bar.innerHTML = `☁ <b>${escapeHtml(Cloud.user.name)}</b>
    <button id="cloudsettings">⚙ Settings</button>
    <button id="cloudsignout">Sign out</button>`;
  bar.querySelector('#cloudsettings').addEventListener('click', openSettings);
  bar.querySelector('#cloudsignout').addEventListener('click', signOutNow);
}

async function openSettings() {
  const cfg = await getConfig();
  const set = document.getElementById('cloudset');
  set.innerHTML = `<div class="card">
    <h2>SETTINGS</h2>
    <label>Display name</label><input id="s_user" value="${escapeHtml(cfg.user)}">
    <div class="row">
      <div><label>Start date (Day 1)</label><input id="s_start" type="date" value="${cfg.start_date}"></div>
      <div><label>Timezone</label><input id="s_tz" value="${escapeHtml(cfg.timezone)}"></div>
    </div>
    <div class="row">
      <div><label>Problems solved before Day 1</label><input id="s_base" type="number" min="0" value="${cfg.baseline_done}"></div>
      <div><label>Language</label><input id="s_lang" value="${escapeHtml(cfg.language)}"></div>
    </div>
    <div class="row">
      <div><label>War Plan start (optional)</label><input id="s_wp" type="date" value="${cfg.warplan_start || ''}"></div>
      <div><label>Codeforces handle (optional)</label><input id="s_cf" value="${escapeHtml(cfg.cf_handle)}"></div>
    </div>
    <div class="actions">
      <button class="cancel" id="s_cancel">Cancel</button>
      <button class="save" id="s_save">Save & reload</button>
    </div></div>`;
  set.classList.add('on');
  set.querySelector('#s_cancel').addEventListener('click', () => set.classList.remove('on'));
  set.addEventListener('click', e => { if (e.target === set) set.classList.remove('on'); });
  set.querySelector('#s_save').addEventListener('click', async () => {
    const next = {
      ...cfg,
      user: set.querySelector('#s_user').value.trim(),
      start_date: set.querySelector('#s_start').value || cfg.start_date,
      timezone: set.querySelector('#s_tz').value.trim() || cfg.timezone,
      baseline_done: Math.max(0, parseInt(set.querySelector('#s_base').value, 10) || 0),
      language: set.querySelector('#s_lang').value.trim() || cfg.language,
      warplan_start: set.querySelector('#s_wp').value || null,
      cf_handle: set.querySelector('#s_cf').value.trim()
    };
    await writeDoc('config', next);
    location.reload(); // simplest correct: re-boot rebases every dated view
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const Cloud = { enabled: cloudEnabled, user: null, PASS, init, handle };
