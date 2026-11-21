import { describe, expect, it } from "vitest";
import { DEMO_ENTITIES } from "../demo-entities";
import { ENTITIES } from "../entities";
import { admitEntity, insertSource, listEntities, openDb, seedEntities, verify, type DB } from ".";

const TEXT = "Offerta di Molino Nuovo S.r.l. per la semola Fior di Grano: 450 €/t, valida fino al 31 dicembre. Contatto: Giorgio Verdi.";
let db: DB;
let sid: string;
const setup = (labels?: string[]) => {
  db = openDb(":memory:");
  sid = insertSource(db, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: TEXT, acl_labels: labels }).source_id;
};
const count = () => (db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n;

describe("admitEntity: automatic, grounded discovery", () => {
  it("admits an entity whose name is in a verbatim quote, with an id derived from the name", () => {
    setup();
    const r = admitEntity(db, { name: "Molino Nuovo S.r.l.", kind: "organization", aliases: ["Molino Nuovo"], quote: "Offerta di Molino Nuovo S.r.l." }, sid);
    expect(r).toMatchObject({ ok: true, created: true });
    if (!r.ok) return;
    // "Molino Nuovo" is the same name once the legal form is ignored, so it is not stored as a separate alias
    expect(r.entity).toMatchObject({ id: "ent:molino_nuovo", version: 1, name: "Molino Nuovo S.r.l.", kind: "organization", aliases: [] });
    expect(r.entity.origin).toMatchObject({ source_id: sid, via: "quote", quote: "Offerta di Molino Nuovo S.r.l.", labels: ["public"], by: "agent:extractor" });
    expect(listEntities(db).map((e) => e.id)).toContain("ent:molino_nuovo");
    expect(count()).toBe(ENTITIES.length + 1);
  });

  it("anchors the discovery in a real quote row, logged and verifiable", () => {
    setup();
    const r = admitEntity(db, { name: "Fior di Grano", kind: "item", quote: "la semola Fior di Grano: 450 €/t" }, sid);
    if (!r.ok) throw new Error(r.error);
    const q = db.prepare("SELECT text FROM quotes WHERE quote_id = ?").get(r.entity.origin!.quote_id) as { text: string };
    expect(q.text).toBe("la semola Fior di Grano: 450 €/t");
    expect(db.prepare("SELECT COUNT(*) AS n FROM log WHERE tbl = 'entities' AND row_id = 'ent:fior_di_grano:1'").get()).toEqual({ n: 1 });
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("ignores any id the caller supplies: ids come from names", () => {
    setup();
    seedEntities(db, DEMO_ENTITIES);
    const r = admitEntity(db, { name: "Giorgio Verdi", kind: "person", quote: "Contatto: Giorgio Verdi", id: "ent:marta_ricci" } as never, sid);
    expect(r).toMatchObject({ ok: true, entity: { id: "ent:giorgio_verdi" } });
    expect(listEntities(db).find((e) => e.id === "ent:marta_ricci")?.name).toBe("Marta Ricci");
  });

  it("remembers the visibility labels of the source it came from", () => {
    setup(["finance"]);
    const r = admitEntity(db, { name: "Molino Nuovo", kind: "organization", quote: "Offerta di Molino Nuovo" }, sid);
    expect(r.ok && r.entity.origin?.labels).toEqual(["finance"]);
  });

  it("reuses a known entity by name, alias, case, accents or legal form instead of creating another", () => {
    setup();
    seedEntities(db, DEMO_ENTITIES);
    const before = count();
    const sid2 = insertSource(db, { kind: "email", external_id: "m2", occurred_at: "2026-10-13T09:00:00Z", raw: "Il molino ROSSI srl e Molino Tavoliere hanno risposto; la semola di grano duro costa 400 €/t." }).source_id;
    for (const [name, quote, id] of [
      ["Molino Rossi S.r.l.", "Il molino ROSSI srl", "ent:molino_rossi"],
      ["molino rossi", "Il molino ROSSI", "ent:molino_rossi"],
      ["Tavoliere", "Molino Tavoliere", "ent:molino_tavoliere"],
      ["semola di grano duro", "la semola di grano duro costa", "ent:durum_semolina"],
    ] as const) {
      const r = admitEntity(db, { name, kind: "organization", quote }, sid2);
      expect(r, name).toMatchObject({ ok: true, created: false, entity: { id } });
    }
    expect(count()).toBe(before);
  });

  it("reuses an existing entity when one of the declared aliases is already known", () => {
    setup();
    seedEntities(db, DEMO_ENTITIES);
    const r = admitEntity(db, { name: "Mulino Rossi", kind: "organization", aliases: ["Molino Rossi"], quote: "Mulino Rossi (anche Molino Rossi)" }, insertSource(db, { kind: "email", external_id: "m3", occurred_at: "2026-10-13T09:00:00Z", raw: "Scrive Mulino Rossi (anche Molino Rossi) per la consegna." }).source_id);
    expect(r).toMatchObject({ ok: true, created: false, entity: { id: "ent:molino_rossi" } });
  });

  it("is idempotent", () => {
    setup();
    const d = { name: "Molino Nuovo", kind: "organization", quote: "Offerta di Molino Nuovo" };
    expect(admitEntity(db, d, sid)).toMatchObject({ created: true });
    const n = count();
    expect(admitEntity(db, d, sid)).toMatchObject({ ok: true, created: false });
    expect(count()).toBe(n);
  });

  it("keeps only aliases the quote itself shows, that differ from the name, without duplicates", () => {
    setup();
    const s2 = insertSource(db, { kind: "email", external_id: "al", occurred_at: "2026-10-12T09:00:00Z", raw: "La Fior di Grano, detta anche Grano Fior, è la nostra semola." }).source_id;
    const r = admitEntity(db, { name: "Fior di Grano", kind: "item", aliases: ["Grano Fior", "grano fior", "Fior di Grano", "Fior di grano S.p.A.", "Mulino Immaginario", 5 as never], quote: "La Fior di Grano, detta anche Grano Fior," }, s2);
    expect(r.ok && r.entity.aliases).toEqual(["Grano Fior"]);
  });

  it("refuses what is not grounded, with a reason", () => {
    setup();
    const NOT_GROUNDED = /does not appear in the quote or in the source's header information/;
    const cases: [object, RegExp][] = [
      [{ name: "Molino Fantasma", kind: "organization", quote: "Offerta di Molino Nuovo S.r.l." }, NOT_GROUNDED],
      [{ name: "Molino Nuovo", kind: "organization", quote: "Offerta di un altro molino" }, /does not appear in the source/],
      [{ name: "Molino Nuovo", kind: "organization", quote: "" }, NOT_GROUNDED],
      [{ name: "Molino Nuovo", kind: "organization", quote: "   " }, NOT_GROUNDED],
      [{ name: "Molino Nuovo", kind: "organization", quote: 7 }, NOT_GROUNDED],
      [{ name: "Molino Nuovo", kind: "planet", quote: "Offerta di Molino Nuovo" }, /kind must be one of/],
      [{ name: "M", kind: "organization", quote: "Offerta di Molino Nuovo" }, /not usable/],
      [{ name: "x".repeat(81), kind: "organization", quote: "Offerta di Molino Nuovo" }, /not usable/],
      [{ name: "Molino\nNuovo", kind: "organization", quote: "Offerta di Molino Nuovo" }, /not usable/],
      [{ name: 42, kind: "organization", quote: "Offerta di Molino Nuovo" }, /not usable/],
      [{ name: "S.r.l.", kind: "organization", quote: "Molino Nuovo S.r.l." }, /not usable/],
    ];
    for (const [d, re] of cases) {
      const r = admitEntity(db, d as never, sid);
      expect(r.ok, JSON.stringify(d)).toBe(false);
      if (!r.ok) expect(r.error, JSON.stringify(d)).toMatch(re);
    }
    expect(count()).toBe(ENTITIES.length);
  });

  it("a name must be a whole word in the quote, not a fragment of another word", () => {
    setup();
    const s2 = insertSource(db, { kind: "email", external_id: "bn", occurred_at: "2026-10-12T09:00:00Z", raw: "Una banana e Molino Nuovo." }).source_id;
    expect(admitEntity(db, { name: "Ana", kind: "person", quote: "Una banana e Molino Nuovo." }, s2)).toMatchObject({ ok: false });
    expect(admitEntity(db, { name: "Banana", kind: "item", quote: "Una banana e Molino Nuovo." }, s2)).toMatchObject({ ok: true, created: true });
  });

  it("refuses an address used as a name, and says how to fix it", () => {
    db = openDb(":memory:");
    const m = insertSource(db, { kind: "email", external_id: "ad", author: "anna.rossi@molinorossi.example", occurred_at: "2026-10-12T09:00:00Z", raw: "Ciao." }).source_id;
    for (const name of ["anna.rossi@molinorossi.example", "https://molinorossi.example/offerte", "www.molinorossi.example"]) {
      const r = admitEntity(db, { name, kind: "organization" }, m);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.error, name).toMatch(/is an address, not a name: declare the company or person it stands for/);
    }
    expect(admitEntity(db, { name: "Molino Rossi", kind: "organization" }, m)).toMatchObject({ ok: true, created: true });
  });

  it("refuses a name that cannot make an id, and an unknown source", () => {
    setup();
    const jp = insertSource(db, { kind: "email", external_id: "jp", occurred_at: "2026-10-12T09:00:00Z", raw: "Scrive 日本 oggi" }).source_id;
    const r = admitEntity(db, { name: "日本", kind: "organization", quote: "Scrive 日本 oggi" }, jp);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/no usable id/);
    expect(admitEntity(db, { name: "Molino Nuovo", kind: "organization", quote: "Offerta di Molino Nuovo" }, "nope")).toMatchObject({ ok: false, error: expect.stringMatching(/unknown source/) });
  });

  it("an ambiguous quote is refused so the anchor is unambiguous", () => {
    setup();
    const dup = insertSource(db, { kind: "email", external_id: "dup", occurred_at: "2026-10-12T09:00:00Z", raw: "Molino Nuovo scrive. Molino Nuovo scrive." }).source_id;
    const r = admitEntity(db, { name: "Molino Nuovo", kind: "organization", quote: "Molino Nuovo scrive" }, dup);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/more than once/) });
  });
});

describe("seedEntities", () => {
  it("adds missing entities and never overwrites an existing id", () => {
    db = openDb(":memory:");
    seedEntities(db, DEMO_ENTITIES);
    const n = (db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n;
    expect(n).toBe(ENTITIES.length + DEMO_ENTITIES.length);
    seedEntities(db, [{ ...DEMO_ENTITIES[0], name: "Renamed" }, { id: "ent:extra", version: 1, name: "Extra", kind: "item", aliases: [] }]);
    expect(listEntities(db).find((e) => e.id === DEMO_ENTITIES[0].id)?.name).toBe(DEMO_ENTITIES[0].name);
    expect(listEntities(db).some((e) => e.id === "ent:extra")).toBe(true);
    expect(verify(db).ok).toBe(true);
  });

  it("listEntities returns the latest version of each", () => {
    db = openDb(":memory:");
    db.prepare("INSERT INTO entities (entity_id, version, definition, definition_hash, created_at) VALUES (?, 2, ?, 'h', 'x')").run(
      "ent:marta_ricci",
      JSON.stringify({ id: "ent:marta_ricci", version: 2, name: "Marta R. Ricci", kind: "person", aliases: ["Marta"] }),
    );
    const marta = listEntities(db).filter((e) => e.id === "ent:marta_ricci");
    expect(marta).toHaveLength(1);
    expect(marta[0]).toMatchObject({ version: 2, name: "Marta R. Ricci" });
  });
});


describe("admitEntity: grounding in the source's header information", () => {
  // The body names nobody: the supplier is only in who wrote it, who got it, the parties, the publisher.
  const mail = (db: DB) =>
    insertSource(db, {
      kind: "email",
      external_id: "h1",
      author: "anna.rossi@molinorossi.example",
      recipients: ["buyer@pastaco.example", "marco.verdi@pastaco.example"],
      occurred_at: "2026-10-12T09:00:00Z",
      raw: "Ciao, la semola del lotto di ottobre costa 412 €/t, valida fino al 31 dicembre.",
      meta: { subject: "Offerta", from_name: "Anna Rossi", to: [{ name: "Marco Verdi", addr: "marco.verdi@pastaco.example" }] },
    }).source_id;

  it("recognises the supplier from the sender's address domain, without any quote", () => {
    db = openDb(":memory:");
    const m = mail(db);
    const r = admitEntity(db, { name: "Molino Rossi", kind: "organization" }, m);
    expect(r).toMatchObject({ ok: true, created: true, entity: { id: "ent:molino_rossi", name: "Molino Rossi" } });
    if (r.ok) {
      expect(r.entity.origin).toMatchObject({ source_id: m, via: "author" });
      expect(r.entity.origin?.quote_id).toBeUndefined();
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM quotes").get()).toEqual({ n: 0 }); // nothing to anchor: no quote row
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("recognises people and the company from names and recipient addresses", () => {
    db = openDb(":memory:");
    const m = mail(db);
    expect(admitEntity(db, { name: "Anna Rossi", kind: "person" }, m)).toMatchObject({ ok: true, entity: { id: "ent:anna_rossi" } });
    expect(admitEntity(db, { name: "Marco Verdi", kind: "person" }, m)).toMatchObject({ ok: true, entity: { id: "ent:marco_verdi" } });
    expect(admitEntity(db, { name: "Pastaco S.p.A.", kind: "organization" }, m)).toMatchObject({ ok: true, entity: { id: "ent:pastaco" } });
  });

  it("recognises the parties of a document and the publisher of a news article", () => {
    db = openDb(":memory:");
    const doc = insertSource(db, { kind: "document", external_id: "CQ", occurred_at: "2026-01-15T00:00:00Z", raw: "Il prezzo è fissato in 412 €/t.", meta: { title: "Contratto", parties: ["Pastaco S.p.A.", "Molino Tavoliere S.r.l."] } }).source_id;
    expect(admitEntity(db, { name: "Molino Tavoliere S.r.l.", kind: "organization" }, doc)).toMatchObject({ ok: true, entity: { id: "ent:molino_tavoliere", origin: { via: "party" } } });
    const news = insertSource(db, { kind: "news", external_id: "n1", occurred_at: "2026-11-21T07:00:00Z", raw: "La semola sale.", meta: { title: "Semola", domain: "granimercati.example" } }).source_id;
    expect(admitEntity(db, { name: "Granimercati", kind: "organization" }, news)).toMatchObject({ ok: true, entity: { origin: { via: "publisher" } } });
  });

  it("handles hyphenated domains and run-together names", () => {
    db = openDb(":memory:");
    const s = insertSource(db, { kind: "email", external_id: "mh", author: "luca.greco@mulino-santa-chiara.example", occurred_at: "2026-10-12T09:00:00Z", raw: "Buongiorno, confermiamo." }).source_id;
    expect(admitEntity(db, { name: "Mulino Santa Chiara", kind: "organization" }, s)).toMatchObject({ ok: true, entity: { id: "ent:mulino_santa_chiara" } });
    const s2 = insertSource(db, { kind: "email", external_id: "mh2", author: "anna@molinorossi.example", occurred_at: "2026-10-12T09:00:00Z", raw: "Buongiorno." }).source_id;
    expect(admitEntity(db, { name: "Molino Rossi", kind: "organization" }, s2)).toMatchObject({ ok: true, created: true });
  });

  it("still refuses a name the header information does not show", () => {
    db = openDb(":memory:");
    const m = mail(db);
    for (const name of ["Molino Bianchi", "Verdi Pasta", "Ann", "Ros"]) {
      const r = admitEntity(db, { name, kind: "organization" }, m);
      expect(r.ok, name).toBe(false);
    }
  });

  it("a quote is used when it grounds the name, otherwise the header information is", () => {
    db = openDb(":memory:");
    const m = mail(db);
    const viaQuote = admitEntity(db, { name: "semola", kind: "item", quote: "la semola del lotto di ottobre" }, m);
    expect(viaQuote).toMatchObject({ ok: true, entity: { origin: { via: "quote" } } });
    // the quote does not contain the name, but the author address does: still recognised
    const viaHeader = admitEntity(db, { name: "Molino Rossi", kind: "organization", quote: "la semola del lotto di ottobre" }, m);
    expect(viaHeader).toMatchObject({ ok: true, entity: { origin: { via: "author" } } });
  });

  it("aliases are kept when the header information shows them", () => {
    db = openDb(":memory:");
    const m = mail(db);
    const r = admitEntity(db, { name: "Molino Rossi", kind: "organization", aliases: ["Rossi", "Mulino Immaginario"] }, m);
    expect(r.ok && r.entity.aliases).toEqual(["Rossi"]);
  });
});
