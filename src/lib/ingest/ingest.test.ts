import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { listClaims, listSources, openDb, submitClaim, verify, type DB } from "../store";
import { parseEmail } from "./email";
import { ingestFile, listInboxFiles, scanInbox } from "./inbox";
import { startInboxWatcher } from "./watcher";

const header = (over: Record<string, string | null> = {}) => {
  const h: Record<string, string | null> = {
    message_id: "msg-1",
    date: "2026-10-12T09:15:00+02:00",
    from: "Anna Rossi <Anna.Rossi@Mill.example>",
    to: "marco@co.example",
    subject: "Offerta",
    ...over,
  };
  return Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\n");
};
const email = (over: Record<string, string | null> = {}, body = "\nIl prezzo è 412 €/t, valido fino al 31 dicembre.\n") => `---\n${header(over)}\n---\n${body}`;

describe("parseEmail", () => {
  it("parses a valid email and normalises it", () => {
    const r = parseEmail(email({ cc: "[\"a@x.example\", \"\\\"B, Jr\\\" <b@x.example>\"]" }));
    if (!r.ok) throw new Error(r.errors.join("; "));
    const h = r.email.header;
    expect(h.from).toEqual({ name: "Anna Rossi", addr: "anna.rossi@mill.example" });
    expect(h.to).toEqual([{ name: null, addr: "marco@co.example" }]);
    expect(h.cc.map((a) => a.addr)).toEqual(["a@x.example", "b@x.example"]);
    expect(h.date).toBe("2026-10-12T07:15:00.000Z");
    expect(h.labels).toEqual(["public"]);
    expect(h.reliability).toBeNull();
    expect(r.email.body).toBe("\nIl prezzo è 412 €/t, valido fino al 31 dicembre.\n");
  });

  it("tells the writer to quote values containing a colon", () => {
    const r = parseEmail(email({ subject: "Re: Offerta" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/not valid YAML/);
    expect(parseEmail(email({ subject: '"Re: Offerta"' })).ok).toBe(true);
  });

  it("accepts lists, comma-separated recipients, labels and reliability", () => {
    const r = parseEmail(email({ to: "a@x.example, b@x.example", labels: "[finance, tutti]", reliability: "low", thread_id: "t1", in_reply_to: "msg-0" }));
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(r.email.header).toMatchObject({ labels: ["finance", "tutti"], reliability: "low", thread_id: "t1", in_reply_to: "msg-0" });
    expect(r.email.header.to).toHaveLength(2);
  });

  it("normalises CRLF and keeps the body verbatim", () => {
    const r = parseEmail(email({}, "\nriga uno\nriga due   \n").replace(/\n/g, "\r\n"));
    if (!r.ok) throw new Error();
    expect(r.email.body).toBe("\nriga uno\nriga due   \n");
  });

  it("rejects what the contract forbids, with reasons", () => {
    const cases: [string, string, RegExp][] = [
      ["no header", "just text", /must start with/],
      ["unclosed header", "---\nmessage_id: a\nbody", /must start with/],
      ["bad yaml", "---\nmessage_id: [oops\n---\nbody", /not valid YAML/],
      ["not a mapping", "---\n- a\n- b\n---\nbody", /mapping/],
      ["naive date", email({ date: "2026-10-12T09:15:00" }), /timezone/],
      ["date only", email({ date: "2026-10-12" }), /timezone/],
      ["impossible date", email({ date: "2026-13-45T09:15:00Z" }), /real date/],
      ["missing message_id", email({ message_id: null }), /message_id/],
      ["numeric message_id", email({ message_id: "123" }), /message_id/],
      ["spaces in id", email({ message_id: "\"a b\"" }), /whitespace/],
      ["no recipients", email({ to: null }), /to/],
      ["two senders", email({ from: "a@x.example, b@x.example" }), /exactly one/],
      ["bad address", email({ from: "not-an-address" }), /exactly one/],
      ["missing subject", email({ subject: null }), /subject/],
      ["bad label", email({ labels: "[Finance]" }), /labels/],
      ["bad reliability", email({ reliability: "medium" }), /reliability/],
      ["unknown key", email({ importance: "high" }), /importance/],
      ["empty body", email({}, "\n  \n"), /body is empty/],
    ];
    for (const [name, text, re] of cases) {
      const r = parseEmail(text);
      expect(r.ok, name).toBe(false);
      if (!r.ok) expect(r.errors.join("\n"), name).toMatch(re);
    }
  });

  it("content_hash ignores header key order but not content", () => {
    const a = parseEmail(email());
    const b = parseEmail(`---\nsubject: Offerta\nto: marco@co.example\nfrom: Anna Rossi <anna.rossi@mill.example>\ndate: 2026-10-12T07:15:00Z\nmessage_id: msg-1\n---\n\nIl prezzo è 412 €/t, valido fino al 31 dicembre.\n`);
    const c = parseEmail(email({}, "\nIl prezzo è 413 €/t.\n"));
    if (!a.ok || !b.ok || !c.ok) throw new Error();
    expect(a.email.content_hash).toBe(b.email.content_hash);
    expect(a.email.content_hash).not.toBe(c.email.content_hash);
  });
});

describe("ingest", () => {
  let db: DB;
  let root: string;
  const put = (name: string, text: string) => {
    const p = join(root, name);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
    return p;
  };
  beforeEach(() => {
    db = openDb(":memory:");
    root = mkdtempSync(join(tmpdir(), "inbox-"));
  });

  it("ingests a new email as a source mapped per the contract", () => {
    put("a.md", email({ labels: "[finance]", reliability: "high", cc: "c@x.example" }));
    const { outcomes } = scanInbox(db, root);
    expect(outcomes).toMatchObject([{ path: "a.md", result: "ingested" }]);
    const row = db.prepare("SELECT * FROM sources").get() as Record<string, string>;
    expect(row).toMatchObject({ kind: "email", external_id: "msg-1", thread_id: "msg-1", author: "anna.rossi@mill.example", occurred_at: "2026-10-12T07:15:00.000Z" });
    expect(JSON.parse(row.recipients)).toEqual(["marco@co.example", "c@x.example"]);
    expect(JSON.parse(row.acl_labels)).toEqual(["finance"]);
    expect(JSON.parse(row.meta)).toMatchObject({ subject: "Offerta", from_name: "Anna Rossi", reliability: "high", file: "a.md" });
    expect(row.canonical_text).toBe("\nIl prezzo è 412 €/t, valido fino al 31 dicembre.\n");
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("a backdated email is added now and changes nothing before it", () => {
    put("new.md", email({ message_id: "msg-new", date: "2026-11-20T10:00:00Z" }));
    scanInbox(db, root);
    const before = db.prepare("SELECT * FROM sources").all();
    const lastSeq = (db.prepare("SELECT MAX(seq) AS s FROM log").get() as { s: number }).s;

    put("old.md", email({ message_id: "msg-old", date: "2020-01-01T08:00:00Z" }, "\nvecchia notizia\n"));
    scanInbox(db, root);

    expect(db.prepare("SELECT * FROM sources WHERE external_id = 'msg-new'").all()).toEqual(before);
    const old = db.prepare("SELECT * FROM sources WHERE external_id = 'msg-old'").get() as { occurred_at: string; ingested_at: string };
    expect(old.occurred_at).toBe("2020-01-01T08:00:00.000Z");
    expect(Date.parse(old.ingested_at)).toBeGreaterThan(Date.parse("2026-01-01"));
    const entries = db.prepare("SELECT tbl, row_id FROM log WHERE seq > ?").all(lastSeq) as { tbl: string }[];
    expect(entries.map((e) => e.tbl)).toEqual(["sources", "ingest_events"]);
    expect(verify(db).ok).toBe(true);
  });

  it("re-scanning writes nothing; identical content elsewhere is a duplicate", () => {
    put("a.md", email());
    scanInbox(db, root);
    const n = () => (db.prepare("SELECT COUNT(*) AS n FROM ingest_events").get() as { n: number }).n;
    expect(n()).toBe(1);
    expect(scanInbox(db, root).outcomes).toEqual([]);
    expect(n()).toBe(1);

    put("copy/b.md", email());
    expect(scanInbox(db, root).outcomes).toMatchObject([{ path: "copy/b.md", result: "duplicate" }]);
    expect(listSources(db)).toHaveLength(1);
  });

  it("reports a conflict and ingests nothing when an ingested message is edited", () => {
    const p = put("a.md", email());
    scanInbox(db, root);
    writeFileSync(p, email({}, "\nIl prezzo è 999 €/t.\n"));
    const { outcomes } = scanInbox(db, root);
    expect(outcomes).toMatchObject([{ result: "conflict" }]);
    expect(outcomes[0].errors?.[0]).toMatch(/correction as a new email/);
    expect(listSources(db)).toHaveLength(1);
    expect(listSources(db)[0].text).toContain("412");

    // a header-only edit (e.g. widening labels) is also refused
    writeFileSync(p, email({ labels: "[finance]" }));
    expect(scanInbox(db, root).outcomes).toMatchObject([{ result: "conflict" }]);
  });

  it("records invalid files once, then ingests them when fixed", () => {
    const p = put("a.md", email({ date: "2026-10-12T09:15:00" }));
    expect(scanInbox(db, root).outcomes).toMatchObject([{ result: "invalid" }]);
    expect(scanInbox(db, root).outcomes).toEqual([]);
    writeFileSync(p, email());
    expect(scanInbox(db, root).outcomes).toMatchObject([{ result: "ingested" }]);
  });

  it("ignores non-md, dotfiles and underscore names; recurses into subfolders", () => {
    put("a.md", email({ message_id: "a" }));
    put("sub/deep/b.md", email({ message_id: "b" }));
    put("_draft.md", email({ message_id: "c" }));
    put(".hidden.md", email({ message_id: "d" }));
    put("_dir/e.md", email({ message_id: "e" }));
    put("notes.txt", email({ message_id: "f" }));
    expect(listInboxFiles(root).map((f) => f.slice(root.length + 1))).toEqual(["a.md", "sub/deep/b.md"]);
    expect(scanInbox(db, root).outcomes).toHaveLength(2);
  });

  it("resolves threads from in_reply_to", () => {
    put("1.md", email({ message_id: "m1", thread_id: "T" }));
    scanInbox(db, root);
    put("2.md", email({ message_id: "m2", in_reply_to: "m1" }));
    scanInbox(db, root);
    put("3.md", email({ message_id: "m3", in_reply_to: "unknown-parent" }));
    scanInbox(db, root);
    const t = Object.fromEntries((db.prepare("SELECT external_id, thread_id FROM sources").all() as { external_id: string; thread_id: string }[]).map((r) => [r.external_id, r.thread_id]));
    expect(t).toEqual({ m1: "T", m2: "T", m3: "unknown-parent" });
  });

  it("leaves very recent files for the next pass", () => {
    put("a.md", email());
    const r = scanInbox(db, root, { minAgeMs: 60_000 });
    expect(r).toEqual({ outcomes: [], pending: 1 });
    expect(scanInbox(db, root).outcomes).toHaveLength(1);
  });

  it("makes the body citable through the gate, CRLF files included", () => {
    put("a.md", email({}, "\nCome da telefonata, la semola è a 412 €/t, valida fino al 31 dicembre.\n").replace(/\n/g, "\r\n"));
    scanInbox(db, root);
    const src = listSources(db)[0];
    const r = submitClaim(db, {
      predicate_id: "supplier_price",
      evidence: [{ source_id: src.source_id, quote: "la semola è a 412 €/t, valida fino al 31 dicembre" }],
      fields: { supplier: "ent:mill", item: "ent:semola", amount: 412, currency: "EUR", per: "t", valid_to: "2026-12-31" },
    });
    expect(r.ok).toBe(true);
    expect(listClaims(db)).toHaveLength(1);
    expect(verify(db).ok).toBe(true);
  });

  it("ingestFile on a single path records exactly one ledger row", () => {
    const p = put("a.md", email());
    expect(ingestFile(db, root, p)).toMatchObject({ result: "ingested", path: "a.md" });
    expect((db.prepare("SELECT COUNT(*) AS n FROM ingest_events").get() as { n: number }).n).toBe(1);
  });

  it("the shipped examples all ingest, including the backdated reply", () => {
    const dir = join(process.cwd(), "examples", "inbox");
    expect(readdirSync(dir).filter((f) => f.endsWith(".md")).length).toBeGreaterThanOrEqual(4);
    const { outcomes } = scanInbox(db, dir);
    expect(outcomes.map((o) => o.result)).toEqual(outcomes.map(() => "ingested"));
    const reply = db.prepare("SELECT thread_id, occurred_at FROM sources WHERE external_id = 'msg-2026-10-13-verdi-1005'").get() as { thread_id: string };
    expect(reply.thread_id).toBe("msg-2026-10-12-rossi-0915");
    expect(readFileSync(join(dir, "backdated-reply.md"), "utf8")).toContain("> ");
    expect(verify(db).ok).toBe(true);
  });
});

describe("watcher", () => {
  it("ingests a file dropped into a running inbox", async () => {
    const db = openDb(":memory:");
    const root = mkdtempSync(join(tmpdir(), "inbox-w-"));
    const w = startInboxWatcher(db, root, { settleMs: 40, pollMs: 100 });
    try {
      expect(listSources(db)).toHaveLength(0);
      writeFileSync(join(root, "late.md"), email({ message_id: "late", date: "2019-05-05T05:05:00Z" }));
      const deadline = Date.now() + 4000;
      while (listSources(db).length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      const [s] = listSources(db);
      expect(s.external_id).toBe("late");
      expect(s.occurred_at.startsWith("2019-05-05")).toBe(true);
    } finally {
      w.stop();
    }
  });
});
