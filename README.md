# 🏡 HouseChores

A family chore tracker for the kids: they log chores, parents approve, everyone earns **points** and builds **streaks**. Designed to feed a family bank (AbaBank) later — every approved chore writes an immutable `earn_event` the bank can convert to money.

## Core loop

1. Kid taps their name on the shared tablet → sees today's chores + the board.
2. Kid taps **Done!** → chore goes to ⏳ *waiting*; the streak optimistically ticks up.
3. Parent unlocks **Parent mode** (PIN) → **approval queue** → ✓ / ✗ (or **Approve all**).
4. On ✓, an immutable `earn_event` is written and the kid's ⭐ points balance goes up.

## Concepts

- **Recurring chores** — assigned to specific kids, generated fresh **daily**. Each has its own per-chore streak 🔥. Missing a day breaks that streak (unless the day is *excused*).
- **Streak award** (optional, per recurring chore) — a bonus credited on top of the chore's points each time the streak is kept. Fully configurable per chore: a **base award**, the **streak length** (every N days), and the **stacking bonus** (how much it adds each N days): `award = base + floor(streak / N) × step`. E.g. base 3, every 5 days, +2 → 5-day streak = 5, 10-day = 7, 20-day = 11. Shown as 🎁 on the kid's row and in the approval queue; folded into that completion's `earn_event`.
- **Board** — unassigned tasks anyone can grab (just do → approve). No streaks. Two flavors: **one-off** (post it once, persists until done or removed) and **recurring by weekday** (pick weekdays — e.g. trash on Tue — and a fresh instance appears on the board each matching day, expiring at day's end if undone).
- **Alternating (rotating) chores** — shared jobs that hand off between a chosen set of kids. Parent picks the cadence per chore: **daily** (new kid each day), **on-completion** (baton passes when approved), or **weekly** (new kid each week). Shows "🔁 Your turn!" to the current kid and "Dotan's turn" to the others. Earns points, no streaks (it's a shared job). Daily/weekly rotation is deterministic from an anchor date; on-completion advances a stored pointer on approval. A per-chore **"Whose turn today"** setting (a `turn_offset` phase) lets you stagger chores created the same day — e.g. Morning-walk on Emma while Afternoon-walk is on Dotan, then they swap.
- **Points** — abstract, parent-set per chore. Balance = sum of approved earns. Points are a spendable balance (AbaBank will later convert & zero them).
- **Excused days** — parent marks a kid (or the whole family) off for a date range: no chores generated, streaks frozen not broken.
- **Immutability** — a completion snapshots its point value; changing a chore's points later only affects future completions. Chores are soft-deleted, never hard-deleted.

## The AbaBank seam (built, not yet wired)

`earn_event(kid_id, task_id, points, created_at, consumed_by_bank)` is the source of truth for points. HouseChores only knows points; AbaBank will later read this ledger, set the points→money exchange rate, and write conversion events that decrement balances. No rework needed here.

## Stack

- **Next.js 15** (App Router, Server Actions) — no client JS framework beyond React.
- **`node:sqlite`** — the built-in SQLite in Node 24, zero native deps. DB lives in `data/housechores.db` (gitignored).
- Plain CSS, big-touch tablet UI.

## Run

```bash
npm install
npm run seed      # creates 3 placeholder kids + sample chores (idempotent)
npm run dev       # http://localhost:3939
```

Default **parent PIN: `1234`** — change it in Parent → Admin.

Placeholder kids are named "Kid A/B/C" — rename them (and set emoji/colour) in Parent → Admin.

## AbaBank cash-out (wired)

Parent → **🏛️ Bank** converts a kid's points to money and pushes it to AbaBank:

1. Set the AbaBank **URL** + **ingest token** (matches AbaBank's `CHORES_INGEST_TOKEN`), **points-per-dollar**, and **currency**.
2. **Map** each kid to their AbaBank user (exact name, or numeric id).
3. **Cash out** → consumes the kid's points into a `conversion` row, marks the underlying `earn_event`s `consumed_by_bank`, and `POST`s to `POST /api/ingest/chore-payout`, which creates a **pending deposit** in AbaBank. You approve it once in the bank (approval = cash moves).

The push is **idempotent** on `external_id`, so a failed conversion can be safely **retried** from the history list.

## Roadmap

- [x] Core loop: profiles, recurring + board, log → approve → points → streaks, excused days, PIN admin
- [x] Richer stats / history views
- [x] Dedicated big-icon "picture mode" for the youngest
- [x] AbaBank wiring (points → money, cash-out → pending deposit)
- [ ] WhatsApp: debounced approval nudge to parents + reply-to-approve
