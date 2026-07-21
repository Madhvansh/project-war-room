# Deploying WAR ROOM to the web (optional cloud mode)

WAR ROOM runs two ways. Pick one — you don't need both.

| | **Local mode** (default) | **Cloud mode** (this guide) |
|---|---|---|
| How | `npm start`, data in `./data` | Static host (Netlify) + Firebase |
| Accounts | None | Google sign-in, one record per user |
| Access | Your machine (or your LAN) | Any device, anywhere |
| Who can use it | You | Anyone you share the URL with |
| **AI Coach** | ✅ works (local `claude` CLI) | ❌ local-only — needs the CLI on your machine |
| Cost | Free | Free on Firebase's Spark plan + Netlify free tier |

Cloud mode turns the app into a plain static site whose per-user record lives in
**Firebase Firestore**, gated by **Firebase Auth**. Nothing about local mode
changes — leave Firebase unconfigured and `npm start` behaves exactly as before.

> **The one thing you lose:** the AI Coach, mock interviewer and card enrichment
> drive the local [`claude` CLI](https://claude.com/claude-code) as a subprocess,
> which cannot run on static hosting. In cloud mode those controls show a clear
> "local-only" message; **everything else — every solve, every card, every
> evidence gate — works fully.** The six gates never used AI anyway.

---

## 1 · Create a Firebase project (free)

1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**. Name it anything. Google Analytics is optional — skip it.
2. Stay on the **Spark (free) plan**. This app fits comfortably inside it.

## 2 · Turn on Google sign-in

**Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**

(Google is the simplest — one click for users, and WAR ROOM never touches a
password. You can add other providers later if you want.)

## 3 · Create the database

**Build → Firestore Database → Create database → Production mode → pick a region → Enable.**

Production mode locks everything down; the next step opens exactly the right slice.

## 4 · Publish the security rules

The rules in [`firestore.rules`](firestore.rules) give each user read/write on
**only** their own `users/{uid}/…` and deny everything else. Publish them either way:

- **Console:** Firestore Database → **Rules** → paste the contents of `firestore.rules` → **Publish**, or
- **CLI:** `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules`

## 5 · Grab your web config

**Project settings (gear icon) → General → Your apps → Web app (`</>`)** →
register the app → copy the `firebaseConfig` values. You'll need `apiKey`,
`projectId`, `appId`, and `messagingSenderId`.

> These are **not secrets** — a Firebase web config is meant to ship in the
> browser. Step 4's rules are what protect the data.

---

## 6 · Deploy

### Option A — Netlify (recommended)

1. Push this repo to your own GitHub, then in Netlify: **Add new site → Import from Git** and pick it.
2. Build settings are read from [`netlify.toml`](netlify.toml) automatically (command `node scripts/netlify-build.mjs`, publish `public`). Leave them as detected.
3. **Site configuration → Environment variables** — add your config from step 5:

   | Key | Value |
   |---|---|
   | `FIREBASE_PROJECT_ID` | your project id |
   | `FIREBASE_API_KEY` | your api key |
   | `FIREBASE_APP_ID` | your app id |
   | `FIREBASE_MESSAGING_SENDER_ID` | your sender id |

   (`FIREBASE_AUTH_DOMAIN` and `FIREBASE_STORAGE_BUCKET` are derived from the
   project id if you omit them.) The build turns these into
   `public/firebase-config.js` — no config is committed to your repo.
4. **Deploy site.**

### Option B — any static host

Fill your config straight into [`public/firebase-config.js`](public/firebase-config.js)
(replace the placeholders), run `npm run build` to stage the data files, and
upload the `public/` folder to any static host (GitHub Pages, Cloudflare Pages,
Vercel, S3…). The build script is only required to copy the root `*.json` data
files into `public/`.

## 7 · Authorize your domain (one line, easy to forget)

Firebase blocks sign-in from domains it doesn't know. In **Authentication →
Settings → Authorized domains**, add your live domain (e.g.
`your-site.netlify.app`, and any custom domain). `localhost` is allowed by
default for local testing.

---

## First run for each user

The first time someone signs in, the app seeds a personal config (name from
their Google profile, **Day 1 = today**, browser timezone) and drops them
straight into Mission Control. The **⚙ Settings** button (bottom-right) changes
start date, name, baseline count, timezone, language, War Plan start and
Codeforces handle at any time — the same knobs `npm run setup` offers locally.

## Testing cloud mode locally

Put a real config in `public/firebase-config.js`, then serve `public/` over
plain HTTP (e.g. `npx serve public`) and open it. Add `localhost` to Firebase's
authorized domains (it's there by default). Don't use `npm start` for this —
that's the local-mode server and it ignores Firebase entirely.

## How the data is stored

Each state file the local app keeps in `./data/<name>.json` becomes one
Firestore document at `users/{uid}/warroom/{name}`, holding the same JSON. Read
it, export it, or delete it from the Firestore console at any time — it's your
data, in the open, exactly like the local files.

## Costs & limits

The Spark (free) plan gives 1 GiB stored and ~50k reads / 20k writes per day —
orders of magnitude more than one person grinding a DSA sheet will ever use. A
single user's whole record is a few hundred KB. If you somehow outgrow the free
tier, that's a lot of people training hard on your instance.
