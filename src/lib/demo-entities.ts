import type { Entity, EntityKind } from "./entities";

const e = (id: string, name: string, kind: EntityKind, aliases: string[] = []): Entity => ({ id: `ent:${id}`, version: 1, name, kind, aliases });

/**
 * Entities for the sample data and the tests. The app ships none of these: in real use suppliers,
 * customers, products and sites are discovered from the sources themselves.
 */
export const DEMO_ENTITIES: Entity[] = [
  e("marketing", "Marketing", "department", []),
  e("marta_ricci", "Marta Ricci", "person", ["Marta"]),
  e("luca_bianchi", "Luca Bianchi", "person", []),
  e("sara_conti", "Sara Conti", "person", ["Sara"]),
  e("pastaco", "Pastaco S.p.A.", "organization", ["Pastaco"]),
  e("molino_rossi", "Molino Rossi S.r.l.", "organization", ["Molino Rossi"]),
  e("molino_bianchi", "Molino Bianchi S.r.l.", "organization", ["Molino Bianchi"]),
  e("molino_tavoliere", "Molino Tavoliere S.r.l.", "organization", ["Molino Tavoliere", "Tavoliere"]),
  e("mulino_alta_murgia", "Mulino Alta Murgia", "organization", ["Alta Murgia"]),
  e("parma_plant", "Parma plant", "site", ["Parma", "stabilimento di Parma"]),
  e("durum_semolina", "Durum semolina", "item", ["semola di grano duro", "semola"]),
  e("farina_00", "Farina 00", "item", ["00 flour"]),
  e("fusilli", "Fusilli", "item", []),
  e("marco_verdi", "Marco Verdi", "person", ["Marco"]),
  e("anna_rossi", "Anna Rossi", "person", ["Anna"]),
  e("luca_greco", "Luca Greco", "person", []),
  e("paolo_neri", "Paolo Neri", "person", ["Paolo"]),
];
