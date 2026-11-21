# Company Brain

The colleague who knows, and speaks first. A shared team memory that people curate, with every fact tied to a verbatim quote, and a per-person agent that tells you what needs your attention.

**Hackathon track:** Challenge A. The demo (3 min) must show: it speaks first · people curate the memory · it knows who's asking · it cites · it admits gaps · it only proposes actions · it fits the team's day.

## Core ideas

- **Atomic claims, grounded in quotes.** Every claim carries a verbatim quote from an immutable source. A deterministic gate checks the quote and every literal value before anything is stored.
- **Model error is fenced.** Fields come in three tiers:
  - *literal*: must be readable from the quote (checked mechanically)
  - *resolved*: re-derived by a deterministic resolver (dates, units, currency)
  - *interpretive*: reviewed by a human curator
- **Immutable, verifiable store.** Append-only tables, one global hash chain, and `verify()` re-audits everything.
- **Derived state is a pure function of (log, policy).** Distrust a source retroactively and everything downstream recomputes, with a visible blast radius.
- **Proactivity is a query, not a guess.** Typed, time-aware claims make contradictions, deadlines and cross-claim arithmetic deterministic.
- **Deterministic access.** Policy is applied before any model call. Derived claims inherit the join of their sources' labels.
- **Agents only propose.** Actions wait in a queue; approval is bound to the evidence hash.

## Architecture

```
sources ─► ingest ─► extract (LLM) ─► GATE ─► proposed claims ─► curation ─► approved
                                                                              │
              policy (versioned, in log) ◄────────────────────────────────────┤
                         ▼                                                    ▼
          principal view ─► triggers ─► briefs (LLM wording ─► gate) ─► surfaces
                         └─► retrieve ─► answer (LLM) ─► verifier ─► surfaces
                                           └─ else "no approved evidence"
                         └─► propose_action ─► queue ─► human approval ─► mock executor
```

LLMs appear in four places only (extraction, brief wording, answers, predicate proposals), each followed by a deterministic gate.

## Stack

TypeScript end to end · Next.js (web is the UI) · SQLite via `better-sqlite3` · hand-written SQL migrations · `zod` · `vitest` · LLM calls through the Claude CLI, with record/replay caching for a deterministic demo.

## Status

| Piece | State |
|---|---|
| Sources, quotes, claims, claim events, hash chain, `verify()` | done |
| Gate: quote locate, literal / resolved / interpretive checks | done |
| Migrations with checksums; predicates registry | done |
| Web workbench: ingest, propose through gate, approve/reject, highlight quotes | done |
| Icon top bar (`src/app/nav.tsx`) and `/debug` god-mode GUI: table browser with FK navigation, read-only SQL console, integrity view | done |
| Email source contract (`docs/EMAIL_CONTRACT.md`): Markdown + YAML header, folder inbox, live watcher, append-only ingest ledger, Inbox tab | done |
| Test suite: gate, store, tamper evidence, API routes, debug lib (~95% statements) | done |
| Entity registry | next |
| LLM extraction with repair loop | next |
| Policy + access labels, non-interference test | next |
| Derivation engine, "distrust source" blast radius | next |
| Triggers → proactive briefs (web, Slack-style mock, morning email) | next |
| Answering with citation verifier and "I don't know" | next |
| Action proposals, approval, mock executor | next |
| Scenario generator and ground-truth answer key | next |
| Statement clustering → proposed predicates | stretch |
| Impact-ranked curation queue; independence-aware corroboration | stretch |

## Demo plan (3 min)

Unprompted brief → approve one claim, reject one → cited answer only the approved claim supports → same question as two roles → out-of-data question gets "I don't know" → action waits, then approved → "distrust this source" and watch the brief rewrite.

## Layout

```
migrations/        forward-only SQL, checksummed
src/lib/gate/      the gate: locate, numbers, dates, units
src/lib/store/     DB, hash chain, migrations runner, verify
src/lib/predicates.ts   predicate vocabulary (versioned)
src/app/           Next.js UI and API routes
src/app/debug/     god-mode debug GUI (add a page: new entry in src/app/nav.tsx)
docs/              scenario, email contract, design docs
examples/inbox/    example emails (`npm run inbox:example` copies them into data/inbox)
src/lib/ingest/    email parser, folder ingest, watcher
```

## Run

```bash
npm install
npm run dev        # http://localhost:3000, DB at data/brain.db
npm test           # vitest
npm run test:cov   # with coverage
npm run db:reset   # wipe the local DB
```
