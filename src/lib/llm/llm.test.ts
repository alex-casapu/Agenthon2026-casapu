import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cacheKey, cached, claudeCli, cliArgs, defaultLlm, llmMode, llmModel, LlmCacheMiss, type Llm, type LlmRequest, type Runner } from ".";

const req: LlmRequest = { model: "sonnet", system: "SYS", prompt: "hello", schema: { type: "object" } };
const ok = (over: Record<string, unknown> = {}) => JSON.stringify({ result: "text", structured_output: { a: 1 }, total_cost_usd: 0.02, duration_ms: 1200, is_error: false, ...over });

describe("claudeCli", () => {
  it("builds a stateless, tool-less call and sends the prompt on stdin", async () => {
    let seen: { args: string[]; stdin: string; cwd: string } | undefined;
    const run: Runner = async (args, stdin, o) => ((seen = { args, stdin, cwd: o.cwd }), { stdout: ok(), stderr: "", code: 0 });
    const res = await claudeCli({ run })(req);
    expect(seen!.stdin).toBe("hello");
    expect(seen!.cwd).toBe(tmpdir());
    const a = seen!.args;
    expect(a).toEqual(expect.arrayContaining(["-p", "--no-session-persistence", "--strict-mcp-config"]));
    expect(a[a.indexOf("--model") + 1]).toBe("sonnet");
    expect(a[a.indexOf("--tools") + 1]).toBe("");
    expect(a[a.indexOf("--setting-sources") + 1]).toBe("");
    expect(a[a.indexOf("--system-prompt") + 1]).toBe("SYS");
    expect(JSON.parse(a[a.indexOf("--json-schema") + 1])).toEqual({ type: "object" });
    expect(res).toEqual({ text: "text", structured: { a: 1 }, cost_usd: 0.02, duration_ms: 1200 });
  });

  it("omits the schema flag when there is no schema", () => {
    expect(cliArgs({ ...req, schema: undefined })).not.toContain("--json-schema");
  });

  it("turns failures into errors", async () => {
    const fail = (stdout: string, code = 0, stderr = "") => claudeCli({ run: async () => ({ stdout, stderr, code }) })(req);
    await expect(fail(ok({ is_error: true, result: "overloaded" }))).rejects.toThrow(/overloaded/);
    await expect(fail(ok(), 1)).rejects.toThrow(/claude CLI error/);
    await expect(fail("not json", 2, "boom")).rejects.toThrow(/without JSON output: boom/);
  });
});

describe("cached", () => {
  const counting = (): { llm: Llm; n: () => number } => {
    let n = 0;
    return { llm: async () => ({ text: `answer ${++n}` }), n: () => n };
  };
  const dir = () => mkdtempSync(join(tmpdir(), "llm-"));

  it("auto: records on a miss and replays on a hit", async () => {
    const d = dir();
    const { llm, n } = counting();
    const c = cached(llm, { dir: d });
    expect((await c(req)).text).toBe("answer 1");
    expect((await c(req)).text).toBe("answer 1");
    expect(n()).toBe(1);
    expect(readdirSync(d)).toEqual([`${cacheKey(req)}.json`]);
    // a fresh wrapper over the same directory still replays (survives restarts)
    expect((await cached(counting().llm, { dir: d })(req)).text).toBe("answer 1");
  });

  it("live: always calls, and updates the recording", async () => {
    const d = dir();
    const { llm, n } = counting();
    const c = cached(llm, { dir: d, mode: "live" });
    await c(req);
    expect((await c(req)).text).toBe("answer 2");
    expect(n()).toBe(2);
    expect((await cached(counting().llm, { dir: d, mode: "replay" })(req)).text).toBe("answer 2");
  });

  it("replay: serves recordings and refuses to call out", async () => {
    const d = dir();
    const { llm, n } = counting();
    await cached(llm, { dir: d })(req);
    const replay = cached(llm, { dir: d, mode: "replay" });
    expect((await replay(req)).text).toBe("answer 1");
    await expect(replay({ ...req, prompt: "other" })).rejects.toThrow(LlmCacheMiss);
    expect(n()).toBe(1);
  });

  it("keys on every part of the request", () => {
    const k = cacheKey(req);
    expect(cacheKey({ ...req })).toBe(k);
    for (const other of [{ model: "haiku" }, { system: "x" }, { prompt: "x" }, { schema: { type: "array" } }, { schema: undefined }])
      expect(cacheKey({ ...req, ...other })).not.toBe(k);
  });
});

describe("environment", () => {
  const saved = { m: process.env.BRAIN_LLM_MODE, l: process.env.BRAIN_LLM_MODEL };
  afterEach(() => {
    if (saved.m === undefined) delete process.env.BRAIN_LLM_MODE; else process.env.BRAIN_LLM_MODE = saved.m;
    if (saved.l === undefined) delete process.env.BRAIN_LLM_MODEL; else process.env.BRAIN_LLM_MODEL = saved.l;
  });
  it("reads the mode and model", async () => {
    delete process.env.BRAIN_LLM_MODE;
    delete process.env.BRAIN_LLM_MODEL;
    expect(llmMode()).toBe("auto");
    expect(llmModel()).toBe("sonnet");
    process.env.BRAIN_LLM_MODE = "replay";
    process.env.BRAIN_LLM_MODEL = "haiku";
    expect(llmMode()).toBe("replay");
    expect(llmModel()).toBe("haiku");
    process.env.BRAIN_LLM_MODE = "garbage";
    expect(llmMode()).toBe("auto");
    // the default LLM in replay mode never reaches the CLI
    process.env.BRAIN_LLM_MODE = "replay";
    process.env.BRAIN_LLM_CACHE = mkdtempSync(join(tmpdir(), "llm-empty-"));
    await expect(defaultLlm()(req)).rejects.toThrow(LlmCacheMiss);
    delete process.env.BRAIN_LLM_CACHE;
  });
});
