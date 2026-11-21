# worldgen

Gives it a scenario in free text and it builds the simulated world around it: the emails, news articles and documents of a fictional company, in the formats of `docs/EMAIL_CONTRACT.md`, `docs/NEWS_CONTRACT.md` and `docs/DOCUMENT_CONTRACT.md`, plus the answer key and a one-page summary. All data is synthetic.

The world contains raw materials only: nothing of the system (no claims, conclusions or actions).

## One command

```bash
npm run world:make -- "Aumento improvviso dei prezzi: il prezzo della semola sale e un'azienda di pasta deve capire cosa fare."
npm run world:make -- --file scenario.txt --lang en
```

No stops in the middle. It produces `worlds/<slug>/`:

| Path | What it is |
|---|---|
| `scenario.json` | The scenario as structured data: company, people, roles, facts, formulas, pieces, expected questions. |
| `t0/`, `t1/`, … | The materials by tier (moment of the story): `emails/`, `news/`, `docs/`, in the source contracts. |
| `ANSWERS.json` | The ground truth: questions per role, expected outcome (`answer`, `unknown`, `denied`), values and sources to cite, adversarial prompts. |
| `SUMMARY.md` | One page to read afterwards: who is who, what each piece says, every fact, every derived value with its formula, the expected answers. |
| `recordings/` | The model's answers, one JSON per answer. Committed, so the same world can be rebuilt without a model. |

Options: `--lang`, `--company`, `--slug`, `--writer auto|replay|record`, `--model`, `--planner-model`, `--concurrency`, `--out`. Run the CLI without arguments for the full list.

## How it works

```
free text ─► PLANNER (model) ─► scenario.json ─► lint (no model) ─► compile ─► WRITERS (model) ─► checks ─► files
                  ▲                                  │                            ▲                 │
                  └────────── problems fed back ◄────┘                            └── feedback ◄────┘
```

1. **Planner.** The model turns the text into a scenario spec (JSON). The spec is validated with a schema and a lint that needs no model; whatever fails is sent back to the model until the spec is valid.
2. **Facts ledger.** Every figure, date or key phrase is a fact, written once (`"text": "412 €/t"`). Pieces list the fact ids they state. The facts a piece must contain, and the numbers and dates it may contain, come from the ledger, so a value cannot differ from one document to the next.
3. **Derived values** (totals, differences, percentages, costs, savings) are formulas over the facts, evaluated by a small safe parser (no `eval`). They never appear in any material: the system under test has to compute them. They feed the answer key.
4. **Writers.** Each piece is written by the model playing its author: a persona (voice) and only the facts that person knows from their own earlier messages and documents. A reply sees the message it answers. Headers, ids, dates, labels and the quote of a parent message are composed by code, never by the model.
5. **Checks** on every piece, with repair: the file satisfies the source contract (the real parsers in `src/lib/ingest`); every required fact appears verbatim; no number or date that is neither required nor allowed; no derived value; no banned word. Failures go back to the writer as feedback, up to 3 attempts.
6. **Coverage.** The lint also checks that the scenario gives the demo what it needs: two or more tiers, a restricted piece that some role cannot see, a weak source (`reliability: low`), a correction (`corrects` / `supersedes`), three roles with a curator, a derived value, and expected answers of each kind. Visibility of the expected answers is checked too: an `answer` cites only pieces its role can see; a `denied` cites one it cannot.

Pieces without a pending parent are written in parallel (`--concurrency`, default 3).

## What the checks do and do not catch

They catch invented numbers and dates (numeric or `dd/mm/yyyy`), missing facts, derived values leaking into sources, contract violations, broken links and wrong time order. Identifiers (`PO-4471`), part codes (`K7`), times, years, list and article numbering are not counted as numbers.

They do not catch a scenario that is internally consistent but wrong in domain terms (a plausible but meaningless formula), nor dates written in words ("25 November") or figures written in words. Read `SUMMARY.md` after a run.

## Recordings

`--writer auto` (default) reads a recording if there is one and calls `claude` for what is missing. The key is the hash of the full prompt and the model, so a changed scenario, company, language or prompt never replays an old answer. `--writer replay` uses recordings only (no model, no login) and fails if one is missing: rebuilding a committed world is exact. A replay needs the same options as the original run (same text, `--lang`, `--company`, `--slug`, `--model`).

Model calls go through the `claude` command line (print mode, no tools, no MCP servers, no saved session) and need a logged-in CLI.

## Other commands

```bash
npm run world:gen  -- worlds/<slug>        # rebuild the materials from an existing scenario.json (edit it by hand first, if you like)
npm run world:lint -- worlds/<slug>/scenario.json
npm run world:check -- worlds/<slug>       # verify the files on disk against the contracts and the scenario
npm run world:play -- worlds/<slug> t0     # release a tier into data/inbox, data/news, data/docs
npx vitest run tools                       # tests
```

`world:play` uses `BRAIN_INBOX`, `BRAIN_NEWS` and `BRAIN_DOCS` when set. Each file is written as `_name.md` and then renamed, so a watcher never sees a half-written file. Tier ids are whatever the scenario defines (`t0`, `start`, `alert`…).

## Layout

```
spec.ts       the scenario schema (zod)           planner.ts   free text → spec, with repair
lint.ts       checks on a spec, no model          compile.ts   spec → the world the engine generates
formula.ts    safe formula parser/evaluator       generate.ts  write, check, repair, in parallel
check.ts      body, contract and world checks     ai-writer.ts the piece prompt and writer
llm.ts        claude CLI, recordings, replay      render.ts    headers, quotes, file names
answers.ts    answer key                          summary.ts   SUMMARY.md
files.ts      write, check and play a world       cli.ts       commands
fixtures/     two hand-written scenarios (Italian and English) used by the tests
```
