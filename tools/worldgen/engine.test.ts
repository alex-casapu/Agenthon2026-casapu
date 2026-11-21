import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDir, playTier, readSpec, writeWorld } from "./files";
import { generateWorld, GenerationError } from "./generate";
import { composeBody, parentInfoFrom } from "./render";
import { FIXTURES, fixtureCompiled, fixtureSpec, type FixtureName } from "./testkit";
import { pieceId, type Brief, type Writer } from "./types";
import { ExampleWriter } from "./writer";

const tmp = () => mkdtempSync(join(tmpdir(), "worldgen-"));

describe.each(FIXTURES)("engine on the %s scenario", (name: FixtureName) => {
  const c = fixtureCompiled(name);

  it("generates every piece, valid and without retries", async () => {
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    expect(files).toHaveLength(c.world.pieces.length);
    expect(files.every((f) => f.attempts === 1)).toBe(true);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
  });

  it("keeps derived values out of every generated source", async () => {
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    for (const lit of c.world.forbidden) for (const f of files) expect(f.body, `${f.id} contains ${lit}`).not.toContain(lit);
  });

  it("writes the world, the scenario, the answer key and a summary, and the files check out", async () => {
    const dir = tmp();
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    writeWorld(c, files, dir, { writer: "test" });
    expect(checkDir(c.world, dir)).toEqual([]);
    expect(readSpec(join(dir, "scenario.json"))).toEqual(fixtureSpec(name));

    const key = JSON.parse(readFileSync(join(dir, "ANSWERS.json"), "utf8"));
    expect(key.items).toHaveLength(fixtureSpec(name).questions.length);
    for (const d of key.derived) expect(d.text).toBe(c.derivedText[d.id]);

    const summary = readFileSync(join(dir, "SUMMARY.md"), "utf8");
    expect(summary).toContain(`# ${fixtureSpec(name).title}`);
    for (const t of fixtureSpec(name).tiers) expect(summary).toContain(`### ${t.id}:`);
    for (const d of fixtureSpec(name).derived) expect(summary).toContain(c.derivedText[d.id]);
  });

  it("renders references in the answer key from the facts and the formulas", async () => {
    const dir = tmp();
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    writeWorld(c, files, dir, { writer: "test" });
    const key = JSON.parse(readFileSync(join(dir, "ANSWERS.json"), "utf8"));
    const withRefs = fixtureSpec(name).questions.filter((q) => q.include?.some((r) => r.startsWith("derived:") || r.startsWith("fact:")));
    expect(withRefs.length).toBeGreaterThan(0);
    for (const q of withRefs) {
      const item = key.items.find((i: { id: string }) => i.id === q.id);
      expect(item.mustInclude.some((m: string) => m.includes(":"))).toBe(false);
    }
  });

  it("releases the tiers one by one, in the order of the scenario", async () => {
    const dir = tmp();
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    writeWorld(c, files, dir, { writer: "test" });
    const targets = { email: join(dir, "inbox"), news: join(dir, "news"), doc: join(dir, "docs") };
    let total = 0;
    for (const tier of c.world.tiers) {
      const expected = c.world.pieces.filter((p) => p.tier === tier).length;
      expect(playTier(tier, dir, targets)).toHaveLength(expected);
      total += expected;
    }
    expect(total).toBe(c.world.pieces.length);
    for (const d of Object.values(targets)) if (existsSync(d)) expect(readdirSync(d).filter((n) => n.startsWith("_"))).toEqual([]);
  });
});

describe("replies", () => {
  it("quote the parent in the language of the world", async () => {
    const c = fixtureCompiled("semola");
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    const reply = files.find((f) => f.id === "msg-2026-11-18-neri-1020")!;
    expect(reply.text).toContain("> Il 10/11 Marta Ricci ha scritto:");
    expect(reply.text).toContain("> da circa 3.000 tonnellate?");
    expect(reply.text).toContain("in_reply_to: msg-2026-11-10-ricci-0915");

    const parent = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-10-ricci-0915")!;
    const replyPiece = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-18-neri-1020")!;
    const info = parentInfoFrom(parent, "Hello.");
    expect(composeBody(replyPiece, "Hi", info, "en")).toContain("> On 10/11, Marta Ricci wrote:");
    expect(composeBody(replyPiece, "Salut", info, "fr")).toContain("> Le 10/11, Marta Ricci a écrit :");
    expect(composeBody(replyPiece, "Hallo", info, "de")).toContain("> Am 10.11. schrieb Marta Ricci:");
  });

  it("puts labels and reliability in the header, never in the body", async () => {
    const c = fixtureCompiled("semola");
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    const weak = files.find((f) => f.id === "msg-2026-11-19-fabbri-1730")!;
    expect(weak.text).toMatch(/^reliability: low$/m);
    expect(weak.text).toMatch(/^labels:\n {2}- finance$/m);
    expect(weak.body).not.toMatch(/finance|reliability/i);
  });
});

describe("repair loop", () => {
  const c = fixtureCompiled("semola");

  class Flaky implements Writer {
    seen: string[][] = [];
    private readonly example = new ExampleWriter(c.world.pieces);
    private tried = new Set<string>();
    async write(b: Brief): Promise<string> {
      if (!this.tried.has(b.pieceId)) {
        this.tried.add(b.pieceId);
        return "Testo senza i fatti richiesti.";
      }
      this.seen.push(b.feedback ?? []);
      return this.example.write(b);
    }
  }

  it("retries with the failures as feedback and then succeeds", async () => {
    const w = new Flaky();
    const files = await generateWorld(c.world, { writer: w });
    expect(files.every((f) => f.attempts === 2)).toBe(true);
    expect(w.seen.every((fb) => fb.some((m) => m.startsWith("missing required fact")))).toBe(true);
  });

  it("gives up after the maximum attempts, naming the piece", async () => {
    const bad: Writer = { write: async () => "Niente di utile." };
    await expect(generateWorld(c.world, { writer: bad, maxAttempts: 2 })).rejects.toBeInstanceOf(GenerationError);
    await expect(generateWorld(c.world, { writer: bad, maxAttempts: 2 })).rejects.toThrow(/CQ-2026-031|PP-2026-Q4|WMS-PR-20261120|news-2026-10-31-report-ottobre|msg-2026-11/);
  });
});

describe("parallel generation", () => {
  it("runs pieces at the same time, never more than the limit, and a reply only after its parent", async () => {
    const c = fixtureCompiled("semola");
    const example = new ExampleWriter(c.world.pieces);
    let running = 0;
    let peak = 0;
    const events: string[] = [];
    const writer: Writer = {
      async write(b) {
        running++;
        peak = Math.max(peak, running);
        events.push(`start ${b.pieceId}`);
        await new Promise((r) => setTimeout(r, 15));
        running--;
        events.push(`end ${b.pieceId}`);
        return example.write(b);
      },
    };
    const files = await generateWorld(c.world, { writer, concurrency: 3 });
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
    expect(events.indexOf("start msg-2026-11-18-neri-1020")).toBeGreaterThan(events.indexOf("end msg-2026-11-10-ricci-0915"));

    const sequential = await generateWorld(c.world, { writer: example });
    expect(files.map((f) => f.text)).toEqual(sequential.map((f) => f.text));
  });

  it("stops and reports the first failure", async () => {
    const c = fixtureCompiled("semola");
    const bad: Writer = { write: async () => "Niente di utile." };
    await expect(generateWorld(c.world, { writer: bad, concurrency: 4, maxAttempts: 1 })).rejects.toBeInstanceOf(GenerationError);
  });
});

describe("files on disk", () => {
  it("detects a tampered file, a stray file and a missing file", async () => {
    const c = fixtureCompiled("semola");
    const dir = tmp();
    writeWorld(c, await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) }), dir, { writer: "test" });

    const offer = join(dir, "t0/emails/20261118-1020-offerta-mulino-alta-murgia.md");
    writeFileSync(offer, readFileSync(offer, "utf8").replace("470 €/t", "480 €/t"));
    writeFileSync(join(dir, "t0/docs/20260101-estraneo.md"), "---\ndoc_id: X-1\ndoc_type: other\ntitle: X\ndate: 2026-01-01\n---\nTesto.\n");
    writeFileSync(join(dir, "t0/news/20261031-report-cereali-ottobre.md"), "non è un file valido");

    const errs = checkDir(c.world, dir).join("\n");
    expect(errs).toMatch(/missing required fact: "470 €\/t"/);
    expect(errs).toMatch(/X-1 is not in the scenario/);
    expect(errs).toMatch(/missing file for news news-2026-10-31-report-ottobre/);
  });

  it("only cleans the tier folders when it rewrites a world", async () => {
    const c = fixtureCompiled("semola");
    const dir = tmp();
    const files = await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) });
    writeWorld(c, files, dir, { writer: "test" });
    writeFileSync(join(dir, "keep.txt"), "x");
    writeFileSync(join(dir, "t0/docs/old.md"), "old");
    writeWorld(c, files, dir, { writer: "test" });
    expect(existsSync(join(dir, "keep.txt"))).toBe(true);
    expect(existsSync(join(dir, "t0/docs/old.md"))).toBe(false);
  });
});
