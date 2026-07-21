# Additional information

**The complete reference for [Project War Room](README.md)** — every feature, every keyboard shortcut, every config knob and script, plus troubleshooting.

Start with the [README](README.md) if you just want to install it and understand Tier A / Tier B. Come here when you want the detail: what a specific view does, what a flag means, or why something is behaving the way it is.

---

## Contents

- [Why this exists](#why-this-exists)
- [Quick start](#quick-start)
- [Try the demo first](#try-the-demo-first)
- [Set it up for yourself](#set-it-up-for-yourself)
- [**New to DSA? Read this**](#new-to-dsa-read-this) — the sheet, Tier A vs Tier B, the whole mental model
- [How a day works](#how-a-day-works)
- [The full feature tour](#the-full-feature-tour)
  - [Plan & orient](#1-plan--orient) · [Solve](#2-solve) · [Review & retain](#3-review--retain) · [Drill](#4-drill-produce-from-blank) · [Grill Room](#5-grill-room-defend-your-own-projects) · [Simulate interviews](#6-simulate-interviews) · [Measure](#7-measure--prove)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [The AI coach (optional)](#the-ai-coach-optional)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Your data](#your-data)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [How it's built](#how-its-built)
- [Credits & licence](#credits--licence)

---

## Why this exists

Most practice tools track **what you touched**. Almost none track **what you can still do a week later, alone, under a clock, without recognising the problem from last time.** That gap is where interviews are lost.

So every mechanic here exists to attack one specific way people lie to themselves:

| The lie | What the app does about it |
|---|---|
| *"I understood it"* — after reading a solution | The only way out of a problem is to close the editorial and **rebuild it from a blank file**, then write a card in your own words. |
| *"I solved it"* — after 90 minutes and three hints | Hard **35-minute ceiling**. Every hint is recorded. Your headline number is the *solo* rate, not the total. |
| *"I know this pattern"* — because you saw the topic heading | The Arena serves problems **with no topic label**, in an order designed to leak nothing. |
| *"I revised it"* — by re-reading notes | Reviews are **produce-from-blank**, not recognise-from-a-list. Re-reading scores nothing. |
| *"I'm ready"* — based on feeling ready | Six **evidence gates** that only move on measured cold performance after a real delay. Nothing you can click raises them. |
| *"I'll remember my project"* — it's your own work | A **Grill Room** that interrogates your claims and makes you state, in writing, what you personally did. |

If you want an app that congratulates you, this is the wrong one.

---

## Quick start

**Requirements:** [Node.js](https://nodejs.org) **18.17 or newer**. That's it — no other software, no packages, no internet connection needed after cloning.

```bash
git clone https://github.com/Madhvansh/project-war-room.git
cd project-war-room
npm start
```

Open **<http://localhost:4350>**.

On first run it creates `data/config.json` and sets **day 1 = today**. That's all the setup there is; you can start working immediately.

> Check your version with `node --version`. If it prints something below `v18.17`, update Node first — the app uses built-in `fetch` and won't start on older versions.

---

## Try the demo first

Want to look around before committing? One command:

```bash
npm run demo
```

This spins up a **throwaway copy** at <http://localhost:4399>, pre-loaded with a realistic mid-grind day — problems solved, hints taken, cards banked, one problem flagged as a failure. Your real data is never touched: the demo writes only to `./data-demo`, on a different port.

Things worth clicking in the demo:

1. **Mission Control** — the day's plan, quota meters, the block timetable.
2. Click a **Tier A** problem → you're in the solve cockpit. Type any guess to start the clock.
3. Add **`?speed=60`** to the URL (`http://localhost:4399/?speed=60`) — one real second becomes one minute, so you can watch the full 35-minute ritual, the minute-10 checkpoint and the ceiling play out in about half a minute.
4. **`#/log`** — the weak-topic analysis over the seeded history.
5. **`#/wall`** — the evidence wall and the shareable receipt it generates.
6. Press **`Ctrl+K`** anywhere — the command palette searches every view *and* all 458 problems.

Delete `./data-demo` to reset it. Everything in the demo is fictional.

---

## Set it up for yourself

Your settings live in **`data/config.json`** — created on first boot, and **never committed to git**. Edit it directly, or use the setup script:

```bash
npm run setup                                  # show current settings
npm run setup -- --start 2026-08-07            # day 1 of your 20-day plan
npm run setup -- --name "Alex" --baseline 40   # your name + problems already done
npm run setup -- --tz Asia/Kolkata             # the zone your day rolls over in
npm run setup -- --cf tourist                  # Codeforces handle (omit to keep it off)
```

| Setting | What it does |
|---|---|
| `start_date` | Day 1 of the 20-day plan. The shipped plan and the Season 3 war plan are **re-based onto this date in memory** — the files on disk are never rewritten, so `git pull` never conflicts with your setup. |
| `user` | Your name. Used in the UI and when addressing you in AI prompts. Leave blank and you're "the candidate". |
| `timezone` | Your day boundary. Defaults to your machine's zone. |
| `baseline_done` | Problems you'd already solved *before* day 1. Added to the `SHEET n/435` counter so it reflects reality. Set `0` if starting fresh. |
| `warplan_start` | Day 1 of the separate 10-day final crunch. `null` = same as `start_date`. |
| `cf_handle` | Codeforces username, for live rating sync and auto-ticking ladder problems. Empty = the whole feature is off. |
| `language` | Cosmetic; the app never runs your code. |

**One tip:** the plan was written starting on a **Friday**, so its contest days land on Sundays. Starting on a Friday keeps that rhythm. Any other day works fine — the contest rows just sit on different weekdays.

**Not ready to commit to 20 days?** Ignore the calendar entirely. `#/arena`, `#/doctrine`, `#/gauntlet`, `#/cards` and `#/grill` are all self-paced and don't care what day it is.

---

## New to DSA? Read this

*Skip if you already grind LeetCode. Otherwise this section is the whole mental model, and nothing else in the app makes sense without it.*

### The vocabulary

| Term | What it means |
|---|---|
| **DSA** | Data Structures and Algorithms — arrays, sorting, searching, trees, graphs, dynamic programming. The standard body of coding-interview material. |
| **The sheet** | A curated, ordered list of practice problems meant to cover that whole body. Here: the **Striver A2Z / TUF+ sheet — 435 problems across 20 topics**. |
| **Pattern** | The *technique* a problem needs: "sliding window", "binary search on the answer", "monotonic stack". Recognising *which* pattern applies is a separate, harder skill than coding it — and it's the one interviews actually test. |
| **Trigger** | The phrase in a problem statement that should have made the pattern fire. *"...longest subarray with sum ≤ K"* → sliding window. |
| **Trap** | The classic mistake that kills people on that specific problem. |
| **Brute → optimal** | Most problems have an obvious slow solution and a clever fast one. "Reaching optimal" means finding the fast one. |
| **Editorial** | The official written solution. Reading it is allowed here — but it costs you, and it's recorded. |
| **Upsolve** | Going back to a contest problem you failed live and properly learning it. |
| **⚑ Flag** | This problem beat you. It's queued for revision. |
| **◇ Gap** | You *did* reach the optimal solution — but only with help. One named trick away from ready. These are the cheapest wins available to you. |
| **Solo rate** | How often you solve completely unaided. **This is the number that predicts interview performance.** |
| **Off-sheet** | Work that deliberately does *not* count toward the 435. |

### Tier A vs Tier B — the core idea

This is the single most important concept in the app.

**The problem:** 435 problems at 35 minutes each is over 200 hours. Nobody has that before an interview.

**The insight:** not every problem carries a new idea. Many are variations on a technique you already met. Grinding all 435 at full depth wastes most of your time re-proving things you can already do.

**So every problem is assigned a tier:**

|  | **TIER A — depth** | **TIER B — coverage** |
|---|---|---|
| **How many** | 123 problems | 335 problems |
| **The idea** | Each one teaches a genuinely new mental move | Variations — you only need to *recognise* them |
| **What you do** | **Write real, working code.** Timed. | **Read it, name the technique, sketch 3–5 lines. No coding.** |
| **Time budget** | 10 / 10 / 35 minutes (below) | 7-minute ceiling, 2-minute classify timer |
| **Before the clock** | Type your guess at the pattern — **the clock will not start until you do** | Same: name it before you reveal |
| **How it ends** | A pattern card you write yourself | The rep *is* the card |
| **Counts toward** | `SHEET n/435` and your solo rate | `SHEET n/435` |

**"10 / 10 / 35" means:**

- **First 10 minutes — completely alone.** No hints, no editorial, nothing.
- **At minute 10 — a checkpoint you cannot dismiss.** "Do you have ANY working approach? A brute-force one counts." Three honest answers: *yes, keep going* · *let me read the approach* · *ask the Coach*. Either of the last two permanently records the solve as **hint-assisted**. That's the point — it's a record, not a punishment.
- **At minute 35 — a hard ceiling.** An alarm and a modal with exactly two options: **solved**, or **read the full solution**. There is no "just five more minutes". If you read the solution, you then close it and **rebuild the whole thing from a blank file in 15 minutes** — because reading a solution teaches you almost nothing, and reproducing it teaches you almost everything.

**The anti-spoiler rule:** the app knows every problem's pattern, and it will **never show you** on any list, any menu, or any preview. It's revealed only after you've committed to an answer. Naming it yourself is the skill being trained; a spoiled problem is a wasted problem.

**Tier B is not "the easy list."** It's a different exercise. You have two minutes to say "this is a two-pointer problem" and sketch the loop. If you can do that, coding it is mechanical and you don't need the practice. If you *can't*, the app promotes it to Tier A for a full solve.

### What counts toward 435

`SHEET n/435` = your `baseline_done` + every distinct problem you've genuinely touched. Deliberately **excluded**: problems you abandoned, timed re-solves of problems already counted, contest upsolves, and 23 **⊕ supplement** problems (worth solving, not on the sheet). Five items are marked **📖 read-only** — dense theory where a careful 10-minute read counts as touched.

Everything in Seasons 2 and 3 (below) is **off-sheet by design** — it writes to separate files and can never inflate your headline number.

### The three seasons

The app grew in layers. All three are available to you from day one; nothing is locked.

| | **Season 1 — the sprint** | **Season 2 — placement prep** | **Season 3 — the final crunch** |
|---|---|---|---|
| **Shape** | 20 calendar days, hard clocks, a win/loss verdict per day | Self-paced. A second pass over the sheet, plus spaced repetition and four production tracks | A 10-day evidence-driven run-up to a real interview |
| **Governing number** | `SHEET n/435` | `INTERVIEW-READY %` | **Evidence gates** |
| **Use it when** | You have a fixed runway and want to be driven | You want depth and durability without a countdown | An interview is actually scheduled |

Each layer is purely additive — Season 2 and 3 never modify Season 1's record.

---

## How a day works

*(Season 1. Ignore all of this if you're working self-paced.)*

You press **START DAY** when you actually sit down — not at a fixed hour. Everything else is drawn relative to that anchor, so a 10am start and a 2pm start both work.

A day is **ten blocks**: overflow + warm-up (50 min) · new topic (160) · break (20) · Tier A grind (105) · lunch (50) · Tier B recognition (80) · Tier A grind (120) · dinner (40) · speed drill (45) · review (45).

**The quota** is 8 Tier A + 9 Tier B (6 Tier A on heavy DP/graph days). Meet it and the day is **WON** — regardless of how much help you needed. Eight hint-assisted solves is a win, because showing up and doing volume is what the plan is buying. Quality is measured separately, and honestly, by your solo rate.

Other mechanics worth knowing:

- **Sleep guard.** If the projected end runs past 22:45, the app *shrinks the day* in a fixed order — trim Tier B by 3, then breaks to minimum, then the speed drill — and never touches sleep or the review block. A compressed day that you meet still counts as won.
- **Overflow.** Unfinished Tier A work from earlier days shows up in tomorrow's first block, tagged with the day it escaped from. It's computed live, so it can't get out of sync.
- **Bad Day button.** One press closes the day honestly, rolls the work forward and trims tomorrow. Use it instead of quietly abandoning.
- **Sealing.** Once a date passes, its verdict is computed once and frozen forever. Work done later credits *today* — you cannot retroactively win a day you lost. (Days you never started are never sealed, so an old start date doesn't hand you a wall of fake losses.)

---

## The full feature tour

Grouped by what you're trying to do. Reach anything with **`Ctrl+K`**.

### 1. Plan & orient

| Feature | Where | What it does |
|---|---|---|
| **Mission Control** | `#/` | The home screen: today's Tier A and Tier B lists, quota meters, the block timetable against real clock times, a pace ribbon, and a `NOW · NEXT` bar naming the one thing to do next. Press **START DAY ▸** to begin, or **N** to launch whatever's next. |
| **Morning briefing** | on START DAY | One screen: today's focus, the quota, leftover work, tonight's contest, yesterday's verdict, and whether you're ahead of or behind the 435 line. |
| **Pace ribbon** | `#/` | Remaining problems × your real average solve time vs. minutes left before the hard stop. Designed to tell you the truth about whether you'll make it. |
| **Salvage panel** | `#/` after 21:30 | Appears when you're behind: the exact minimum set of problems that still makes quota, flagged ones floated to the top. |
| **Day picker** | `#/` | Run any of the 20 days as your active mission — catch up on a missed day, or work ahead. |
| **Calendar** | `#/calendar` | All 20 days as tiles with their verdicts. Click one for its full list with per-problem status marks. |
| **Command palette** | `Ctrl+K` | Searches every view, every action, and all 458 problems. Selecting a problem launches the right cockpit for its tier. The fastest way around the app. |
| **War plan** | `#/warplan` | The 10-day final crunch as day-boxes, each with **FLOOR** (non-negotiable), **TARGET** (a good day) and **STRETCH** (drops guilt-free) tasks. Unfinished floor/target items carry forward exactly once. |
| **Campaign lane** | from `#/durability` | The self-paced "second attempt": the same 20 days with no clock and no losing. A day is won only when *everything* on it is done — and your Season 1 solves already count, so you only finish what's left. |

### 2. Solve

| Feature | Where | What it does |
|---|---|---|
| **Solve cockpit** | click any Tier A problem | The heart of the app: the classification gate → 35-minute clock → minute-10 checkpoint → the ceiling → optional editorial + blank rebuild → **a mandatory pattern card**. The session lives on the server, so a refresh, a browser change, or a full restart resumes the same clock. |
| ↳ **Pause** | `P` | Hides the problem name and freezes every timer. Time away and pause count are both recorded, so you can't quietly cheat the clock. |
| ↳ **Debug timer** | `B` | A separate 10-minute timer with one instruction: *stop re-reading your code, dry-run the smallest failing input* — and a box to write that input in. |
| ↳ **Depth ledger** | at the card | Two rows of chips: the highest solution tier you reached **alone**, and the tier you finished at. This is what separates "couldn't start it" from "got it but needed a nudge to make it fast" — two completely different problems needing completely different fixes. |
| ↳ **The pattern card** | the only exit | Two mandatory fields — the pattern, and one line in your own words. The router **blocks navigation** until you write it. Only then does the app reveal the canonical trigger / pattern / trap. |
| **Recognition cockpit** | click any Tier B problem | Read → name the pattern (a 2-minute sub-timer records whether you were quick) → sketch → **reveal** → grade yourself 1/2/3 → straight into the next one. Grade a problem ✗ and it queues for a full Tier A solve. |
| ↳ **Attack Plan** | `A` | Auto-opens if you freeze. Deliberately identical for every problem — restate it, sketch ≤4 lines, dry-run a tiny example — so it can help you start without ever leaking the answer. |
| **THE ARENA** | `#/arena` | **96 problems served completely blind** — no topic, no grouping, no hint, and a rotation designed so even the ordering tells you nothing. Six steps: **hypothesis** (your read + how confident) → solve → editorial → **reveal** → grade → **mutation** ("a constraint just changed — what breaks?"). This is the closest thing here to a real interview. |
| ↳ **Spaced re-solves** | `#/arena` | Solve it alone *and* read it right → it returns in 3 days. Anything else → tomorrow. A **confidently wrong** read is flagged priority and floated to the top, because a confident wrong belief is the most dangerous thing you can carry into an interview. |
| **The Forge** | `#/forge` | Every problem that still has your number on it — flagged failures and gap problems — hardest first. There is **no "mark as cleared" button**; only a logged clean solo solve removes a boss. |
| **Speed drill** | `#/ladder` | Blank re-solves of problems you did 3+ days ago, weighted toward the ones that hurt, with your previous time to beat. On alternate days it switches to a Codeforces rating ladder. |
| **CF-Ascent** | `#/cf-ascent` | A rating climb toward the ~1800–1900 band that online assessments target. Failures force a card naming the technique family. Your "fightable rating" is the *max of your live rating and the mean of your five best solves* — so one lucky day can't inflate it. |

### 3. Review & retain

| Feature | Where | What it does |
|---|---|---|
| **Card vault** | `#/cards` | Every card you've ever written, searchable across pattern, trigger, trap, your note and the problem name. Your words and machine-generated words are always shown separately, never merged. |
| **Nightly review deck** | `#/cards` | Today's cards + everything you missed last time + up to 10 older due cards, shuffled. Each card says *why* it's in the deck. Say the answer out loud → **Space** to flip → **G**ot it / **M**issed. |
| **Leitner spacing** | automatic | Boxes at **1, 3, 7 days**. Right answer climbs a box; wrong resets to tomorrow. |
| **Durability dashboard** | `#/durability` | Retained %, cards by box, and a **decay-risk list** of what's going stale, reddest first. The retained % is deliberately harsh: it counts only cards that have actually been re-tested, so it measures durability rather than activity, and **cannot be inflated by doing more new work**. |
| **Produce Gauntlet** | `#/gauntlet` | 10 old cards across every track, longest-unseen first. Front only, out loud, then grade. The app treats this score as its truest predictor of interview performance. 70%+ is green. |

### 4. Drill (produce from blank)

Everything here uses one shared cockpit: you get a prompt and empty boxes, you write the answer **from memory**, and only then does it reveal the model answer and a must-hit checklist. There is no way back to edit — the reveal is one-way on purpose.

| Feature | Where | What it does |
|---|---|---|
| **DOCTRINE** | `#/doctrine` | Core CS theory: **24 units and 160 fact-checked questions** across Operating Systems, DBMS + SQL, Networks, OOP + C++, and SOLID/Linux/Git/Testing. Each unit runs a fixed loop: **cold probe** (answer *before* reading — missing is expected, that's the measurement) → a dense 80/20 lesson → close it → **recall from blank** → the same questions return at **+1 day and +3 days**. Cold probes never become cards; recall questions become cards *only when you get them wrong*, so your deck is exactly your weaknesses. |
| **Design builds** | `#/doctrine` → LLD / HLD | **11 worked design modules** — Parking Lot, LRU Cache, Rate Limiter, Splitwise, Elevator, Ticket Booking; URL Shortener, Distributed Rate Limiter, Chat System, News Feed, Ride-hailing Geo Index. Credit comes only from a **cold build** — writing the design from blank *without* opening the worked answer that day. Then the app plays interviewer twice: a change request, and a failure injection. Open the answer first and your build is marked "warm" and doesn't count. |
| **Core CS produce** | `#/corecs` | Same idea, one topic at a time, in the shape that scores: definition → concrete example → one tradeoff. Plus **cross-subject connections** ("a DB index *is* a B+ tree the OS pages in and out") — the kind of sentence almost nobody says out loud. |
| **System design artifacts** | `#/sysd` | Full LLD/HLD artifacts against a framework checklist, with reference rails: the ordered framework, building-block chips, and a numbers cheat-sheet (powers of two, QPS arithmetic, latency scales). |
| **Rapid-fire** | `#/rapidfire` | 20 problems, ~10 seconds each, name the technique. Trains the reflex that decides the first 30 seconds of an interview. Saves nothing, costs two minutes. |
| **STAR stories** | `#/command` | Behavioural answers stored as Situation / Task / Action / **Result (quantified)**, banked as cards that decay and resurface like everything else. |

### 5. Grill Room (defend your own projects)

`#/grill` — because "tell me about your project" sinks more candidates than any algorithm does.

You write a **dossier** describing a project: its claims, its evidence, its real weaknesses, and the questions that would hurt. Then the app attacks it. Seven modes:

- **READ** — reference material, and boxes where **you** write your own 30-second and 2-minute pitches. (Reciting someone else's paragraph collapses under one follow-up.)
- **CLAIMS** — a claim → evidence ledger. Every claim carries where the evidence lives, the limitation to concede *before* they find it, the strongest counter-argument, and the exact safe wording.
- **DRILL** — grounded Q&A from blank. Missed questions jump ahead of fresh ones. 10 clean answers clears the bar.
- **WHITEBOARD** — derivations you must do unaided on paper. The reveal is for checking, not learning.
- **LANDMINES** — the dangerous questions, each with *why* it's dangerous and an honest answer: facts, the limitation, what you'd do differently. Never a rehearsed hero story.
- **MOCK GRILL** — an adversarial AI interviewer that has read your dossier (needs the `claude` CLI; see below).
- **OWNERSHIP** — "what did *you* personally do?" The app leaves this blank and never invents an answer for you.

**The app ships two example dossiers** (`grill.example.json`) for fictional projects — a URL shortener and an ML churn predictor — so you can see the shape and the level of honesty expected. To add your own, copy that file to **`grill.s3.json`** and rewrite it. That filename is **gitignored on purpose**: a dossier is a detailed, candid account of your own work and its weak points, and it should stay on your machine.

### 6. Simulate interviews

| Feature | Where | What it does |
|---|---|---|
| **OA simulator** | `#/oa` | The timed pre-interview coding test: 2–3 hard problems you pick, one strict **90-minute clock that does not pause and survives a refresh** — deliberately, because real assessments don't pause either. Then a mandatory autopsy tagging every miss as **pattern** (never saw the idea), **impl** (idea fine, code fought you) or **clock**. That tag is the highest-signal data in the app for deciding what to fix. |
| **Mock interview** | `#/interview` | Five rounds, ~90 minutes: clarifying questions (5) → DSA thinking out loud (35) → LLD machine coding (30) → core-CS rapid fire (10) → behavioural STAR (10). You type what you would **say**, not code. The summary replays your actual words back — the rambling you can't feel in the moment becomes visible. |
| **Mock generator** | `#/mock` | The app picks 4 problems from your own history, spread across topics, weighted toward your weak spots, and tells you why it chose each. 90-minute clock. Pausing is allowed but printed on the receipt. |

### 7. Measure & prove

| Feature | Where | What it does |
|---|---|---|
| **Evidence gates** | `#/warplan` | The scoreboard that matters. Six gates: **Blind DSA** (12 blind Arena attempts + 6 delayed re-solves) · **Theory** (80 scored recalls including 30 after a real delay, across ≥4 subjects) · **Design** (2 cold LLD + 1 cold HLD) · **Projects** (every dossier cleared) · **Pressure** (1 OA + 2 full mocks) · **Behavioural** (6 truthful STAR stories). Your overall readiness is **not an average — it equals your weakest gate.** Nothing you can click raises these. Reading a lesson, ticking a box, rating yourself highly: all worth zero. Assisted practice and warm design builds are excluded by design. |
| **Command Center** | `#/command` | Interview-ready % as a weighted blend of five tracks, each showing its weight and an `n<3` marker when the data is too thin to trust. Plus **"fix tomorrow"** — your weakest three, each with one concrete action. |
| **Log / Data Room** | `#/log` | Per-topic readiness, weak-topic analysis, and the **patch list**: the specific problems to redo, split into *re-learn* (you couldn't start it) and *re-optimize* (you got there with help). Plus a **trap ledger** of mistakes you have actually made — off-by-one, overflow, empty input, sign errors — tallied by kind. Export everything as CSV. |
| **Weak-topic score** | `#/log` | One definition, in one place, used by every view. Accuracy dominates; flags and chronic slowness add; **any topic with fewer than 3 attempts is not scored at all** and is marked `(n<3)`, so a barely-touched topic can never masquerade as either a strength or a crisis. |
| **Evidence Wall** | `#/wall` | Every fully-solo solve as a wall of receipts, your solo rate with its sample size, a 20-day heat strip, and a generated **1200×630 PNG** summarising the day — for a progress thread, or just for yourself. |
| **Report** | `#/report` | The end-of-sprint report: headline numbers, week-by-week breakdown, your actual progress against the required line, average solve time by day, and a topic radar. Renders any day and grows into itself. |

---

## Keyboard shortcuts

Press **`?`** in the app for this list. Keys are ignored while you're typing in a text box.

| Where | Key | Action |
|---|---|---|
| **Anywhere** | `Ctrl/Cmd+K` | Command palette |
| | `?` | This shortcut sheet |
| | `Esc` | Close whatever is open |
| **Mission Control** | `N` | Launch the next thing |
| **Solve — setup** | `O` | Open the problem statement |
| | `Enter` | Start the clock (blocked until you've named a pattern) |
| **Solve — running** | `S` | Solved |
| | `B` | Start the 10-minute debug timer |
| | `C` | Toggle the Coach drawer |
| | `P` | Pause / resume |
| **Solve — minute 10** | `Y` / `A` / `C` | Keep going / read the approach / ask the Coach |
| **Solve — the ceiling** | `1` / `2` | Solved / read the solution and rebuild |
| **Solve — the card** | `Ctrl+Enter` | Save and exit |
| **Recognition** | `O` `A` `P` | Statement / attack plan / pause |
| | `Ctrl+Enter` | Reveal |
| | `1` `2` `3` | Nailed it / close / missed |
| | `Enter` | Next problem |
| **Review deck** | `Space` | Flip |
| | `G` / `M` | Got it / missed |
| **Produce cockpits** | `Ctrl+Enter` | Submit, then check |
| | `1` `2` `3` | ✓ / ~ / ✗ |
| **Arena** | `Ctrl+Enter` | Submit hypothesis, start clock |
| **Mock interview** | `Ctrl+Enter` | Next round |
| **OA simulator** | — | Mouse only, on purpose — mimicking a real assessment |

---

## The AI coach (optional)

**Everything below is optional. The app is fully functional without it** — and this is worth stressing, because the AI features are the *least* important part of the design.

Six features use it: the **Coach drawer** in the solve cockpit (a 5-level hint ladder — one Socratic question → the pattern family → an approach in words → a skeleton with blanks → a full walkthrough, where **level 5 is locked until the 35-minute ceiling actually fires**), the **Grill Room mock interviewer**, a **nightly debrief**, a **"push me"** button in mock interviews, **design artifact review**, and a background layer that adds a trigger/trap line to your cards.

**What it requires:** the [`claude` CLI](https://claude.com/claude-code) installed and logged in. The server shells out to it locally.

- **No API key is used, ever.** The server explicitly deletes `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` from the child process environment on every single call. Authentication is your existing CLI login.
- Prompts are passed as **process arguments, never through a shell** — so text you type can never be interpreted as a command. For the same reason the app refuses to launch a `.cmd`/`.bat` shim; see [Troubleshooting](#troubleshooting) for the Windows setup.
- The child runs in a temp directory with tools disabled — it can't see or touch your files.
- Model names live in `coach.config.json`. To use a different tool entirely, point `command` at it (a string, or an array like `["node", "cli.js"]`). The contract is: accept a prompt and a system prompt as arguments, print text, exit 0.

> **⚠ `coach.config.json` names a program that will be executed on your machine.** Leave it as `claude` or point it at something you trust.

**Without the CLI installed**, those six controls fail fast (about 100 ms) with a clear message — no hang, no crash — and every other surface tells you what to do instead. Most importantly: **all six evidence gates are computed with zero AI input.** The AI mock grill deliberately does *not* count toward the Pressure gate. You lose a sparring partner, not a feature.

---

## Configuration

### Environment variables

| Variable | Default | What it does |
|---|---|---|
| `P435_PORT` / `PORT` | `4350` | Listening port. |
| `P435_HOST` | `127.0.0.1` | Network interface. **Loopback by default** — see [Security](#security). Set `0.0.0.0` to reach it from your phone. |
| `P435_DATA` | `./data` | Where everything is stored. Point it elsewhere to run an isolated instance. |
| `P435_NO_ENRICH` | unset | Any value disables background AI card enrichment. |

```bash
# an isolated sandbox instance, on a different port
P435_PORT=4399 P435_DATA=./data-sandbox npm start
```

```powershell
# PowerShell
$env:P435_PORT='4399'; $env:P435_DATA='./data-sandbox'; npm start
```

### URL flags (development / rehearsal)

Add these to the URL. Any active override shows a red **DEV** badge in the header.

| Flag | Effect |
|---|---|
| `?speed=60` | One real second = one minute, in every timer. The best way to rehearse a flow. |
| `?clock=23:05` | Fake the wall-clock time (drives the sleep-guard nag). |
| `?date=2026-08-09` | Fake today, in the browser only. **⚠ Anything you log while this is set is stamped with the fake date.** Never log real work with it on. |
| `?focus=YYYY-MM-DD` | Point the mission at a different plan day. |
| `?pwa=1` | Register the service worker so you can install it as an app. Sticky. |

### Content files

All plain JSON, all editable — the app reads everything from data rather than hardcoding it.

`curriculum.json` (the 20-day plan, block durations, quotas, sleep guard, contests) · `curriculum.s2.json` (Season 2 tracks) · `problems.json` (all 458 problems with their triggers, patterns and traps) · `arena.s3.json` (96 blind items) · `doctrine.s3.json` (24 units, 160 questions, 11 design modules) · `warplan.s3.json` (the 10-day crunch) · `grill.example.json` (example dossiers) · `coach-system.txt` / `grill-system.txt` (AI personas — `{{USER}}` becomes your name).

> If you change the plan structure, run `npm test` — the law audit checks that the curriculum and the engine still agree.

---

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app on <http://localhost:4350>. |
| `npm run demo` | A throwaway populated instance on `:4399`, sandboxed to `./data-demo`. |
| `npm run setup -- --start 2026-08-07` | Write your settings. Run with no flags to see current ones. |
| `npm test` | The law audit — 116 assertions checking the engine against the curriculum. Pure, no server, no network. |
| `npm run smoke` | API smoke test across every endpoint. Spawns its own server on a temp directory. |
| `node scripts/seed-demo.mjs clear` | Wipe the seeded sandbox. |
| `node scripts/laws-ui.mjs` | DOM-level audit of the solve gates. Needs a Chromium browser reachable over CDP. |
| `node scripts/audit.mjs` | The full hostile QA audit. Sandboxed; prints a checksum of your real data before and after to prove it was never touched. |
| `node scripts/make-icons.mjs` | Regenerate the PWA icons. |
| `node scripts/trigger-bank.mjs` | Regenerate `problems.json` (needs the source sheet inventory + the `claude` CLI). |

**Safe to run any time:** `npm test`, `npm run smoke`, `npm run setup`, `npm run demo`.

> **⚠ Scripts that overwrite files.** `data/` is your only copy and is gitignored — nothing is backed up.
> - **`seed-demo.mjs`** replaces your log, cards, days, reviews, ladder and session with demo fixtures; `seed-demo.mjs clear` **deletes every file** in the target directory. It writes to `./data-sandbox` by default and **refuses to run against `./data`** — but if `P435_DATA` is exported in your shell it follows that, so unset it first.
> - **`npm run demo`** deletes and recreates `./data-demo` on every run. Your real `./data` is untouched.
> - **`set-session.mjs`** plants a fake solve session; with `P435_PORT=4350` it would hit your live server.
> - **Maintainer-only, and they rewrite committed files:** `trigger-bank.mjs` and `add-tuf-links.mjs` (rewrite `problems.json`), `make-icons.mjs` (rewrites the PWA icons), `audit.mjs` (writes an audit report).

**Platform support.** The app, `npm test` and `npm run smoke` run on Windows, macOS and Linux. `audit.mjs` and `laws-ui.mjs` drive a browser through hardcoded Windows paths and are currently Windows-only. A few console hints print PowerShell syntax (`$env:P435_PORT='4399'`); on macOS/Linux use `P435_PORT=4399 npm start`.

---

## Your data

**Everything lives in `./data` as readable JSON on your machine.** No account, no server, no telemetry, no analytics, no network calls except the optional Codeforces rating sync and the optional local `claude` CLI.

```
data/
  config.json      your settings          log.json        every attempt, append-only
  cards.json       every card you wrote   days.json       per-day anchor + sealed verdict
  arena.json       blind attempt history  doctrine.json   theory progress
  grill.json       project drill progress  reviews.json   nightly review state
  coach/           AI transcripts          evidence/       saved PNG receipts
  ...and one file per track
```

**`data/` is gitignored.** If you fork this repo, your record does not go with it. Two files are private by design:

- **`data/`** — everything you do, including your name and start date.
- **`grill.s3.json`** — your project dossiers. Detailed, candid, and about your own work.

**Backing up = copying the folder.** Restoring = copying it back. Every file is hand-editable if something goes wrong; the app reads what's there and reverts to a sane default if a file is unreadable.

Two things to know: deleting a log row is permanent and immediately changes every derived number; and **two browser tabs will overwrite each other**, so use one at a time.

---

## Security

**The API has no authentication.** Anyone who can reach the port can read and modify everything. Three deliberate defences follow from that:

**1. It listens on `127.0.0.1` only by default.** Nothing on your network can reach it. Right for almost everyone.

To use it from your phone on the same Wi-Fi:

```bash
P435_HOST=0.0.0.0 npm start
```

> **⚠ Only on a network you trust — your own home Wi-Fi.** With `0.0.0.0`, anyone on the same network can read your entire record — solve log, cards, Coach transcripts, evidence screenshots — and change or delete it, with no password. **Never on campus, café, hotel, dorm or airport Wi-Fi.** The server prints a warning when you open it up. To reach it from outside your home, use a private mesh like [Tailscale](https://tailscale.com/) rather than port-forwarding; this app was never designed to face the public internet.

**2. Cross-origin requests are refused.** Loopback binding alone doesn't protect you: a `POST` with `Content-Type: text/plain` needs no CORS preflight, so any web page you happened to be visiting could otherwise write to your log while the app was running. The server checks `Origin` and `Host` on every request, which also blocks DNS rebinding. Native clients (curl, the test scripts) send no `Origin` and still work.

**3. Nothing you type is ever passed through a shell.** See [the Coach section](#the-ai-coach-optional).

Verified: cross-origin writes → `403`, rebound `Host` → `403`, and every path-traversal form tested (`../`, `%2e%2e`, `..%5c`, encoded and double-encoded) → `404`.

Found a security issue? Please open an issue — or for anything sensitive, contact the maintainer privately rather than filing publicly.

---

## Troubleshooting

**`npm start` fails, or the page is blank.**
Check `node --version` — you need **18.17+**. Older versions fail on built-in `fetch`.

**Port 4350 is already in use.**
The app tries to take the port back from a stale instance of itself automatically. If something else owns it: `P435_PORT=4360 npm start`.

**The header says Day 1 but I wanted to start next Monday.**
`npm run setup -- --start 2026-08-10`, then restart. Nothing is lost — the plan is re-based, not rewritten.

**I'm past day 20.**
The 20-day window has closed; the app says so. Start the campaign lane from `#/durability` for a self-paced second pass, or just keep using the Arena, Doctrine and Gauntlet, which ignore the calendar entirely.

**The Coach says "spawn claude ENOENT".**
The `claude` CLI isn't on your PATH. Install and log in, or just ignore it — nothing else is affected.

On **Windows**, if you installed the CLI via npm, what you have is `claude.cmd` — a batch shim. The app **deliberately refuses to run `.cmd`/`.bat` files** (launching them would require a shell, and a shell would make anything you type into the Coach executable as a command). Point `command` in `coach.config.json` at a real program instead:

```json
{ "command": ["node", "C:/Users/you/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/cli.js"] }
```

or install the native build so you have a real `claude.exe`.

**I changed a file but the browser shows the old version.**
If you enabled the PWA (`?pwa=1`), the service worker caches aggressively. Hard-reload (`Ctrl+Shift+R`), or unregister the worker in DevTools → Application.

**My stats look wrong after editing JSON by hand.**
The app fingerprints your record at startup and shows a drift banner when history changes. To accept your edit as the new truth, delete the `baseline` key from `data/campaign.json` and restart.

**I want to start completely over.**
Stop the server and delete the `data` folder. It will be recreated on the next boot.

---

## How it's built

- **`server.js`** — one file, Node built-ins only, zero third-party packages. Serves static files and reads/writes JSON.
- **`public/`** — vanilla ES modules, no framework, no bundler, no transpiler. A hash router and one view module per screen.
- **`public/laws.js`** — the rules engine (quotas, credit, sealing, sheet counting) as pure functions. **The browser and the test suite import the exact same file**, so the tests audit the real engine rather than a copy of it.
- **`scripts/laws.mjs`** — 116 assertions over that engine. `npm test`.

Contributions welcome. Keep the constraints: **no dependencies, no build step**, everything readable, and `npm test` green. If you change plan structure or rules, update the law audit in the same commit.

---

## Credits & licence

**The problem set is not mine.** The A2Z / TUF+ sheet — its selection, ordering and editorial content — belongs to **[takeuforward.org (Striver)](https://takeuforward.org/)**. This is an unofficial, independent companion tracker with no affiliation or endorsement. `problems.json` stores only problem names, topics, sheet sections and links; the `trigger` / `pattern` / `trap` notes are LLM-generated study commentary, offered in good faith and not authoritative course content. Some linked problems need a TUF+ account, and a few Arena items are LeetCode Premium.

The Codeforces ladder references the **TLE Eliminators CP-31** sheet. Problem links point to LeetCode, Codeforces and takeuforward, whose content belongs to them.

**If this tool is useful to you, go support the people who made the actual curriculum.**

Built by **Madhvansh**. Released under the [MIT Licence](LICENSE) — do what you like with the code.

---

*Now go be honest with yourself for twenty days.*
