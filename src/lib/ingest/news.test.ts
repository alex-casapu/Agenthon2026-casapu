import { memDb } from "../testkit";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listClaims, listSources, submitClaim, verify, type DB } from "../store";
import { scanInbox } from "./inbox";
import { parseNewsSource } from "./news";
import { startInboxWatcher } from "./watcher";

const header = (over: Record<string, string | null> = {}) => {
  const h: Record<string, string | null> = {
    article_id: "news-1",
    domain: "mercatocereali.example",
    date: "2026-11-21",
    title: "Semola sale",
    ...over,
  };
  return Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\n");
};
const article = (over: Record<string, string | null> = {}, body = "\nIl prezzo spot è salito a 502 €/t, +18% in tre settimane.\n") => `---\n${header(over)}\n---\n${body}`;

const ok = (text: string) => {
  const r = parseNewsSource(text);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.parsed;
};

describe("parseNewsSource", () => {
  it("maps a valid article to the common source shape", () => {
    const p = ok(article({ url: "https://www.MercatoCereali.example/a?x=1", author: "[Anna, Luca]", language: "it", reliability: "high", labels: "[tutti]" }));
    expect(p).toMatchObject({
      kind: "news",
      external_id: "news-1",
      occurred_at: "2026-11-21T00:00:00.000Z",
      author: "Anna, Luca",
      recipients: [],
      thread_id: null,
      reply_to: null,
      labels: ["tutti"],
    });
    expect(p.meta).toMatchObject({ domain: "mercatocereali.example", title: "Semola sale", date_precision: "day", language: "it", reliability: "high", corrects: null });
    expect(p.body).toBe("\nIl prezzo spot è salito a 502 €/t, +18% in tre settimane.\n");
  });

  it("keeps full timestamps, converting to UTC", () => {
    const p = ok(article({ date: "2026-11-21T08:00:00+01:00", retrieved_at: "2026-11-21T09:10:00Z" }));
    expect(p.occurred_at).toBe("2026-11-21T07:00:00.000Z");
    expect(p.meta).toMatchObject({ date_precision: "time", retrieved_at: "2026-11-21T09:10:00.000Z" });
  });

  it("normalises the domain", () => {
    expect(ok(article({ domain: "WWW.Example.COM." })).meta.domain).toBe("example.com");
    expect(ok(article({ domain: "news.example.co.uk" })).meta.domain).toBe("news.example.co.uk");
  });

  it("accepts a url on the same host, with or without www", () => {
    expect(parseNewsSource(article({ url: "https://mercatocereali.example/x" })).ok).toBe(true);
    expect(parseNewsSource(article({ url: "http://www.mercatocereali.example/x" })).ok).toBe(true);
  });

  it("stores corrects and defaults labels to public", () => {
    const p = ok(article({ corrects: "news-0" }));
    expect(p.meta.corrects).toBe("news-0");
    expect(p.labels).toEqual(["public"]);
  });

  it("rejects what the contract forbids, with reasons", () => {
    const cases: [string, string, RegExp][] = [
      ["no header", "just text", /must start with/],
      ["bad yaml", "---\narticle_id: [oops\n---\nbody", /not valid YAML/],
      ["unquoted colon title", article({ title: "Rettifica: semola" }), /not valid YAML/],
      ["missing id", article({ article_id: null }), /article_id/],
      ["missing domain", article({ domain: null }), /domain/],
      ["domain is a url", article({ domain: "https://example.com/a" }), /bare hostname/],
      ["domain with port", article({ domain: "example.com:8080" }), /bare hostname/],
      ["domain without tld", article({ domain: "localhost" }), /bare hostname/],
      ["missing date", article({ date: null }), /date/],
      ["datetime without tz", article({ date: "2026-11-21T08:00:00" }), /YYYY-MM-DD or ISO/],
      ["slashes date", article({ date: "21/11/2026" }), /YYYY-MM-DD or ISO/],
      ["impossible day", article({ date: "2026-02-31" }), /real date/],
      ["missing title", article({ title: null }), /title/],
      ["url not http", article({ url: "ftp://mercatocereali.example/x" }), /http\(s\)/],
      ["url garbage", article({ url: "not a url" }), /http\(s\)/],
      ["url host mismatch", article({ url: "https://other.example/x" }), /does not match domain/],
      ["bad language", article({ language: "Italian" }), /BCP 47/],
      ["naive retrieved_at", article({ retrieved_at: "2026-11-21T09:10:00" }), /timezone/],
      ["corrects with spaces", article({ corrects: "\"a b\"" }), /whitespace/],
      ["bad reliability", article({ reliability: "maybe" }), /reliability/],
      ["email field", article({ from: "a@b.example" }), /from/],
      ["unknown key", article({ section: "x" }), /section/],
      ["empty body", article({}, "\n \n"), /body is empty/],
    ];
    for (const [name, text, re] of cases) {
      const r = parseNewsSource(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.errors.join("\n"), name).toMatch(re);
    }
  });

  it("content_hash ignores key order and changes with the body", () => {
    const a = ok(article());
    const b = ok(`---\ntitle: Semola sale\ndate: 2026-11-21\ndomain: www.mercatocereali.example\narticle_id: news-1\n---\n\nIl prezzo spot è salito a 502 €/t, +18% in tre settimane.\n`);
    expect(a.content_hash).toBe(b.content_hash);
    expect(a.content_hash).not.toBe(ok(article({}, "\naltro testo\n")).content_hash);
  });
});

describe("news ingest", () => {
  let db: DB;
  let news: string;
  let inbox: string;
  const put = (root: string, name: string, text: string) => {
    const p = join(root, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  const scanNews = () => scanInbox(db, news, { kind: "news" });
  beforeEach(() => {
    db = memDb();
    news = mkdtempSync(join(tmpdir(), "news-"));
    inbox = mkdtempSync(join(tmpdir(), "inbox-"));
  });

  it("ingests an article as a news source with domain in meta", () => {
    put(news, "a.md", article({ labels: "[finance]", author: "Redazione" }));
    expect(scanNews().outcomes).toMatchObject([{ kind: "news", path: "a.md", result: "ingested" }]);
    const row = db.prepare("SELECT * FROM sources").get() as Record<string, string>;
    expect(row).toMatchObject({ kind: "news", external_id: "news-1", author: "Redazione", thread_id: null, occurred_at: "2026-11-21T00:00:00.000Z" });
    expect(JSON.parse(row.recipients)).toEqual([]);
    expect(JSON.parse(row.acl_labels)).toEqual(["finance"]);
    expect(JSON.parse(row.meta)).toMatchObject({ domain: "mercatocereali.example", date_precision: "day", file: "a.md" });
    expect((db.prepare("SELECT json_extract(meta, '$.domain') AS d FROM sources").get() as { d: string }).d).toBe("mercatocereali.example");
    expect(db.prepare("SELECT kind FROM ingest_events").get()).toEqual({ kind: "news" });
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("an old article is added now", () => {
    put(news, "old.md", article({ article_id: "old", date: "2015-03-02" }));
    scanNews();
    const s = db.prepare("SELECT occurred_at, ingested_at FROM sources").get() as { occurred_at: string; ingested_at: string };
    expect(s.occurred_at.startsWith("2015-03-02")).toBe(true);
    expect(Date.parse(s.ingested_at)).toBeGreaterThan(Date.parse("2026-01-01"));
  });

  it("duplicates and conflicts behave as for email", () => {
    const p = put(news, "a.md", article());
    scanNews();
    put(news, "copy.md", article());
    expect(scanNews().outcomes).toMatchObject([{ path: "copy.md", result: "duplicate" }]);
    writeFileSync(p, article({}, "\nIl prezzo è 300 €/t.\n"));
    const r = scanNews().outcomes;
    expect(r).toMatchObject([{ result: "conflict" }]);
    expect(r[0].errors?.[0]).toMatch(/correction as a new item/);
    expect(listSources(db)).toHaveLength(1);
  });

  it("a correction is a new article that points at the old one", () => {
    put(news, "1.md", article({ article_id: "n1" }));
    put(news, "2.md", article({ article_id: "n2", corrects: "n1", date: "2026-11-21T15:30:00+01:00" }, "\nRettifica: la media nazionale è 478 €/t.\n"));
    scanNews();
    const rows = db.prepare("SELECT external_id, json_extract(meta, '$.corrects') AS c FROM sources ORDER BY rowid").all();
    expect(rows).toEqual([{ external_id: "n1", c: null }, { external_id: "n2", c: "n1" }]);
  });

  it("kinds have separate identity spaces and separate ledgers", () => {
    put(inbox, "x.md", `---\nmessage_id: same-id\ndate: 2026-10-12T09:00:00Z\nfrom: a@x.example\nto: b@x.example\nsubject: s\n---\nCiao 412 €/t\n`);
    put(news, "x.md", article({ article_id: "same-id" }));
    scanInbox(db, inbox, { kind: "email" });
    expect(scanNews().outcomes).toMatchObject([{ kind: "news", result: "ingested" }]);
    expect(listSources(db).map((s) => s.kind).sort()).toEqual(["email", "news"]);
  });

  it("a news file dropped into the email folder is invalid, and still ingests once moved to the news folder", () => {
    const text = article();
    put(inbox, "a.md", text);
    expect(scanInbox(db, inbox, { kind: "email" }).outcomes).toMatchObject([{ kind: "email", result: "invalid" }]);
    put(news, "a.md", text); // same name, same bytes, right folder
    expect(scanNews().outcomes).toMatchObject([{ kind: "news", result: "ingested" }]);
  });

  it("makes the article body citable through the gate", () => {
    put(news, "a.md", article({}, "\nIl prezzo spot della semola è salito a 502 €/t, +18% in tre settimane.\n"));
    scanNews();
    const [src] = listSources(db);
    const r = submitClaim(db, {
      predicate_id: "statement",
      fields: { text: "Il prezzo spot è salito a 502 €/t." },
      evidence: [{ source_id: src.source_id, quote: "salito a 502 €/t, +18% in tre settimane" }],
    });
    expect(r.ok).toBe(true);
    expect(listClaims(db)).toHaveLength(1);
    expect(verify(db).ok).toBe(true);
  });

  it("the shipped news examples ingest, including the correction", () => {
    const dir = join(process.cwd(), "examples", "news");
    expect(readdirSync(dir).filter((f) => f.endsWith(".md"))).toHaveLength(3);
    const { outcomes } = scanInbox(db, dir, { kind: "news" });
    expect(outcomes.map((o) => o.result)).toEqual(["ingested", "ingested", "ingested"]);
    const c = db.prepare("SELECT json_extract(meta, '$.corrects') AS c FROM sources WHERE external_id = 'news-2026-11-21-rettifica'").get() as { c: string };
    expect(c.c).toBe("news-2026-11-21-semola-502");
    expect(verify(db).ok).toBe(true);
  });

  it("a watcher ingests a dropped article", async () => {
    const w = startInboxWatcher(db, news, { kind: "news", settleMs: 40, pollMs: 100 });
    try {
      writeFileSync(join(news, "late.md"), article({ article_id: "late" }));
      const deadline = Date.now() + 4000;
      while (listSources(db).length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      expect(listSources(db)[0]).toMatchObject({ kind: "news", external_id: "late" });
    } finally {
      w.stop();
    }
  });
});
