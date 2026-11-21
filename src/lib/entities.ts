/**
 * Entity registry: the real-world things claims are about. Seeded here, recorded
 * in the append-only `entities` table at startup. Extraction may only use these
 * ids, so the same supplier or site never ends up under two names.
 */

export type EntityKind = "organization" | "site" | "item" | "department" | "person";

export interface Entity {
  id: string;
  version: number;
  name: string;
  kind: EntityKind;
  aliases: string[];
}

const e = (id: string, name: string, kind: EntityKind, aliases: string[] = []): Entity => ({ id: `ent:${id}`, version: 1, name, kind, aliases });

export const ENTITIES: Entity[] = [
  e("pastaco", "Pastaco S.p.A.", "organization", ["Pastaco", "Pastaco SpA", "the company"]),
  e("molino_rossi", "Molino Rossi S.r.l.", "organization", ["Molino Rossi", "molinorossi.example"]),
  e("molino_bianchi", "Molino Bianchi S.r.l.", "organization", ["Molino Bianchi", "molinobianchi.example"]),
  e("molino_tavoliere", "Molino Tavoliere S.r.l.", "organization", ["Molino Tavoliere", "Tavoliere"]),
  e("mulino_alta_murgia", "Mulino Alta Murgia", "organization", ["Alta Murgia", "Molino Alta Murgia"]),
  e("parma_plant", "Parma plant", "site", ["Parma", "stabilimento di Parma", "Pastaco Parma", "magazzino Parma"]),
  e("durum_semolina", "Durum semolina", "item", ["semola di grano duro", "semola", "durum wheat semolina"]),
  e("farina_00", "Farina 00", "item", ["farina tipo 00", "00 flour"]),
  e("fusilli", "Fusilli", "item", ["pasta fusilli"]),
  e("purchasing", "Purchasing", "department", ["Acquisti", "ufficio acquisti"]),
  e("finance", "Finance", "department", ["Finanza", "amministrazione"]),
  e("production", "Production", "department", ["Produzione"]),
  e("marketing", "Marketing", "department", []),
  e("marta_ricci", "Marta Ricci", "person", ["Marta"]),
  e("luca_bianchi", "Luca Bianchi", "person", []),
  e("sara_conti", "Sara Conti", "person", ["Sara"]),
  e("marco_verdi", "Marco Verdi", "person", ["Marco"]),
  e("anna_rossi", "Anna Rossi", "person", ["Anna"]),
  e("luca_greco", "Luca Greco", "person", []),
  e("paolo_neri", "Paolo Neri", "person", ["Paolo"]),
];

export const getEntity = (id: string): Entity | undefined => ENTITIES.find((x) => x.id === id);

const words = (s: string) => s.toLowerCase().replace(/^ent:/, "").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** Registry entries closest to an unknown id, by shared words with the id, name and aliases. */
export function suggestEntities(unknown: string, n = 3): Entity[] {
  const w = new Set(words(unknown));
  return ENTITIES.map((x) => ({ x, score: new Set(words([x.id, x.name, ...x.aliases].join(" "))).size && [...w].filter((t) => words([x.id, x.name, ...x.aliases].join(" ")).includes(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((s) => s.x);
}

/** The registry as it appears in the extractor prompt. */
export function describeEntities(list: Entity[] = ENTITIES): string {
  return list.map((x) => `- ${x.id}: ${x.name} (${x.kind}${x.aliases.length ? `; also: ${x.aliases.join(", ")}` : ""})`).join("\n");
}
