# The 2-Week Sprint Guide — Core CS + System Design (HLD + LLD)

**For:** New-grad / SDE-1 interviews at high-paying product companies
**Runway:** ~14 days · **Mode:** sprint (ruthless prioritization)
**Your edge already built:** a DSA tracker (Project 435) + RecallArena for core-CS recall. This guide tells you exactly how to *use* them.

> The honest hierarchy for SDE-1 at product companies: **DSA decides most of it. System Design (LLD especially, then basic HLD) is the rising second decider. Core CS theory is the supporting act** — cheap to lose points on, hard to win the offer on. So we spend *minimum effective dose* on core CS and *disproportionate effort* on the things that actually create separation.

---

## 0. TL;DR — the 30-second version

1. **You remember what you retrieve, not what you re-read.** Active recall + spaced repetition do ~90% of the work. RecallArena is your engine — use it in *question-first* mode.
2. **"Maximum gap"** = stretch the time between reviews to the longest interval where you can *still just barely recall*. That edge-of-forgetting review is the strongest. For 14 days the ladder is **Day learned → +1 → +3 → +7 → final pass.**
3. **Core CS:** only 4 subjects matter — OS, DBMS, CN, OOP. Watch **one-shot videos once**, then *never re-watch* — convert everything into recall cards. Highest yield: **OS + DBMS > CN > OOP.**
4. **System Design:** the differentiator for a new grad is **a repeatable framework + tradeoffs spoken out loud + clean code in LLD.** Master ~6 LLD problems and ~5 HLD problems *deeply* rather than 30 shallowly.
5. **Never study passively.** For every concept: close the source, rebuild it on a blank page out loud. That rebuild *is* the learning; the video was just input.

---

## PART 0 — The Operating System for Your Brain
*(your literal question: "how to create the maximum gap and remember everything till the interview, and what method of performing")*

### The two levers that beat everything else

Almost all "studying" people do — re-reading notes, re-watching videos, highlighting — builds **familiarity**, not **recall**. It *feels* productive and barely moves the needle. Two techniques do the real work:

**1) Active recall (retrieval practice / the "testing effect").**
Close the source. Ask the question. Force the answer out of your head *before* you check. The effortful act of pulling the answer out is what physically strengthens the memory. Reading the answer again does almost nothing by comparison. This is why a flashcard app like **RecallArena is worth 5× a notes doc** — but only if you answer *before* flipping, every time. No peeking. A miss that you struggled on is more valuable than an easy hit.

**2) Spaced repetition — and what "maximum gap" actually means.**
A memory is strongest right at the moment you successfully recall it *after almost forgetting it*. So the optimal game is to **stretch the gap between reviews to the longest interval where you can still just barely retrieve the answer.** That edge-of-forgetting review (psychologists call it a "desirable difficulty") gives the biggest durability boost per rep.

- Review **too soon** → the answer is still fresh, the rep is wasted, no growth.
- Review **too late** → you've fully forgotten, now it's a re-learn, not a review.
- Review **at the edge** → maximum strengthening per minute spent. *That* is "creating the maximum gap."

So the goal is **not** to grind every card every day. It's to push each item as far apart as you can while still nailing it. That's also *why* it survives a sprint: spacing is the most time-efficient way to hold a large pile of facts till a deadline.

### Your 14-day spacing ladder

Because the runway is short, compress the normal months-long ladder into this:

| When you learn it | Recall #1 | Recall #2 | Recall #3 | Final pass |
|---|---|---|---|---|
| Day *X* | Day *X+1* | Day *X+3* | Day *X+7* | Day 13–14 |

Worked examples:

- Learn **OS** on Day 1 → recall Day 2, Day 4, Day 8, Day 13.
- Learn **DBMS** on Day 3 → recall Day 4, Day 6, Day 10, Day 14.
- Learn **CN** on Day 5 → recall Day 6, Day 8, Day 12, Day 14.

RecallArena should be doing this scheduling for you — if it supports due-dates, trust the queue and only review what's due. If not, tag cards by "learned-on day" and follow the ladder manually. **The day-before-interview pass is non-negotiable** — it's the cheapest retention you'll ever buy.

### The "method of performing" — how to actually drill each thing

Passive input is the trap. Here's the active protocol per type:

**Core CS theory →** *Question-first, out loud.*
Read the question, then answer *aloud as if the interviewer is sitting there* (or write it), THEN check. Grade yourself honestly. Every miss becomes/updates a RecallArena card. For any concept you can't say in plain words, run a **Feynman pass**: explain it to an imaginary 12-year-old; the exact sentence where you stumble is your knowledge gap — go fix that one thing.

**System Design →** *"Study one, build one."*
Never let watching count as studying. After one design (video or article), **close everything and rebuild it from a blank page/whiteboard, talking out loud, inside your framework**, time-boxed. The blank-page rebuild *is* the rep. Then diff yours against the source and note what you missed.

**Interleave, don't block.**
Don't do 3 straight hours of only OS. Mix blocks (e.g., OS recall → a DSA set → one SD case). Switching between topics feels harder but builds the exact muscle the interview tests — pulling the right knowledge cold, on demand.

**Protect the inputs to memory.**
Sleep is when memories consolidate — a wrecked sleep schedule will quietly delete your day's work. Verbalize everything, because interviews are spoken, not written. And keep reps *effortful* — if it feels easy, you're probably re-reading, not recalling.

### Your daily ritual (repeat all 14 days)

1. **Warm-up (15 min):** clear today's RecallArena due-cards *before* new material. This is the spacing engine; it comes first.
2. **Hard block (most-energy hours):** the day's *new* hard thing — usually System Design or DSA — on a blank page, out loud.
3. **Core CS block:** one subject's one-shot → immediately convert to cards → first self-test.
4. **Cooldown (15 min):** write tomorrow's 3 "must-recall" items from memory. Lights out on time.

---

## PART 1 — The 14-Day Sprint Calendar

### Priority stack for new-grad SDE-1 (where the hours go)

1. **DSA** — still the #1 gate. Keep your tracker running **every single day**; it's assumed as a constant below, not re-taught here.
2. **LLD / machine coding** — the fastest-rising decider and where freshers separate. ~6 problems deep.
3. **HLD basics** — increasingly asked even of new grads (URL shortener, rate limiter, etc.). Framework + ~5 problems.
4. **Core CS theory (OS, DBMS, CN, OOP)** — supporting act. One-shot → cards → spaced recall. Don't over-invest.

Rough split of *non-DSA* time: **System Design ~60% · Core CS ~40%.** DSA sits on top of both as your daily constant.

### The calendar

| Day | Hard block (AM) | Second block | Recall / spacing |
|---|---|---|---|
| **1** | SD: HLD framework + building blocks | Core CS: **OS** one-shot → cards | — |
| **2** | LLD: OOP + SOLID + first pattern | HLD: **URL shortener** (full) | OS recall #1 |
| **3** | SD: caching, DB, sharding, LB deep-read | Core CS: **DBMS** one-shot → cards | OS #2 |
| **4** | LLD: **Parking Lot** (blank-page build) | HLD: **Rate limiter** | DBMS #1 · OS #2 |
| **5** | SD: queues, consistency, CAP | Core CS: **CN** one-shot → cards | DBMS #2 |
| **6** | LLD: **BookMyShow** + Strategy/Observer | HLD: **Pastebin / Instagram feed** | CN #1 · OS #3 |
| **7** | SD: estimation drills + API design | Core CS: **OOP** one-shot → cards | DBMS #3 · CN #2 |
| **8** | LLD: **Splitwise** + **LRU cache** | HLD: **Notification / chat (basic)** | OOP #1 · OS #3 |
| **9** | **Mock #1** (HLD, out loud, timed) | Fix gaps from mock | CN #3 · DBMS #3 |
| **10** | LLD: **Elevator** + concurrency basics | HLD: **Typeahead / news feed** | OOP #2 |
| **11** | **Mock #2** (LLD machine coding, timed) | Fix gaps | Core CS interleaved recall |
| **12** | SD: re-build any 2 weak designs | Core CS: weak-card blitz | OOP #3 |
| **13** | **Full final recall pass** (all 4 subjects) | Re-skim your SD framework cards | Everything due |
| **14** | Light review + 1 easy mock | Logistics, sleep early | Final edge-of-forgetting pass |

If you have fewer hours/day, cut **HLD second-blocks first** (keep LLD + framework), then trim CN/OOP depth — never cut the daily recall warm-up.

---

## PART 2 — Core CS (the supporting act, done at minimum effective dose)

### Why it still matters (don't skip it)

For product companies, core CS rarely *wins* you the offer, but a fumbled "what's a deadlock / what's normalization / explain TCP handshake" is an easy, avoidable ding — and at Indian product/service-plus companies it's often a full dedicated round. Goal: **be unfumbleable on the top 20 questions per subject**, not encyclopedic.

### Subject priority (highest yield first)

**OS ≈ DBMS  >  CN  >  OOP**

OS and DBMS produce the most interview questions and the most follow-up depth. CN is high-frequency but shallow (a fixed set of "explain X" questions). OOP overlaps heavily with your LLD prep, so it's partly free.

### The one resource pattern: one-shot → cards → never re-watch

**[Gate Smashers](https://www.youtube.com/gatesmashers)** is the consensus gold standard for OS, DBMS, CN, and OOP — clear, exam-focused, one-stop. **[Knowledge Gate](https://www.youtube.com/@KnowledgeGate)** is the strong alternative (great OS/DBMS one-shots). For OOP specifically, **Kunal Kushwaha's** OOP playlist is well regarded. Watch the one-shot **once**, at 1.25–1.5×, pausing only to make recall cards. Then it's RecallArena from there on.

### OS — what to actually know

High-yield topics: **process vs thread; process states & context switching; CPU scheduling (FCFS, SJF, Round Robin, priority) + computing avg waiting/turnaround time; concurrency — critical section, mutex vs semaphore, producer-consumer; deadlock — 4 Coffman conditions, prevention/avoidance (Banker's), detection; memory — paging, segmentation, virtual memory, demand paging; page-replacement (FIFO, LRU, Optimal) + thrashing; fragmentation.**

Must-be-instant questions: thread vs process · mutex vs semaphore · what causes a deadlock + how to prevent · paging vs segmentation · virtual memory & page fault flow · why context switching is expensive · user vs kernel mode.

### DBMS — what to actually know

High-yield topics: **ACID properties; normalization (1NF→BCNF) + when to denormalize; keys (primary, candidate, foreign, super); joins (inner/outer/self) — be able to write them; indexing (B/B+ tree, clustered vs non-clustered) + when indexes hurt; transactions, concurrency control, locks, 2-phase locking; isolation levels + dirty/non-repeatable/phantom reads; SQL vs NoSQL tradeoffs.** Be ready to *write* a couple of medium SQL queries (GROUP BY/HAVING, join, subquery, 2nd-highest salary).

Must-be-instant questions: explain ACID · normalization vs denormalization (with example) · clustered vs non-clustered index · how does an index speed up reads & what's the cost · what are isolation levels · SQL vs NoSQL — when each.

### CN — what to actually know (shallow but frequent)

High-yield topics: **OSI vs TCP/IP layers; TCP vs UDP; the 3-way handshake; what happens when you type a URL and press enter (DNS → TCP → TLS → HTTP → render) — this is the #1 CN question; HTTP/HTTPS, status codes, HTTP methods; DNS; IP/subnetting basics; how TLS/SSL works at a high level; public vs private IP, NAT.**

Must-be-instant questions: **"what happens when you type google.com and hit enter"** · TCP vs UDP · 3-way handshake · HTTP vs HTTPS · what is DNS · difference between OSI and TCP/IP models.

### OOP — what to actually know (overlaps with LLD)

High-yield topics: **4 pillars — encapsulation, abstraction, inheritance, polymorphism (with a crisp real example each); compile-time vs runtime polymorphism (overloading vs overriding); abstract class vs interface (and when to use which); association vs aggregation vs composition; SOLID principles (cover these in the LLD block).**

Must-be-instant questions: 4 pillars with examples · overloading vs overriding · abstract class vs interface · is-a vs has-a · why composition over inheritance.

### The answer format that scores (theory rounds)

For any theory question: **(1) one-line crisp definition → (2) a concrete real-world example → (3) one tradeoff or "when to use."** That 3-beat structure makes you sound like an engineer, not a textbook. Practice *saying* it; reading it is not the same skill.

---

## PART 3 — System Design: HLD (High-Level Design), in depth

### What HLD actually tests (and what a new grad is really asked)

HLD evaluates whether you can take a vague prompt ("design a URL shortener") and **drive it to a scalable architecture while reasoning about tradeoffs out loud.** For a new grad, interviewers don't expect a Staff-engineer answer. They're checking: *Can you structure the problem? Do you ask about requirements before drawing? Can you do rough math? Do you know the standard building blocks and when to reach for each?* Freshers get the *approachable* set — **URL shortener, rate limiter, Pastebin, a basic Instagram/Twitter feed, a basic chat app, a notification system, typeahead/autocomplete** — not "design all of Netflix."

> **Where the gap is created:** 90% of candidates start drawing boxes immediately and ramble. The ones who stand out **follow the same framework every time**, state assumptions, and quantify. Structure *is* the signal. Build the template below until it's muscle memory — that single habit is your biggest HLD edge.

### The interview framework (your repeatable template)

Use this exact order, every problem, ~35–45 min:

1. **Requirements (5 min).**
   - *Functional* — what the system must do (the 2–3 core features only; explicitly defer the rest).
   - *Non-functional* — scale, availability, latency, consistency vs availability, read/write ratio. **Ask, don't assume.**
2. **Estimation / back-of-envelope (3–5 min).** Users → QPS (read & write separately) → storage/yr → bandwidth. Even rough numbers signal seniority; skipping this is the #1 fresher tell.
3. **API design (3 min).** The handful of endpoints (REST): method, path, params, response. This pins down the contract.
4. **Data model (3–5 min).** Core entities, key fields, and the big decision: **SQL vs NoSQL — and *why*.**
5. **High-level design (10–12 min).** Draw the happy path: Client → Load Balancer → App servers → Cache → DB, plus CDN / queue / blob store as needed. Walk one request end-to-end.
6. **Deep dive on the bottleneck (8–10 min).** Pick the hard part (the hot read path, the unique-ID generation, the fan-out) and go deep: caching strategy, sharding key, replication, consistency.
7. **Wrap-up / tradeoffs (2 min).** Bottlenecks, single points of failure, what you'd add at 10× scale. *Always* end on tradeoffs — it's the strongest closing signal.

Memorize the spine as one line: **Requirements → Estimate → API → Data → High-level → Deep-dive → Tradeoffs.**

### Back-of-envelope numbers to memorize

Powers of two: 2^10 ≈ **1 thousand** (KB), 2^20 ≈ **1 million** (MB), 2^30 ≈ **1 billion** (GB), 2^40 ≈ trillion (TB).
Time: **86,400 ≈ 100K seconds/day.** So *"X per day" ÷ 100K ≈ X per second.* (1M/day ≈ 12 QPS; 1B/day ≈ 12K QPS.)
Latency intuition: memory read ~100 ns · SSD ~100 µs · network round-trip within a datacenter ~0.5 ms · disk seek ~10 ms · cross-continent RTT ~150 ms. **Memory ≫ SSD ≫ disk ≫ network** — that ordering drives most caching decisions.
Typical assumptions to state: read:write ratio (often **100:1**, read-heavy), ~500 bytes–1 KB per simple record, 1 server ≈ a few thousand QPS.

### The building blocks you MUST be able to define in one line

- **Load balancer** — spreads traffic across servers (round-robin / least-connections); enables horizontal scale + failover.
- **Reverse proxy** — front door that terminates TLS, routes, caches, hides backends.
- **Cache (Redis / Memcached)** — keep hot data in memory; strategies: **cache-aside** (most common), write-through, write-back; **eviction**: LRU/LFU/TTL. Watch for stampede & invalidation.
- **CDN** — caches static/media at edge near users; cuts latency & origin load.
- **Database — SQL vs NoSQL** — SQL: strong consistency, joins, transactions (ACID), structured. NoSQL: horizontal scale, flexible schema, high write throughput, eventual consistency. *Choose by access pattern, not hype.*
- **Replication** — copies of data (leader-follower) for read scaling + availability; introduces replication lag.
- **Sharding / partitioning** — split data across nodes by a shard key (hash vs range); the key choice is everything (avoid hotspots).
- **Indexing** — speeds reads, slows writes & costs storage; know B+ tree index.
- **Message queue (Kafka / RabbitMQ / SQS)** — decouples producers/consumers, smooths spikes, enables async processing & retries.
- **Consistent hashing** — distribute keys across a changing set of nodes with minimal reshuffling; backbone of caches & sharded stores.
- **CAP theorem** — under a network partition you choose **Consistency or Availability**. Most web systems pick AP + eventual consistency; finance leans CP.
- **Consistency models** — strong vs eventual; pick per feature (your bank balance = strong; your like-count = eventual).
- **Rate limiter** — protect the system: token bucket, leaky bucket, fixed/sliding window.
- **Blob/object store (S3)** — for images/video/files; store the blob in S3, the *URL* in your DB.
- **Search (Elasticsearch)** — inverted index for full-text/typeahead.
- **WebSocket vs polling vs SSE** — for real-time (chat, live feed): WebSocket = full-duplex persistent; long-poll/SSE = lighter, one-way.
- **Idempotency** — same request twice = same effect (critical for payments, retries).

If you can say each of those in a sentence *and name when you'd use it*, you have ~80% of what a new-grad HLD round needs.

### Worked example — URL shortener (the canonical first problem)

A compressed run of the framework so you see the shape:

- **Functional:** shorten a long URL → short code; redirect short → long; (optional) custom alias, expiry, analytics.
- **Non-functional:** highly available, redirect latency < ~100 ms, read-heavy (**~100:1**), short codes never collide.
- **Estimate:** say 100M new URLs/day → ~**1.16K writes/s**; at 100:1 → ~**116K reads/s**. 100M/day × 5 yr × ~500 B ≈ low-hundreds of TB → plan for sharding.
- **API:** `POST /shorten {long_url} → {short_url}` · `GET /{code} → 301/302 redirect`.
- **Data model:** `code (PK) → long_url, created_at, expiry, owner`. Read-heavy + simple key lookup → a **key-value/NoSQL** store fits well; SQL also fine at this scale.
- **Code generation:** base-62 encode an auto-increment ID, or hash + collision-check, or a pre-generated key range per server. Discuss the collision tradeoff — this is the natural **deep-dive**.
- **High-level:** Client → LB → app servers → **cache (hot codes in Redis)** → DB; redirects served mostly from cache; **301 vs 302** (301 = permanent, browser-cached, fewer analytics; 302 = temporary, every hit returns to you → better analytics).
- **Scale/deep-dive:** shard by code, add read replicas, CDN for redirects, a rate limiter on `POST /shorten` to stop abuse.
- **Wrap:** SPOF check, cache invalidation on expiry, what changes at 10×.

Internalize *this* and the rate limiter, and you can adapt the same spine to Pastebin, Instagram feed, notifications, and typeahead.

### The HLD shortlist to master (≈5, deeply)

| Problem | What it teaches you |
|---|---|
| **URL shortener** | ID generation, base-62, read-heavy caching, 301 vs 302 |
| **Rate limiter** | Token/leaky bucket, sliding window, where to place it |
| **Pastebin / text-store** | Blob storage vs DB, TTL/expiry, CDN |
| **Instagram/Twitter feed** | Fan-out on write vs read, denormalization, feed caching |
| **Chat / notification system** | WebSockets, message queues, delivery & fan-out, presence |

Master these five and you can *transfer* the patterns to almost any new-grad prompt.

### HLD resources (pick ONE primary, don't channel-surf)

- **[Gaurav Sen — System Design playlist](https://www.youtube.com/channel/UCRPMAqdtSgd0Ipeef7iFsKw)** — best for fundamentals & intuition; beginner-friendly case studies (WhatsApp, Tinder, etc.). *Good primary for a sprint.*
- **[ByteByteGo — system-design-101 (free GitHub)](https://github.com/ByteByteGoHq/system-design-101)** + the Alex Xu *System Design Interview* book — the best visual diagrams; great for the building blocks.
- **[The System Design Primer (free GitHub)](https://github.com/donnemartin/system-design-primer)** — the classic free reference; skim the index, deep-read the topics you're weak on.
- **[Hello Interview](https://www.hellointerview.com/)** — modern, framework-driven, excellent for "how to actually run the round."
- **[Arpit Bhayani](https://www.youtube.com/c/arpitbhayani/playlists)** — deeper DB/caching dives; dip in *only* for a specific deep-dive, not for breadth in a sprint.

Sprint move: **Gaurav Sen or Hello Interview for the framework + 5 case studies, ByteByteGo 101 for building-block diagrams, Primer as a lookup.** That's it. Resist adding a 4th.

---

## PART 4 — System Design: LLD (Low-Level Design / Machine Coding), in depth

### Why LLD is where a new grad creates the most separation

HLD answers can blur together; **LLD is where you either write clean, extensible, working code under time pressure — or you don't.** It's harder to fake and increasingly a dedicated round (Amazon, Google, Microsoft, Uber, Swiggy, Razorpay, Atlassian, PhonePe, Paytm, most top startups). Because it rewards *clean OOP + the right pattern + actually-compiling code*, a fresher who has drilled 6 problems looks dramatically better than one who "kind of knows design patterns." **This is your highest-ROI separation as an SDE-1.**

Two formats: **machine coding** (75–90 min: build a working CLI/in-memory solution) or **face-to-face design discussion** (45–60 min: classes, relationships, patterns, sometimes concurrency). Prepare for machine coding; the discussion is a subset of it.

### Foundation 1 — OOP, interview-tight

- **Encapsulation** — bundle data + methods, hide internals behind a clean interface (private fields, getters/setters with intent).
- **Abstraction** — expose *what*, hide *how* (interfaces / abstract classes).
- **Inheritance** — is-a reuse; use sparingly, **prefer composition** for has-a.
- **Polymorphism** — one interface, many implementations; **overloading** (compile-time) vs **overriding** (runtime).

### Foundation 2 — SOLID (know the smell each one fixes)

- **S — Single Responsibility:** one class, one reason to change. *Smell:* a `God` class doing parsing + persistence + printing.
- **O — Open/Closed:** open to extension, closed to modification. *Smell:* a giant `switch` you keep editing for every new type → use polymorphism/Strategy.
- **L — Liskov Substitution:** subtypes must be usable wherever the base is. *Smell:* `Square extends Rectangle` breaking `setWidth`.
- **I — Interface Segregation:** many small interfaces > one fat one. *Smell:* implementing methods you throw `NotSupported` on.
- **D — Dependency Inversion:** depend on abstractions, not concretions. *Smell:* `new MySQLDb()` hard-wired inside business logic → inject an interface.

In the interview, **name the principle as you apply it** ("I'll put fee calculation behind a `PricingStrategy` so it's open/closed"). That narration is a strong signal.

### Foundation 3 — the patterns that actually show up

The four that appear constantly: **Strategy, Observer, Factory, Singleton.** Then **Builder, Decorator, Command, Adapter, Facade, State.** For each, learn *the one-line intent + the canonical use*:

- **Strategy** — swap an algorithm at runtime. *Use:* pricing/fee rules, payment methods, sorting policy. (Open/Closed in action.)
- **Observer** — notify many subscribers on a state change. *Use:* notifications, event systems, "stock price changed."
- **Factory / Abstract Factory** — create objects without hard-coding the concrete class. *Use:* create `Vehicle`/`Spot` by type.
- **Singleton** — one shared instance. *Use:* a config, a `ParkingLot` controller. (Make it thread-safe; know the criticism.)
- **Builder** — construct a complex object step-by-step. *Use:* building an order/pizza/HTTP request with many optional fields.
- **Decorator** — add behavior without subclass explosion. *Use:* coffee + add-ons, I/O streams.
- **Command** — encapsulate a request as an object. *Use:* elevator requests, undo/redo, job queues.
- **Adapter / Facade** — make incompatible interfaces work / hide a complex subsystem behind a simple API.
- **State** — behavior changes with internal state. *Use:* vending machine, order lifecycle, traffic light.

Don't memorize UML for all 23 GoF patterns — that's a sprint trap. **Know these ~10 by intent and you can solve essentially every fresher LLD prompt.**

### The LLD interview framework (your repeatable template)

1. **Clarify requirements (5 min)** — list the core use-cases as bullet actions ("park a vehicle," "calculate fee," "find nearest spot"). Pin scope; defer the rest.
2. **Identify entities → classes (5 min)** — nouns become classes (`ParkingLot`, `Floor`, `Spot`, `Vehicle`, `Ticket`). State each class's single responsibility.
3. **Define relationships** — has-a (composition/aggregation) vs is-a (inheritance). Draw a quick class sketch.
4. **Apply patterns where they fit** — *announce them*: Factory for object creation, Strategy for varying rules, Singleton for the controller, Observer for notifications.
5. **Code the core flows (bulk of the time)** — clean classes, small methods, meaningful names, interfaces over concretes. Get the **happy path running** first, then edge cases.
6. **Handle concurrency if asked** — "two cars, one spot": locks/synchronization, thread-safe collections, atomic ops.
7. **Walk a sample run + note extensions** — show it works; mention what's easy to extend (Open/Closed) — strong close.

### Concurrency basics (the common follow-up)

After your design works single-threaded, expect *"what if 1000 users hit this at once?"* Be ready to discuss: **race conditions**, **mutex/lock** vs **synchronized**, **thread-safe collections** (e.g., `ConcurrentHashMap`), **atomic** operations, and where to put the lock to avoid double-booking (lock the *spot*, not the whole lot). You don't need a perfect concurrent implementation as a fresher — you need to *spot the hazard and name the fix*.

### The LLD shortlist to master (≈6, build them by hand)

| Problem | Patterns it exercises | Why it's on the list |
|---|---|---|
| **Parking Lot** | Singleton, Factory, Strategy | The #1 canonical; covers entities, fees, allocation |
| **BookMyShow / movie booking** | Strategy, Observer, locking | Seat selection + concurrency (double-booking) |
| **Splitwise** | Strategy, graph/balance logic | Expense split algorithms, settle-up |
| **Elevator system** | Command, State, Strategy | Scheduling, request handling, multiple cars |
| **LRU / LFU cache** | HashMap + Doubly Linked List | Pure data-structure design under O(1) constraints |
| **Rate limiter / Logging framework / Vending machine** | State, Strategy, Chain of Responsibility | Pick 1–2; classic, compact, pattern-rich |

Build each **from a blank file, running, in your strongest language.** Then write the 5-line "interview skeleton" (class list + patterns) into RecallArena so you can reproduce the structure cold.

### How to practice machine coding (do this, not passive reading)

Take 5–6 solved examples, study them once, then **re-solve from scratch on a timer** before looking at the solution. Each session: start with a couple of short pattern videos to warm up, then code one full problem in ≤90 min. Optimize for **readable, modular, extensible** code over cleverness — interviewers reward single-responsibility classes, small methods, and clean separation. A compiling 80% solution beats a beautiful 50% sketch.

### LLD resources

- **[Concept && Coding (Shrayansh)](https://www.youtube.com/@ConceptandCoding)** — the most-followed LLD + design-patterns playlist in India; great for the pattern catalog and worked problems.
- **[awesome-low-level-design (ashishps1, free GitHub)](https://github.com/ashishps1/awesome-low-level-design)** — curated free LLD resources, problems with solutions, and pattern references.
- **[workat.tech — Machine Coding](https://workat.tech/machine-coding)** — how the round is graded + practice problems.
- **[CodeZym](https://codezym.com/)** — practice machine-coding problems using patterns, with a 7-day roadmap.
- **[low-level-design-primer (prasadgujar, GitHub)](https://github.com/prasadgujar/low-level-design-primer)** — solutions catalog for the common problems.

Sprint move: **Concept && Coding for patterns + 6 problems, awesome-low-level-design as your problem bank, workat.tech to understand grading.**

---

## PART 5 — How to create the MAXIMUM GAP (the edge over other candidates)

You used "gap" two ways, and both matter:

- **Retention gap** (Part 0): stretch review intervals to the edge of forgetting → remember everything till interview day. *Covered.*
- **Competitive gap** (here): out-separate other new grads in the room. Below is where freshers actually win or lose.

### The 6 differentiators that create separation

1. **A visible framework.** You run the *same* spine every time (HLD: Requirements→Estimate→API→Data→Design→Deep-dive→Tradeoffs; LLD: Requirements→Entities→Relationships→Patterns→Code→Concurrency). Structure under pressure reads as competence. This alone beats most freshers.
2. **You quantify.** Even rough back-of-envelope math (QPS, storage) instantly signals you think like an engineer. Most freshers skip it — that's free separation.
3. **You speak tradeoffs, unprompted.** "SQL gives me transactions but NoSQL scales writes better; given this is read-heavy I'll…". Naming the tradeoff *and choosing* is the senior signal interviewers hunt for.
4. **Clean, running LLD code.** Single-responsibility classes, a named pattern, a compiling happy-path. This is the hardest thing to fake and the easiest place to look excellent.
5. **Depth over breadth.** 5 HLD + 6 LLD problems known *cold* (you can rebuild from blank) beats 30 skimmed. Interviewers probe depth; shallow breadth collapses under one follow-up.
6. **You drive the conversation.** State assumptions, narrate your thinking, check in ("does this scope sound right?"). Passive candidates wait to be asked; strong ones lead.

### What ~90% of candidates do wrong (so you don't)

- Start drawing/coding before clarifying requirements.
- Re-watch videos and feel ready — then freeze on a blank page because they never *produced* anything.
- Memorize one "perfect" solution and can't adapt when the prompt shifts.
- Go silent while thinking (the interviewer can't score silence — **think out loud**).
- Skip the estimation math and the closing tradeoffs.

### The mock-interview protocol (non-negotiable: do ≥2–3)

A design known silently in your head ≠ a design you can *perform* out loud under a clock. Schedule **2 system-design mocks** (one HLD, one LLD) during the sprint — Days 9 and 11 on the calendar. Use a peer, or talk to a webcam/recording for 40 minutes, then watch it back. You'll catch rambling, silence, and skipped steps you can't feel in the moment. Free mock platforms (Pramp / interviewing.io style) or a friend both work. **The recording is the cheapest feedback you'll get.**

### Week-of and day-of checklist

- **Days 13–14:** final edge-of-forgetting recall pass on *all four* core CS subjects + your framework cards. No new material.
- **Day-of:** re-read only your two framework spines (HLD + LLD) and your estimation numbers. Don't cram new content — it raises anxiety and crowds working memory.
- **In the round:** restate the problem → clarify requirements → *then* think out loud through your spine → manage the clock (don't over-invest in one section) → end on tradeoffs.
- **Mindset:** for SDE-1 they're testing *trajectory and structure*, not perfection. A clear, well-narrated 80% beats a silent, scattered 100%.

---

## Appendix A — Consolidated resources (pick one primary per area)

**Core CS one-shots**
- OS / DBMS / CN / OOP → **[Gate Smashers](https://www.youtube.com/gatesmashers)** (primary), **[Knowledge Gate](https://www.youtube.com/@KnowledgeGate)** (alt)
- OOP → **Kunal Kushwaha** OOP playlist

**HLD**
- **[Gaurav Sen](https://www.youtube.com/channel/UCRPMAqdtSgd0Ipeef7iFsKw)** (fundamentals + case studies) · **[Hello Interview](https://www.hellointerview.com/)** (framework)
- **[ByteByteGo system-design-101](https://github.com/ByteByteGoHq/system-design-101)** (diagrams) · **[System Design Primer](https://github.com/donnemartin/system-design-primer)** (reference) · **[Arpit Bhayani](https://www.youtube.com/c/arpitbhayani/playlists)** (deep dives)

**LLD**
- **[Concept && Coding](https://www.youtube.com/@ConceptandCoding)** (patterns + problems) · **[awesome-low-level-design](https://github.com/ashishps1/awesome-low-level-design)** (free problem bank)
- **[workat.tech machine coding](https://workat.tech/machine-coding)** (grading) · **[CodeZym](https://codezym.com/)** (practice + roadmap)

**Memory engine**
- **RecallArena** (your app) for all core-CS + framework recall · your **DSA tracker (Project 435)** for DSA spacing.

## Appendix B — The one-page mental model

```
RETENTION:  retrieve, don't re-read  →  space to the edge of forgetting  →  final pass Day 13–14
PRIORITY:   DSA (daily)  >  LLD (6 problems)  >  HLD (framework + 5)  >  Core CS (OS≈DBMS > CN > OOP)
HLD SPINE:  Requirements → Estimate → API → Data → High-level → Deep-dive → Tradeoffs
LLD SPINE:  Requirements → Entities → Relationships → Patterns → Code → Concurrency
EDGE:       framework + quantify + tradeoffs-out-loud + clean running code + depth + drive
PERFORM:    study one → rebuild on a blank page, out loud, on a timer → mock ≥2x
```

*Build the habits, not just the notes. The candidate who has rehearsed performing — out loud, on a blank page, against a clock — wins the room.*



