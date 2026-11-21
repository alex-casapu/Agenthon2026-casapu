import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STAGE_EVENTS, releaseStageEvent } from "./stage";

describe("stage events", () => {
  let dir: string;
  const saved = { i: process.env.BRAIN_INBOX, n: process.env.BRAIN_NEWS };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "stage-"));
    process.env.BRAIN_INBOX = join(dir, "inbox");
    process.env.BRAIN_NEWS = join(dir, "news");
  });
  afterEach(() => {
    process.env.BRAIN_INBOX = saved.i; process.env.BRAIN_NEWS = saved.n;
    if (saved.i === undefined) delete process.env.BRAIN_INBOX;
    if (saved.n === undefined) delete process.env.BRAIN_NEWS;
    rmSync(dir, { recursive: true, force: true });
  });

  it("every event points at a real example file", () => {
    for (const e of STAGE_EVENTS) expect(existsSync(join(process.cwd(), e.file)), e.id).toBe(true);
  });
  it("drops the file in its folder, atomically, and says so the second time", () => {
    const r = releaseStageEvent("alert");
    expect(r).toEqual({ ok: true, file: "20261119-1730-voce-fiera.md" });
    expect(readdirSync(join(dir, "inbox"))).toEqual(["20261119-1730-voce-fiera.md"]); // no leftover _tmp
    expect(readFileSync(join(dir, "inbox", r.file!), "utf8")).toMatch(/reliability: low/);
    expect(releaseStageEvent("alert")).toEqual({ ok: true, file: "20261119-1730-voce-fiera.md", already: true });
  });
  it("news events go to the news folder; unknown ids are refused", () => {
    expect(releaseStageEvent("report").ok).toBe(true);
    expect(readdirSync(join(dir, "news"))).toEqual(["20261121-semola-502.md"]);
    expect(releaseStageEvent("nope").ok).toBe(false);
  });
});
