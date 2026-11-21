import { sha256, canonicalJson } from "../hash";
import { ENTITY_KINDS, entityIdFor, findEntity, normName, registryOf, type Entity, type EntityKind, type EntityRegistry } from "../entities";
import { locateQuote } from "../gate/locate";
import { recordRow, type DB } from "./log";

/** The registry as stored: the fixed cast plus everything discovered, latest version of each. */
export function listEntities(db: DB): Entity[] {
  return (
    db
      .prepare("SELECT definition FROM entities e WHERE version = (SELECT MAX(version) FROM entities WHERE entity_id = e.entity_id) ORDER BY rowid")
      .all() as { definition: string }[]
  ).map((r) => JSON.parse(r.definition) as Entity);
}

export const dbRegistry = (db: DB): EntityRegistry => registryOf(listEntities(db));

function insertEntity(db: DB, e: Entity): void {
  db.prepare("INSERT INTO entities (entity_id, version, definition, definition_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    e.id,
    e.version,
    canonicalJson(e),
    sha256(canonicalJson(e)),
    new Date().toISOString(),
  );
  recordRow(db, "entities", `${e.id}:${e.version}`);
}

/** Add entities with no provenance (demo and test data). Existing ids are left alone. */
export function seedEntities(db: DB, list: Entity[]): void {
  db.transaction(() => {
    const have = new Set(listEntities(db).map((x) => x.id));
    for (const e of list) if (!have.has(e.id)) insertEntity(db, e);
  })();
}

export interface EntityDeclaration {
  name: unknown;
  kind: unknown;
  aliases?: unknown;
  /** A verbatim excerpt of the source that contains the name. Optional: header information can ground a name instead. */
  quote?: unknown;
}

export type AdmitResult = { ok: true; entity: Entity; created: boolean } | { ok: false; error: string };

const MAX_NAME = 80;

const words = (n: string) => ` ${n} `;
/** Whole-word containment on normalised text. */
const hasWords = (haystack: string, needle: string) => !!needle && words(haystack).includes(words(needle));
/** Header text like "molinorossi" or "mulino-santa-chiara": the name with spaces removed must be inside it. */
const hasCollapsed = (haystack: string, needle: string) => needle.replace(/ /g, "").length >= 5 && haystack.replace(/ /g, "").includes(needle.replace(/ /g, ""));

interface Grounding {
  via: string;
  /** Normalised text the name is looked for in. */
  text: string;
  /** Whether a run-together form ("molinorossi") counts. Only for header fields, never body text. */
  collapsed: boolean;
}

/** The header information a source carries, as groundable text: who wrote it, who got it, who it names, who published it. */
function headerGroundings(src: { author: string | null; recipients: string; meta: string }): Grounding[] {
  const m = JSON.parse(src.meta) as Record<string, unknown>;
  const out: Grounding[] = [];
  const add = (via: string, v: unknown) => {
    if (typeof v !== "string" || !v.trim()) return;
    // an address contributes its local part and its domain without the top-level label
    const [local, domain] = v.includes("@") ? v.split("@") : [v, ""];
    const text = [local, domain.replace(/\.[a-z]{2,}$/i, "")].filter(Boolean).map((t) => normName(t.replace(/[._-]+/g, " "))).join(" | ");
    if (text) out.push({ via, text, collapsed: true });
  };
  add("author", src.author);
  for (const r of JSON.parse(src.recipients) as string[]) add("recipient", r);
  add("sender name", m.from_name);
  for (const p of [...((m.to as { name?: string }[]) ?? []), ...((m.cc as { name?: string }[]) ?? [])]) add("recipient name", p?.name);
  for (const p of (m.parties as string[]) ?? []) add("party", p);
  add("publisher", m.domain);
  add("source", m.origin);
  return out;
}

/**
 * Admit an entity discovered in a source, automatically: recognising a name is not an action, so no one
 * approves it. It must be grounded in the source, either by a verbatim quote that contains the name or by
 * the source's header information (author, recipients, parties, publisher). If a known entity has that
 * name (or an alias) it is reused instead. The id comes from the name, never from the caller.
 */
export function admitEntity(db: DB, decl: EntityDeclaration, sourceId: string, by = "agent:extractor"): AdmitResult {
  const name = typeof decl.name === "string" ? decl.name.trim() : "";
  if (name.length < 2 || name.length > MAX_NAME || /[\n\r]/.test(name)) return { ok: false, error: `entity name ${JSON.stringify(decl.name)} is not usable` };
  if (!ENTITY_KINDS.includes(decl.kind as EntityKind)) return { ok: false, error: `entity "${name}": kind must be one of ${ENTITY_KINDS.join(", ")}` };
  if (/@|https?:\/\/|^www\./i.test(name)) {
    return {
      ok: false,
      error: `entity name "${name}" is an address, not a name: declare the company or person it stands for (for example "Molino Rossi" for molinorossi.example, "Anna Rossi" for anna.rossi@molinorossi.example)`,
    };
  }
  const nName = normName(name);
  if (!nName) return { ok: false, error: `entity name ${JSON.stringify(name)} is not usable` };

  const src = db.prepare("SELECT canonical_text, acl_labels, author, recipients, meta FROM sources WHERE source_id = ?").get(sourceId) as
    | { canonical_text: string; acl_labels: string; author: string | null; recipients: string; meta: string }
    | undefined;
  if (!src) return { ok: false, error: `unknown source ${sourceId}` };

  // possible groundings: the quote (if it is a verbatim, unambiguous excerpt), then the header fields
  const quote = typeof decl.quote === "string" ? decl.quote : "";
  const loc = quote.trim() ? locateQuote(src.canonical_text, quote) : undefined;
  const grounds: Grounding[] = [];
  if (loc?.ok) grounds.push({ via: "quote", text: normName(loc.text), collapsed: false });
  grounds.push(...headerGroundings(src));

  const shows = (n: string): Grounding | undefined => grounds.find((g) => (g.via === "quote" ? hasWords(g.text, n) : g.text.split(" | ").some((t) => hasWords(t, n)) || (g.collapsed && g.text.split(" | ").some((t) => hasCollapsed(t, n)))));
  const ground = shows(nName);
  if (!ground) {
    const why = loc && !loc.ok ? ` (${loc.message})` : "";
    return { ok: false, error: `entity "${name}": the name does not appear in the quote or in the source's header information (author, recipients, parties, publisher)${why}` };
  }

  // aliases are only kept when the source shows them, once each however they are spelled
  const seen = new Set<string>([nName]);
  const aliases = (Array.isArray(decl.aliases) ? decl.aliases : [])
    .filter((a): a is string => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => {
      const n = normName(a);
      if (a.length < 2 || a.length > MAX_NAME || !n || seen.has(n) || !shows(n)) return false;
      seen.add(n);
      return true;
    });

  const known = listEntities(db);
  const existing = findEntity(known, name) ?? aliases.map((a) => findEntity(known, a)).find(Boolean);
  if (existing) return { ok: true, entity: existing, created: false };

  const id = entityIdFor(name);
  if (!id) return { ok: false, error: `entity "${name}": no usable id can be made from it` };

  const viaQuote = ground.via === "quote" && loc?.ok ? loc : undefined;
  const quote_id = viaQuote ? sha256(`${sourceId}|${viaQuote.start}|${viaQuote.end}`) : undefined;
  const entity: Entity = {
    id,
    version: 1,
    name,
    kind: decl.kind as EntityKind,
    aliases,
    origin: { source_id: sourceId, via: ground.via, ...(viaQuote ? { quote_id, quote: viaQuote.text } : {}), labels: JSON.parse(src.acl_labels) as string[], by },
  };
  db.transaction(() => {
    if (viaQuote && !db.prepare("SELECT 1 FROM quotes WHERE quote_id = ?").get(quote_id)) {
      db.prepare('INSERT INTO quotes (quote_id, source_id, start, "end", text) VALUES (?, ?, ?, ?, ?)').run(quote_id, sourceId, viaQuote.start, viaQuote.end, viaQuote.text);
      recordRow(db, "quotes", quote_id!);
    }
    insertEntity(db, entity);
  })();
  return { ok: true, entity, created: true };
}
