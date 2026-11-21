/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrompt, cleanOutput, LlmWriter, writerSystem } from "./ai-writer";
import { checkDir, writeWorld } from "./files";
import { generateWorld } from "./generate";
import { lintSpec } from "./lint";
import { ClaudeCliLlm, realExec, recordingKey, RecordingLlm, RecordingStore, type Exec, type ExecArgs, type Llm } from "./llm";
import { buildPlannerPrompt, extractJson, planScenario, PlanError } from "./planner";
import { compile } from "./compile";
import { clone, fakeWriterLlm, fixtureCompiled, fixtureJson, fixtureSpec } from "./testkit";
import type { Brief } from "./types";

const tmp = () => mkdtempSync(join(tmpdir(), "worldgen-ai-"));

const brief = (over: Partial<Brief> = {}): Brief => ({
  pieceId: "msg-1",
  kind: "email",
  context: { message_id: "msg-1", from: "Anna <anna@x.example>", to: ["marco@x.example"], subject: "Offerta" },
  brief: "Anna offre 100 tonnellate a 5 €/t.",
  mustContain: ["100 tonnellate", "5 €/t"],
  example: "Buongiorno, vi offriamo 100 tonnellate a 5 €/t.",
  style: { company: "Xco S.p.A.", description: "un'azienda di prova", language: "it" },
  ...over,
});

describe("piece prompt", () => {
  it("includes the facts, the context, the brief, the example and the company", () => {
    const { system, user } = buildPrompt(brief());
    expect(user).toContain("- 100 tonnellate");
    expect(user).toContain("- subject: Offerta");
    expect(user).toContain("Anna offre 100 tonnellate");
    expect(user).toContain("Buongiorno, vi offriamo");
    expect(system).toMatch(/Non aggiungere altri numeri/);
    expect(system).toContain("«Xco S.p.A.»");
    expect(system).toContain("italiano");
  });
  it("follows the language of the world", () => {
    expect(writerSystem({ company: "Halden", description: "a maker", language: "en" })).toContain("inglese");
  });
  it("plays the author with a persona and only what they know", () => {
    const { user } = buildPrompt(brief({ author: { name: "Giulia Neri", role: "Commerciale", persona: "Cortese e formale.", knows: ["3.000 tonnellate", "dicembre"] } }));
    expect(user).toContain("Scrivi come Giulia Neri (Commerciale). Il tuo modo di scrivere: Cortese e formale.");
    expect(user).toContain("Ciò che sai (dalle tue conversazioni e documenti): 3.000 tonnellate; dicembre");
    expect(user).toContain("Non attribuirti conoscenze che non hai");
  });
  it("shows the message a reply answers", () => {
    const { user } = buildPrompt(brief({ parent: { from: "Marta Ricci", date: "2026-11-10T09:15:00+01:00", text: "Potete indicarci il prezzo?" } }));
    expect(user).toContain("Stai rispondendo a questo messaggio (da Marta Ricci, 2026-11-10)");
    expect(user).toContain("Potete indicarci il prezzo?");
  });
  it("leaves the example out when there is none, and adds failures on a repair attempt", () => {
    const { user } = buildPrompt(brief({ example: undefined, feedback: ['missing required fact: "5 €/t"'] }));
    expect(user).not.toContain("Esempio del registro");
    expect(user).toContain("scartato per questi motivi");
    expect(user).toContain('missing required fact: "5 €/t"');
  });
  it("is pure: the same brief gives the same prompt", () => {
    expect(buildPrompt(brief())).toEqual(buildPrompt(brief()));
  });
  it("never shows labels or reliability to the writer", async () => {
    const c = fixtureCompiled("semola");
    const { llm, calls } = fakeWriterLlm(c);
    await generateWorld(c.world, { writer: new LlmWriter(llm) });
    expect(calls).toHaveLength(c.world.pieces.length);
    for (const call of calls) expect(call.user).not.toMatch(/^- (labels|reliability):/m);
  });
  it("hands each piece's author to the writer", async () => {
    const c = fixtureCompiled("semola");
    const { llm, calls } = fakeWriterLlm(c);
    await generateWorld(c.world, { writer: new LlmWriter(llm) });
    expect(calls.find((x) => x.tag === "msg-2026-11-19-fabbri-1730")!.user).toContain("Scrivi come Roberto Fabbri (Commerciale)");
    expect(calls.find((x) => x.tag === "msg-2026-11-18-neri-1020")!.user).toContain("Stai rispondendo a questo messaggio (da Marta Ricci");
  });
});

describe("cleanOutput", () => {
  it("strips a wrapping code fence and surrounding whitespace", () => {
    expect(cleanOutput("```\nCiao\n```\n")).toBe("Ciao");
    expect(cleanOutput("```markdown\n## Art. 1\nTesto\n```")).toBe("## Art. 1\nTesto");
    expect(cleanOutput("  Ciao  \n")).toBe("Ciao");
  });
});

describe("Claude CLI", () => {
  it("calls the CLI in print mode with no tools, no session, a system prompt, and the prompt on stdin", async () => {
    const calls: ExecArgs[] = [];
    const exec: Exec = async (a) => (calls.push(a), { status: 0, stdout: "Testo", stderr: "" });
    const text = await new ClaudeCliLlm({ bin: "claude-x", model: "sonnet", exec }).complete({ system: "SYS", user: "USER", tag: "t" });
    expect(text).toBe("Testo");
    const c = calls[0];
    expect(c.bin).toBe("claude-x");
    expect(c.args).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--strict-mcp-config", "--model", "sonnet"]));
    expect(c.args[c.args.indexOf("--tools") + 1]).toBe("");
    expect(c.args[c.args.indexOf("--system-prompt") + 1]).toBe("SYS");
    expect(c.input).toBe("USER");
    expect(c.cwd).toBe(tmpdir());
  });
  it("accepts a synchronous executor too", async () => {
    const exec: Exec = () => ({ status: 0, stdout: "ok", stderr: "" });
    expect(await new ClaudeCliLlm({ exec }).complete({ system: "s", user: "u", tag: "t" })).toBe("ok");
  });
  it("fails with the CLI's message, on stderr or stdout, and on an empty answer", async () => {
    await expect(new ClaudeCliLlm({ exec: () => ({ status: 1, stdout: "", stderr: "not logged in" }) }).complete({ system: "", user: "", tag: "p1" })).rejects.toThrow(/p1 \(exit 1\): not logged in/);
    await expect(new ClaudeCliLlm({ exec: () => ({ status: 1, stdout: "Failed to authenticate", stderr: "" }) }).complete({ system: "", user: "", tag: "p2" })).rejects.toThrow(/Failed to authenticate/);
    await expect(new ClaudeCliLlm({ exec: () => ({ status: 0, stdout: " \n", stderr: "" }) }).complete({ system: "", user: "", tag: "p3" })).rejects.toThrow(/empty answer/);
  });
  it("really runs a process asynchronously: stdin in, stdout out, and a timeout that kills it", async () => {
    const echo = await realExec({ bin: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"], input: "ciao", cwd: tmpdir(), timeoutMs: 10_000 });
    expect(echo).toMatchObject({ status: 0, stdout: "ciao" });
    const slow = await realExec({ bin: process.execPath, args: ["-e", "setTimeout(() => {}, 10000)"], input: "", cwd: tmpdir(), timeoutMs: 200 });
    expect(slow.status).toBeNull();
    expect(slow.stderr).toMatch(/timed out/);
    const missing = await realExec({ bin: "definitely-not-a-command-xyz", args: [], input: "", cwd: tmpdir(), timeoutMs: 2000 });
    expect(missing.status).toBeNull();
  });
});

describe("recordings", () => {
  const req = { system: "SYS", user: "USER", tag: "t" };
  const counting = () => {
    const w = { n: 0, complete: async () => `risposta ${++w.n}` };
    return w;
  };

  it("keys depend on the whole prompt, system included, and on the model", () => {
    const k = recordingKey(req, "sonnet");
    expect(recordingKey({ ...req }, "sonnet")).toBe(k);
    expect(recordingKey({ ...req, user: "OTHER" }, "sonnet")).not.toBe(k);
    expect(recordingKey({ ...req, system: "OTHER" }, "sonnet")).not.toBe(k);
    expect(recordingKey(req, "opus")).not.toBe(k);
  });
  it("a changed company name or language gives another key: an old answer is never replayed", () => {
    const a = buildPrompt(brief());
    const b = buildPrompt(brief({ style: { company: "Altra S.p.A.", description: "un'azienda di prova", language: "it" } }));
    const c = buildPrompt(brief({ style: { company: "Xco S.p.A.", description: "un'azienda di prova", language: "en" } }));
    expect(recordingKey(a, "m")).not.toBe(recordingKey(b, "m"));
    expect(recordingKey(a, "m")).not.toBe(recordingKey(c, "m"));
  });
  it("replay fails clearly when nothing was recorded", async () => {
    const w = new RecordingLlm(null, new RecordingStore(tmp()), "sonnet", "replay");
    await expect(w.complete(req)).rejects.toThrow(/no recording for t.*--writer auto/);
  });
  it("auto records once and then replays without calling the model", async () => {
    const inner = counting();
    const store = new RecordingStore(tmp());
    const w = new RecordingLlm(inner, store, "sonnet", "auto");
    expect(await w.complete(req)).toBe("risposta 1");
    expect(await w.complete(req)).toBe("risposta 1");
    expect(inner.n).toBe(1);
    expect(store.get(recordingKey(req, "sonnet"))).toMatchObject({ tag: "t", text: "risposta 1", model: "sonnet" });
  });
  it("record always calls the model and overwrites", async () => {
    const inner = counting();
    const store = new RecordingStore(tmp());
    const w = new RecordingLlm(inner, store, "sonnet", "record");
    await w.complete(req);
    expect(await w.complete(req)).toBe("risposta 2");
    expect(store.get(recordingKey(req, "sonnet"))?.text).toBe("risposta 2");
  });
  it("prunes the recordings a run did not use", async () => {
    const inner = counting();
    const store = new RecordingStore(tmp());
    await new RecordingLlm(inner, store, "sonnet", "auto").complete({ ...req, user: "vecchio" });
    const w = new RecordingLlm(inner, store, "sonnet", "auto");
    await w.complete({ ...req, user: "nuovo" });
    expect(store.keys()).toHaveLength(2);
    expect(store.prune(w.used)).toHaveLength(1);
    expect(store.keys()).toEqual([recordingKey({ ...req, user: "nuovo" }, "sonnet")]);
  });
});

describe("planner", () => {
  const good = () => JSON.stringify(fixtureJson("supplier-delay"));
  const scripted = (answers: string[]) => {
    const prompts: { system: string; user: string }[] = [];
    const llm: Llm = {
      async complete(r) {
        prompts.push({ system: r.system, user: r.user });
        return answers[Math.min(prompts.length - 1, answers.length - 1)];
      },
    };
    return { llm, prompts };
  };

  it("extracts the JSON from a fence or a stray sentence", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Ecco lo scenario:\n{"a":{"b":2}}\nSpero vada bene.')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("niente json")).toThrow(/no JSON object/);
  });

  it("asks for the scenario, the language and the company, and shows a valid example", () => {
    const { system, user } = buildPlannerPrompt({ text: "Un fornitore ritarda.", language: "en", company: "Acme Ltd", slug: "ritardo" });
    expect(system).toMatch(/SOLO con il JSON/);
    expect(user).toContain("Un fornitore ritarda.");
    expect(user).toContain('Lingua dei materiali: inglese (language: "en")');
    expect(user).toContain("Nome dell'azienda: Acme Ltd.");
    expect(user).toContain('slug: "ritardo"');
    expect(user).toMatch(/COPERTURA/);
    expect(user).toContain('"slug": "semola-rincaro"'); // the example is in another language than the request
  });
  it("shows an example in another language than the requested one", () => {
    expect(buildPlannerPrompt({ text: "x", language: "it" }).user).toContain('"slug": "supplier-delay"');
    expect(buildPlannerPrompt({ text: "x", language: "fr" }).user).toContain('"slug": "supplier-delay"');
    expect(buildPlannerPrompt({ text: "x", language: "en" }).user).toContain('"slug": "semola-rincaro"');
  });

  it("returns a spec that passes the schema and the lint, at the first attempt", async () => {
    const { llm, prompts } = scripted([good()]);
    const r = await planScenario({ text: "Un fornitore ritarda.", llm });
    expect(r.attempts).toBe(1);
    expect(r.spec.slug).toBe("supplier-delay");
    expect(lintSpec(r.spec)).toEqual([]);
    expect(prompts).toHaveLength(1);
  });

  it("sends the failures back with its previous answer until the spec is valid", async () => {
    const broken = clone(fixtureJson("supplier-delay")) as Record<string, any>;
    broken.pieces[0].facts.push("nope");
    const { llm, prompts } = scripted(["questo non è json", JSON.stringify(broken), good()]);
    const seen: string[][] = [];
    const r = await planScenario({ text: "x", llm, onAttempt: (_n, e) => seen.push(e) });
    expect(r.attempts).toBe(3);
    expect(seen[0][0]).toMatch(/not valid JSON/);
    expect(seen[1].join()).toMatch(/unknown fact "nope"/);
    expect(seen[2]).toEqual([]);
    expect(prompts[1].user).toContain("LA TUA RISPOSTA PRECEDENTE");
    expect(prompts[1].user).toContain("questo non è json");
    expect(prompts[2].user).toContain('unknown fact "nope"');
  });

  it("gives up after the maximum attempts with the last problems", async () => {
    const { llm } = scripted(["{}"]);
    await expect(planScenario({ text: "x", llm, maxAttempts: 2 })).rejects.toBeInstanceOf(PlanError);
    await expect(planScenario({ text: "x", llm, maxAttempts: 2 })).rejects.toThrow(/could not produce a valid scenario/);
  });

  it("enforces the demo profile on what the model returns", async () => {
    const noWeakSource = clone(fixtureJson("supplier-delay")) as Record<string, any>;
    noWeakSource.pieces.forEach((p: any) => p.header.reliability === "low" && (p.header.reliability = "high"));
    const { llm } = scripted([JSON.stringify(noWeakSource)]);
    await expect(planScenario({ text: "x", llm, maxAttempts: 1 })).rejects.toThrow(/reliability low/);
    expect((await planScenario({ text: "x", llm, maxAttempts: 1, profile: "none" })).attempts).toBe(1);
  });
});

describe("make, end to end, with a fake model", () => {
  it("plans, writes, checks, and then replays the same world without any model", async () => {
    const scenario = fixtureSpec("semola");
    const planner: Llm = { complete: async () => JSON.stringify(fixtureJson("semola")) };
    const { spec } = await planScenario({ text: "Il prezzo della semola sale.", llm: planner });
    expect(spec).toEqual(scenario);

    const c = compile(spec);
    const store = new RecordingStore(tmp());
    const { llm, calls } = fakeWriterLlm(c, { failFirstFor: "msg-2026-11-19-fabbri-1730" });

    const first = await generateWorld(c.world, { writer: new LlmWriter(new RecordingLlm(llm, store, "sonnet", "auto")), concurrency: 3 });
    const dir = tmp();
    writeWorld(c, first, dir, { writer: "test" });
    expect(checkDir(c.world, dir)).toEqual([]);
    const weak = first.find((f) => f.id === "msg-2026-11-19-fabbri-1730")!;
    expect(weak.attempts).toBe(2);
    expect(calls).toHaveLength(c.world.pieces.length + 1);

    const replayed = await generateWorld(c.world, { writer: new LlmWriter(new RecordingLlm(null, store, "sonnet", "replay")), concurrency: 3 });
    expect(replayed.map((f) => f.text)).toEqual(first.map((f) => f.text));
    expect(calls).toHaveLength(c.world.pieces.length + 1);
  });
});
