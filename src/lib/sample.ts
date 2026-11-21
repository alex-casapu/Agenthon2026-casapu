import { DEMO_ENTITIES } from "./demo-entities";
import { insertSource, seedEntities, submitClaim, type DB } from "./store";

/** Throwaway demo data to exercise the core. Idempotent. */
export function loadSample(db: DB): { sources: number; claims: number } {
  seedEntities(db, DEMO_ENTITIES);
  const en = insertSource(db, {
    kind: "email",
    external_id: "sample-en-1",
    thread_id: "thread-semolina",
    author: "anna.rossi@molinorossi.example",
    recipients: ["buyer@pastaco.example"],
    occurred_at: "2026-10-12T09:15:00Z",
    raw: "Hi,\n\nPer our call this morning: the October lot of durum semolina is €412 per tonne, valid until 31 December, minimum 800 tonnes.\n\nPlease confirm by Friday.\n\nBest,\nAnna",
  }).source_id;

  const it = insertSource(db, {
    kind: "email",
    external_id: "sample-it-1",
    thread_id: "thread-semolina-it",
    author: "luca@molinobianchi.example",
    recipients: ["buyer@pastaco.example"],
    occurred_at: "2026-11-03T08:40:00Z",
    raw: "Buongiorno,\n\nconfermiamo il prezzo della semola di grano duro: € 1.250,00 a tonnellata, valido fino al 15 gennaio 2027, ordine minimo 500 tonnellate.\n\nCordiali saluti,\nLuca",
  }).source_id;

  const chat = insertSource(db, {
    kind: "chat",
    external_id: "sample-chat-1",
    author: "giulia@pastaco.example",
    occurred_at: "2026-11-05T14:02:00Z",
    raw: "Marketing here: we commit to the spring promo for the retailer, 40 pallets of fusilli ready by 2027-02-10. I'm the owner on our side.",
  }).source_id;

  const results = [
    submitClaim(db, {
      predicate_id: "supplier_price",
      evidence: [{ source_id: en, quote: "the October lot of durum semolina is €412 per tonne, valid until 31 December, minimum 800 tonnes" }],
      fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", min_volume: 800, valid_to: "2026-12-31" },
    }),
    submitClaim(db, {
      predicate_id: "supplier_price",
      evidence: [{ source_id: it, quote: "confermiamo il prezzo della semola di grano duro: € 1.250,00 a tonnellata, valido fino al 15 gennaio 2027, ordine minimo 500 tonnellate" }],
      fields: { supplier: "ent:molino_bianchi", item: "ent:durum_semolina", amount: 1250, currency: "EUR", per: "t", min_volume: 500, valid_to: "2027-01-15" },
    }),
    submitClaim(db, {
      predicate_id: "commitment",
      evidence: [{ source_id: chat, quote: "we commit to the spring promo for the retailer, 40 pallets of fusilli ready by 2027-02-10" }],
      fields: { owner: "ent:marketing", action: "deliver 40 pallets of fusilli for the spring promo", due: "2027-02-10" },
    }),
  ];
  return { sources: 3, claims: results.filter((r) => r.ok).length };
}
