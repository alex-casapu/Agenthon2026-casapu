import { memDb } from "../testkit";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listClaims, listSources, submitClaim, verify, type DB } from "../store";
import { parseDocumentSource } from "./document";
import { listInboxFiles, scanInbox } from "./inbox";

const header = (over: Record<string, string | null> = {}) => {
  const h: Record<string, string | null> = {
    doc_id: "DOC-1",
    doc_type: "contract",
    title: "Contratto quadro",
    date: "2026-01-15",
    ...over,
  };
  return Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\n");
};
const doc = (over: Record<string, string | null> = {}, body = "\nIl prezzo è fissato in 412 €/t fino al 31/03/2027.\n") => `---\n${header(over)}\n---\n${body}`;
const ok = (text: string) => {
  const r = parseDocumentSource(text);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.parsed;
};

describe("parseDocumentSource", () => {
  it("maps a full document to the common source shape", () => {
    const p = ok(
      doc({
        author: "[Sara Conti, Luca Bianchi]",
        reference: '"CQ-2026-031"',
        parties: '["Pastaco S.p.A.", "Molino Tavoliere S.r.l."]',
        version: '"1.10"',
        supersedes: "DOC-0",
        origin: "DMS contratti",
        language: "it",
        labels: "[finance]",
        reliability: "high",
      }),
    );
    expect(p).toMatchObject({
      kind: "document",
      external_id: "DOC-1",
      occurred_at: "2026-01-15T00:00:00.000Z",
      author: "Sara Conti, Luca Bianchi",
      recipients: [],
      thread_id: null,
      reply_to: null,
      labels: ["finance"],
    });
    expect(p.meta).toMatchObject({
      doc_type: "contract",
      title: "Contratto quadro",
      reference: "CQ-2026-031",
      parties: ["Pastaco S.p.A.", "Molino Tavoliere S.r.l."],
      version: "1.10",
      supersedes: "DOC-0",
      origin: "DMS contratti",
      date_precision: "day",
    });
    expect(p.body).toBe("\nIl prezzo è fissato in 412 €/t fino al 31/03/2027.\n");
  });

  it("defaults the optional fields", () => {
    const p = ok(doc());
    expect(p.labels).toEqual(["public"]);
    expect(p.author).toBeNull();
    expect(p.meta).toMatchObject({ reference: null, parties: [], version: null, supersedes: null, origin: null, reliability: null });
  });

  it("keeps full timestamps in UTC", () => {
    const p = ok(doc({ date: "2026-11-20T06:00:00+01:00" }));
    expect(p.occurred_at).toBe("2026-11-20T05:00:00.000Z");
    expect(p.meta.date_precision).toBe("time");
  });

  it("rejects what the contract forbids, with reasons", () => {
    const cases: [string, string, RegExp][] = [
      ["no header", "just text", /must start with/],
      ["bad yaml", "---\ndoc_id: [oops\n---\nbody", /not valid YAML/],
      ["missing id", doc({ doc_id: null }), /doc_id/],
      ["id with spaces", doc({ doc_id: '"A 1"' }), /whitespace/],
      ["missing type", doc({ doc_type: null }), /doc_type/],
      ["uppercase type", doc({ doc_type: "Contract" }), /doc_type/],
      ["missing title", doc({ title: null }), /title/],
      ["missing date", doc({ date: null }), /date/],
      ["naive datetime", doc({ date: "2026-01-15T10:00:00" }), /YYYY-MM-DD or ISO/],
      ["impossible date", doc({ date: "2026-02-30" }), /real date/],
      ["numeric reference", doc({ reference: "8841" }), /quote it/],
      ["numeric version", doc({ version: "1.10" }), /quote it/],
      ["parties as a string", doc({ parties: "Pastaco S.p.A." }), /parties/],
      ["empty parties", doc({ parties: "[]" }), /parties/],
      ["bad language", doc({ language: "Italian" }), /BCP 47/],
      ["bad label", doc({ labels: "[Finance]" }), /labels/],
      ["bad reliability", doc({ reliability: "ok" }), /reliability/],
      ["supersedes with spaces", doc({ supersedes: '"a b"' }), /whitespace/],
      ["news field", doc({ domain: "example.com" }), /domain/],
      ["unknown key", doc({ department: "x" }), /department/],
      ["empty body", doc({}, "\n  \n"), /body is empty/],
    ];
    for (const [name, text, re] of cases) {
      const r = parseDocumentSource(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.errors.join("\n"), name).toMatch(re);
    }
  });

  it("content_hash ignores key order and changes with the body", () => {
    const a = ok(doc());
    const b = ok(`---\ndate: 2026-01-15\ntitle: Contratto quadro\ndoc_type: contract\ndoc_id: DOC-1\n---\n\nIl prezzo è fissato in 412 €/t fino al 31/03/2027.\n`);
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.content_hash).not.toBe(ok(doc({}, "\naltro\n")).content_hash);
  });
});

describe("document ingest", () => {
  let db: DB;
  let docs: string;
  const put = (name: string, text: string, root = docs) => {
    const p = join(root, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  const scan = (root = docs) => scanInbox(db, root, { kind: "document" });
  beforeEach(() => {
    db = memDb();
    docs = mkdtempSync(join(tmpdir(), "docs-"));
  });

  it("ingests a document as a source with its type in meta", () => {
    put("a.md", doc({ labels: "[finance]", author: "Sara", parties: '["Pastaco"]' }));
    expect(scan().outcomes).toMatchObject([{ kind: "document", path: "a.md", result: "ingested" }]);
    const row = db.prepare("SELECT * FROM sources").get() as Record<string, string>;
    expect(row).toMatchObject({ kind: "document", external_id: "DOC-1", author: "Sara", thread_id: null, occurred_at: "2026-01-15T00:00:00.000Z" });
    expect(JSON.parse(row.acl_labels)).toEqual(["finance"]);
    expect(JSON.parse(row.meta)).toMatchObject({ doc_type: "contract", parties: ["Pastaco"], file: "a.md" });
    expect((db.prepare("SELECT json_extract(meta, '$.doc_type') AS t FROM sources").get() as { t: string }).t).toBe("contract");
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("a new version is a new document that points at the old one; the old one is untouched", () => {
    put("v1.md", doc({ doc_id: "CQ-1", version: '"1"' }));
    scan();
    const before = db.prepare("SELECT * FROM sources WHERE external_id = 'CQ-1'").all();
    put("v2.md", doc({ doc_id: "CQ-1-v2", version: '"2"', supersedes: "CQ-1", date: "2026-06-01" }, "\nIl prezzo è fissato in 430 €/t.\n"));
    expect(scan().outcomes).toMatchObject([{ result: "ingested" }]);
    expect(db.prepare("SELECT * FROM sources WHERE external_id = 'CQ-1'").all()).toEqual(before);
    expect((db.prepare("SELECT json_extract(meta, '$.supersedes') AS s FROM sources WHERE external_id = 'CQ-1-v2'").get() as { s: string }).s).toBe("CQ-1");
  });

  it("editing an ingested document is a conflict", () => {
    const p = put("a.md", doc());
    scan();
    writeFileSync(p, doc({}, "\nIl prezzo è fissato in 999 €/t.\n"));
    const r = scan().outcomes;
    expect(r).toMatchObject([{ result: "conflict" }]);
    expect(listSources(db)[0].text).toContain("412");
  });

  it("each kind keeps its own identity space", () => {
    put("a.md", doc({ doc_id: "shared" }));
    const news = mkdtempSync(join(tmpdir(), "news-"));
    put("a.md", `---\narticle_id: shared\ndomain: example.com\ndate: 2026-11-21\ntitle: t\n---\ntesto\n`, news);
    scan();
    scanInbox(db, news, { kind: "news" });
    expect(listSources(db).map((s) => s.kind).sort()).toEqual(["document", "news"]);
  });

  it("a missing folder is just empty", () => {
    const nowhere = join(docs, "not-there");
    expect(listInboxFiles(nowhere)).toEqual([]);
    expect(scan(nowhere)).toEqual({ outcomes: [], pending: 0 });
  });

  it("a table row and a clause are citable through the gate", () => {
    put("wms.md", doc({ doc_id: "WMS-1", doc_type: "export" }, "\n| Articolo | Magazzino | Giacenza (t) | Giorni di copertura |\n|---|---|---|---|\n| Semola di grano duro | Parma | 1.200 | 9 |\n"));
    scan();
    const [src] = listSources(db);
    const r = submitClaim(db, {
      predicate_id: "statement",
      fields: { text: "Le scorte di semola a Parma coprono 9 giorni." },
      evidence: [{ source_id: src.source_id, quote: "| Semola di grano duro | Parma | 1.200 | 9 |" }],
    });
    expect(r.ok).toBe(true);
    expect(listClaims(db)).toHaveLength(1);
    expect(verify(db).ok).toBe(true);
  });

  it("the shipped examples ingest, tables included", () => {
    const dir = join(process.cwd(), "examples", "docs");
    expect(readdirSync(dir).filter((f) => f.endsWith(".md"))).toHaveLength(4);
    const { outcomes } = scan(dir);
    expect(outcomes.map((o) => o.result)).toEqual(["ingested", "ingested", "ingested", "ingested"]);
    const types = db.prepare("SELECT json_extract(meta, '$.doc_type') AS t FROM sources ORDER BY external_id").all() as { t: string }[];
    expect(types.map((r) => r.t).sort()).toEqual(["contract", "export", "invoice", "plan"]);

    // the contract price clause and the invoice line are citable as structured claims
    const contract = listSources(db).find((s) => s.external_id === "CQ-2026-031")!;
    const price = submitClaim(db, {
      predicate_id: "supplier_price",
      evidence: [{ source_id: contract.source_id, quote: "è fissato in 412 €/t" }],
      fields: { supplier: "ent:molino_tavoliere", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t" },
    });
    expect(price.ok).toBe(true);
    const inv = listSources(db).find((s) => s.external_id === "INV-8841")!;
    const due = submitClaim(db, {
      predicate_id: "commitment",
      evidence: [{ source_id: inv.source_id, quote: "Scadenza di pagamento: 29/11/2026" }],
      fields: { owner: "ent:pastaco", counterparty: "ent:molino_tavoliere", action: "pay invoice 8841", due: "2026-11-29" },
    });
    expect(due.ok).toBe(true);
    expect(verify(db).ok).toBe(true);
  });
});
