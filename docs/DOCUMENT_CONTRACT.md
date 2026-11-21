# Document source contract (v1)

How an internal document enters Company Brain: contracts, invoices, reports, plans, policies, minutes, system exports. A Markdown file with a YAML header, dropped into a folder. It follows the same rules as the [email contract](EMAIL_CONTRACT.md); this page lists what is specific to documents.

## Shared with the email and news contracts

Dropping a file = it arrives **now** (`ingested_at`), whatever its `date`. Ingestion only appends. An ingested file is immutable: an edit is a `conflict`, a new version is a new document. Strict header, unknown keys rejected. Same results (`ingested` / `duplicate` / `conflict` / `invalid`) and the same hash-chained `ingest_events` ledger. The body is the citable text; headers and `title` are not. Quote any YAML value containing `: `.

## Where

`BRAIN_DOCS` (default `data/docs/`). Scanned recursively; ignored: non-`.md` files, dotfiles, names starting with `_`.

## From PDF, Word or spreadsheet to Markdown

The contract takes text. Whatever produced the document (an export, a PDF, a spreadsheet) is converted to Markdown **before** it is dropped here; the Markdown *is* the document as far as Company Brain is concerned. Keep the original wording: quotes are checked character by character against this text, so do not paraphrase. Render tables as Markdown tables, one row per line, so a row can be cited on its own. Record where it came from in `origin`.

## Format

````markdown
---
doc_id: CQ-2026-031
doc_type: contract
title: Contratto quadro di fornitura semola
date: 2026-01-15
reference: CQ-2026-031
parties:
  - Pastaco S.p.A.
  - Molino Tavoliere S.r.l.
version: "1"
origin: DMS contratti
language: it
labels: [finance]
reliability: high
---
## Art. 3 – Prezzo
Il prezzo è fissato in 412 €/t, invariabile fino alla scadenza.

## Art. 4 – Quantità
Il fornitore copre il 60% del fabbisogno annuo dello stabilimento di Parma.

## Art. 12 – Durata
Il contratto scade il 31/03/2027.
````

### Header

| Key | Required | Type | Notes |
|---|---|---|---|
| `doc_id` | yes | string | Identity and idempotency key. Unique across all documents, stable, no whitespace. A contract or invoice number is a natural choice. |
| `doc_type` | yes | `[a-z0-9_-]+` | Free, but prefer: `contract`, `invoice`, `offer`, `report`, `plan`, `policy`, `minutes`, `export`, `other`. |
| `title` | yes | string | Metadata only. |
| `date` | yes | `YYYY-MM-DD` or ISO 8601 **with timezone** | The document's own date (issue / signature / report date). A date alone is stored as the start of that day (UTC) and flagged `date_precision: day`. A datetime without offset is rejected. May be in the past. |
| `author` | no | string or list | Who wrote or issued it. |
| `reference` | no | string | A business reference such as a contract or invoice number. Quote it if it looks like a number. |
| `parties` | no | list of strings | Organisations the document binds or concerns. |
| `version` | no | string | Quote it: `"1.10"` stays `"1.10"`, an unquoted `1.10` would become `1.1`. |
| `supersedes` | no | `doc_id` | This document replaces another (a new version, an amendment that replaces it). Stored as metadata now; the derivation layer will later use it to mark conclusions that rested on the older document as needing review. The target need not exist yet. |
| `origin` | no | string | Where it came from: `DMS contratti`, `WMS Parma export`, `ERP`. |
| `language` | no | BCP 47 tag | e.g. `it`, `en-GB`. |
| `labels` | no | list of `[a-z0-9_-]+` | Default `[public]`. |
| `reliability` | no | `high` \| `low` | Default unset. |

Any other key is an error.

Facts such as prices, quantities, validity periods and due dates belong **in the body**, where they can be cited; the header is descriptive metadata only. This includes the date a figure refers to: an export whose "as of" date appears only in the title cannot have that date verified, so state it in the text ("Situazione delle scorte al 20/11/2026").

### Body

Everything after the closing `---`, verbatim, any language. After NFC and LF normalisation it is the canonical text that quotes cite.

## Versions

A document never changes once ingested. A revised contract, a corrected report or an amended policy is a **new file with a new `doc_id`** that names what it replaces in `supersedes` and carries its own `version`. The old document stays in the memory, linked, with its history.

## Ingestion semantics

Exactly as for email, keyed by `doc_id`. `content_hash = sha256(canonical JSON of the normalised header + "\n" + canonical body)`. Each source kind has its own folder and its own identity space.

## Mapping to `sources`

| Contract | Column |
|---|---|
| (constant) | `kind = 'document'` |
| `doc_id` | `external_id` |
| `author` | `author` |
| `date` (UTC ISO) | `occurred_at` |
| now | `ingested_at` |
| body | `raw`, `canonical_text` |
| `labels` | `acl_labels` |
| `title`, `doc_type`, `reference`, `parties`, `version`, `supersedes`, `origin`, `language`, `reliability`, `date_precision`, `content_hash`, `file` | `meta` |

`thread_id` is unset and `recipients` is empty.

## Future extensions (not in v1)

An effective period (`valid_from` / `valid_to`) in the header, attachments, direct PDF/Office ingestion, section-level anchors.
