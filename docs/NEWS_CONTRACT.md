# News article source contract (v1)

How a news article enters Company Brain: a Markdown file with a YAML header, dropped into a folder. It follows the same rules as the [email contract](EMAIL_CONTRACT.md); this page lists what is specific to articles.

## Shared with the email contract

Dropping a file = it arrives **now** (`ingested_at`), whatever its `date`. Ingestion only appends. An ingested file is immutable: an edit is a `conflict`, a correction is a new article. Strict header, unknown keys rejected. Same results (`ingested` / `duplicate` / `conflict` / `invalid`) and the same hash-chained `ingest_events` ledger. Body is the citable text (headers and `title` are not). Quote any YAML value containing `: `.

## Where

`BRAIN_NEWS` (default `data/news/`). Scanned recursively; ignored: non-`.md` files, dotfiles, names starting with `_`.

## Format

````markdown
---
article_id: news-2026-11-21-semola-502
domain: mercatocereali.example
date: 2026-11-21T08:00:00+01:00
title: "Semola, prezzo spot a 502 €/t: +18% in tre settimane"
url: https://www.mercatocereali.example/semola-502
author: Redazione
language: it
reliability: high
---
Il prezzo spot della semola di grano duro è salito a 502 €/t,
+18% in tre settimane.
````

### Header

| Key | Required | Type | Notes |
|---|---|---|---|
| `article_id` | yes | string | Identity and idempotency key. Unique across all news, stable, no whitespace. |
| `domain` | yes | bare hostname | The publishing site, e.g. `mercatocereali.example`. Lower-cased, a leading `www.` is stripped. Not a URL. **This is the unit of source trust**: the policy layer will later trust or distrust a whole domain, including retroactively. |
| `date` | yes | `YYYY-MM-DD` or ISO 8601 **with timezone** | Publication date. A date alone is stored as the start of that day (UTC) and flagged `date_precision: day`. A datetime without offset is rejected. May be in the past. |
| `title` | yes | string | Metadata only. |
| `url` | no | `http(s)` URL | Its host must equal `domain` (after stripping `www.`), otherwise the file is invalid. |
| `author` | no | string or list | Lists are joined with `, `. |
| `language` | no | BCP 47 tag | e.g. `it`, `en-GB`. |
| `retrieved_at` | no | ISO 8601 with timezone | When the article was fetched. Metadata; it is not the arrival time. |
| `corrects` | no | `article_id` | Marks this article as a correction or retraction of another. Stored as metadata now; the derivation layer will later use it to mark conclusions that rested on the older article as needing review. The target need not exist yet. |
| `labels` | no | list of `[a-z0-9_-]+` | Default `[public]`. |
| `reliability` | no | `high` \| `low` | Default unset. |

Any other key is an error.

### Body

Everything after the closing `---`, verbatim, any language. After NFC and LF normalisation it is the canonical text that quotes cite. Put facts that matter in the body, not only in the title.

## Ingestion semantics

Exactly as for email (see its table), keyed by `article_id`. `content_hash = sha256(canonical JSON of the normalised header + "\n" + canonical body)`. Each source kind has its own folder and its own identity space: an email and an article may share an id string without conflict.

## Mapping to `sources`

| Contract | Column |
|---|---|
| (constant) | `kind = 'news'` |
| `article_id` | `external_id` |
| `author` | `author` |
| `date` (UTC ISO) | `occurred_at` |
| now | `ingested_at` |
| body | `raw`, `canonical_text` |
| `labels` | `acl_labels` |
| `title`, `domain`, `url`, `language`, `retrieved_at`, `corrects`, `date_precision`, `reliability`, `content_hash`, `file` | `meta` |

`thread_id` is unset and `recipients` is empty.
