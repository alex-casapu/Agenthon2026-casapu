# Demo runbook: the 3-minute talk on the real app

The talk (`/slides/intro`) is glue between pieces; the middle is the real app inside the deck (`/slides/demo`), five actions on `/claims?demo=1` and `/chat`.

## Before going on stage (once)

1. **The server's `claude` CLI must be logged in.** Extraction and the chat both call it. If it says `Not logged in` in the Debug → Inbox run ledger, log in from the same shell that runs `npm run dev`, then restart the server.
2. Stop the server, `npm run db:reset`, start it again.
3. `npm run stage:baseline` drops the starting world into the folders (contract, production plan, stock, offers, last month's report). The watcher ingests and extracts.
4. Open `/claims` as Marta and **approve** the baseline claims (the contract, the stock, the needs). The alert pieces are *not* in the baseline: they come on stage.
5. Rehearse the five actions once with `BRAIN_LLM_MODE=auto` so every model answer is recorded in `data/llm-cache`. On stage run with `BRAIN_LLM_MODE=replay`: no model, no waiting, same answers.

## The five actions (`/slides/demo`, arrow keys step through them)

| # | Where | Do | Shows |
|---|---|---|---|
| 1 | `/claims?demo=1`, as Marta | Press **▶ Alert** | A source arrives by itself; claims appear, proposed |
| 2 | same page | **Reject** the claim from the fair | People curate the memory |
| 3 | `/chat`, as Sara | "What is our framework contract price?" | "I don't know": never admits the fact exists |
| 4 | `/chat`, as Luca | the same question | The answer, with its citations |
| 5 | `/chat`, as Marta | "What did we hear about the Canadian harvest?" | "I don't know": the rumour was rejected |

The ▶ buttons only drop example files into the source folders (`src/lib/stage.ts`): the same thing as copying a file by hand. `?demo=1` shows them; without it the page is unchanged.
