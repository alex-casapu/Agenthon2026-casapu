/**
 * Entities: the real-world things claims are about.
 *
 * Everything (staff, suppliers, customers, products, sites) changes all the time, so it is
 * discovered from the data: the extractor declares an entity, the system checks the name
 * is in a verbatim quote or in the source's header information, and the entity is admitted
 * automatically. Admitting a name is not an action, so no one approves it. Ids are derived
 * from names by code, never chosen by the model.
 */

export type EntityKind = "organization" | "site" | "item" | "department" | "person";
export const ENTITY_KINDS: EntityKind[] = ["organization", "site", "item", "department", "person"];

export interface EntityOrigin {
  source_id: string;
  /** What grounds the name: a verbatim quote, or a header field of the source (author, recipients, parties, publisher). */
  via: string;
  /** Present when `via` is a quote. */
  quote_id?: string;
  quote?: string;
  /** Visibility labels of the source it was first seen in. */
  labels: string[];
  by: string;
}

export interface Entity {
  id: string;
  version: number;
  name: string;
  kind: EntityKind;
  aliases: string[];
  /** Absent for the fixed seed; present for discovered entities. */
  origin?: EntityOrigin;
}

/**
 * Nothing is shipped. Employees, departments, suppliers, customers, products and sites are all
 * discovered from the sources themselves. (Kept as an empty seed so a deployment can still add
 * entities that must exist from day one.)
 */
export const ENTITIES: Entity[] = [];

// ---------------------------------------------------------------- names

const LEGAL = new Set(["srl", "srls", "spa", "sas", "snc", "sapa", "ltd", "limited", "llc", "inc", "corp", "gmbh", "ag", "sa", "bv", "plc", "co"]);

/** Lower-case, accent-free, punctuation-free, legal-form-free: the form names are compared in. */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\b(?:\p{L}\.){2,}/gu, (m) => m.replace(/\./g, "")) // S.r.l. -> Srl
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !LEGAL.has(w))
    .join(" ");
}

/** The id a name gets. Deterministic, ascii, empty if the name has no usable characters. */
export function entityIdFor(name: string): string {
  const slug = normName(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return slug ? `ent:${slug}` : "";
}

export interface EntityRegistry {
  get(id: string): Entity | undefined;
  suggest(unknown: string): Entity[];
}

/** The entity a reference means: an exact id, or a name/alias, or an unknown ent: id spelled like a known name. */
export function findEntity(list: Entity[], ref: string): Entity | undefined {
  const byId = list.find((x) => x.id === ref);
  if (byId) return byId;
  const n = normName(ref.replace(/^ent:/, "").replace(/_/g, " "));
  if (!n) return undefined;
  return list.find((x) => normName(x.name) === n || x.aliases.some((a) => normName(a) === n));
}

export const getEntity = (id: string, list: Entity[] = ENTITIES): Entity | undefined => list.find((x) => x.id === id);

const words = (s: string) => s.toLowerCase().replace(/^ent:/, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** Registry entries closest to an unknown id, by shared words with the id, name and aliases. */
export function suggestEntities(unknown: string, list: Entity[] = ENTITIES, n = 3): Entity[] {
  const w = new Set(words(unknown));
  return list
    .map((x) => {
      const theirs = new Set(words([x.id, x.name, ...x.aliases].join(" ")));
      return { x, score: [...w].filter((t) => theirs.has(t)).length };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((s) => s.x);
}

export const registryOf = (list: Entity[]): EntityRegistry => ({
  get: (id) => getEntity(id, list),
  suggest: (u) => suggestEntities(u, list),
});

/** The registry as it appears in the extractor prompt. */
export function describeEntities(list: Entity[] = ENTITIES): string {
  return list.map((x) => `- ${x.id}: ${x.name} (${x.kind}${x.aliases.length ? `; also: ${x.aliases.join(", ")}` : ""})`).join("\n");
}
