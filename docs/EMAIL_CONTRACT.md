# Email source contract (v1)

How an email enters Company Brain: as a Markdown file with a YAML header, dropped into a folder.

## Principles

1. **Dropping a file = the email arrives now.** Knowledge time is the moment of ingestion (`ingested_at`, position in the log). The header `date` says when the email was *sent* and may be in the past. A backdated email adds evidence *now*; it never rewrites anything that came before.
2. **Ingestion only appends.** An ingested file is immutable. Editing it later is reported as a conflict and ignored. A correction is a new email.
3. **Strict on purpose.** Unknown header keys, naive timestamps and missing fields are rejected with a reason, so generated data can't silently drift from the contract.

## Where

`BRAIN_INBOX` (default `data/inbox/`). Scanned recursively; subfolders are free for your own organisation.

| Picked up | Ignored |
|---|---|
| `*.md` | non-`.md` files, dotfiles, files or folders starting with `_` |

File names are free-form. Recommended: `YYYYMMDD-HHMM-short-slug.md`. To write a file atomically, write `_name.md` and rename it when complete. The watcher also waits for the size to settle, and a half-written file is simply retried when it changes.

## Format

````markdown
---
message_id: msg-2026-10-12-rossi-0915
date: 2026-10-12T09:15:00+02:00
from: Anna Rossi <anna.rossi@molinorossi.example>
to:
  - Marco Verdi <marco.verdi@pastaco.example>
cc: [acquisti@pastaco.example]
subject: Offerta semola ottobre
thread_id: thread-semola-ottobre
in_reply_to: msg-2026-10-10-verdi-1120
labels: [finance]
reliability: high
---
Buongiorno Marco,

come da telefonata, la semola di grano duro del lotto di ottobre è a 412 €/t,
valida fino al 31 dicembre, ordine minimo 800 tonnellate.

> Il 10/10 Marco ha scritto:
> Potete confermarci il prezzo per ottobre?

Cordiali saluti,
Anna
````

### Header

| Key | Required | Type | Notes |
|---|---|---|---|
| `message_id` | yes | string | Identity and idempotency key. Unique across the whole corpus, stable, no leading/trailing spaces. |
| `date` | yes | ISO 8601 **with timezone** | `…+02:00` or `…Z`. A timestamp without offset is rejected. May be in the past. |
| `from` | yes | `Name <addr>` or `addr` | Exactly one sender. |
| `to` | yes | list or comma-separated string | At least one recipient. |
| `cc` | no | list or comma-separated string | |
| `subject` | yes | string | Metadata only, see *Body*. |
| `thread_id` | no | string | If absent: the parent's thread if `in_reply_to` is known, else `in_reply_to`, else `message_id`. |
| `in_reply_to` | no | `message_id` | |
| `labels` | no | list of `[a-z0-9_-]+` | Visibility labels, consumed by the access policy. Default `[public]`. |
| `reliability` | no | `high` \| `low` | Source reliability, consumed by the policy. Default: unset. |

Addresses are lower-cased. Any other key is an error.

**YAML pitfall:** a value containing `: ` or starting with a special character must be quoted, e.g. `subject: "Re: Offerta semola"`. An unquoted one makes the header invalid YAML and the file is rejected with `invalid`. Quoting every string value is always safe.

### Body

Everything after the closing `---` line, verbatim: any language, plain text or Markdown, UTF-8.

- The body, after NFC and LF normalisation, **is** the canonical text. Quotes cite offsets into it. Headers and `subject` are metadata and are **not citable**, so a fact that matters must appear in the body.
- Quoted earlier messages should be prefixed with `>`. They are stored like any other text; they will later be recognised as quotations so they don't count as independent corroboration.
- Attachments are out of scope for v1. Put the relevant text in the body.

## Ingestion semantics

Per file, in order of discovery:

| Situation | Result | Effect |
|---|---|---|
| New `message_id` | `ingested` | A source row is appended with `ingested_at = now`. |
| Same `message_id`, identical content | `duplicate` | None. |
| Same `message_id`, different content | `conflict` | **Nothing is ingested.** Reported. Send a correction as a new email instead. Labels are never changed by editing a file. |
| Header or parse problem | `invalid` | Nothing ingested, reasons recorded. Retried automatically when the file changes. |

- Content identity is `content_hash = sha256(canonical JSON of the normalised header + "\n" + canonical body)`.
- Every attempt is appended to the hash-chained `ingest_events` ledger: path, file hash, result, source id, error, time.
- Deleting a file has no effect. Ingestion is not reversible; distrust is a policy decision, not a deletion.
- Ordering of knowledge is ingestion order, never `date`.

## Mapping to `sources`

| Contract | Column |
|---|---|
| (constant) | `kind = 'email'` |
| `message_id` | `external_id` |
| resolved thread | `thread_id` |
| `from` address | `author` |
| `to` + `cc` addresses | `recipients` |
| `date` (UTC ISO) | `occurred_at` |
| now | `ingested_at` |
| body | `raw`, `canonical_text` |
| `labels` | `acl_labels` |
| `subject`, `from_name`, `to`, `cc`, `in_reply_to`, `reliability`, `content_hash`, `file` | `meta` |

## Future extensions (not in v1)

Attachments, an explicit `corrects:` link between emails, resolving `origin_source_id` for quoted replies, other source kinds (chat, task, doc) with the same header idea.
