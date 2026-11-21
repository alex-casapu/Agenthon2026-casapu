import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A model that turns a prompt into text. The planner and the piece writer both use it. */
export interface LlmRequest {
  system: string;
  user: string;
  /** Label for logs and recordings, e.g. the piece id or "planner". */
  tag: string;
  timeoutMs?: number;
}
export interface Llm {
  complete(req: LlmRequest): Promise<string>;
}

// ───────────── Claude CLI ─────────────

export interface ExecArgs {
  bin: string;
  args: string[];
  input: string;
  cwd: string;
  timeoutMs: number;
}
export interface ExecResult {
  status: number | null;
  stdout: string;
  stderr: string;
}
export type Exec = (a: ExecArgs) => ExecResult | Promise<ExecResult>;

/** Runs a command asynchronously, so several model calls can be in flight at once. */
export const realExec: Exec = ({ bin, args, input, cwd, timeoutMs }) =>
  new Promise<ExecResult>((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    const finish = (r: ExecResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const child = spawn(bin, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ status: null, stdout: out, stderr: `${err}\ntimed out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => finish({ status: null, stdout: out, stderr: String(e) }));
    child.on("close", (code) => finish({ status: code, stdout: out, stderr: err }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });

export interface ClaudeCliOptions {
  /** Executable. Default `claude`, or WORLDGEN_CLAUDE_BIN. */
  bin?: string;
  /** Model alias or name. Default: the CLI's default. */
  model?: string;
  timeoutMs?: number;
  exec?: Exec;
}

/**
 * The `claude` command line in print mode: no tools, no MCP servers, no saved session.
 * It runs from a temporary folder so no project instructions leak into the prompt.
 */
export class ClaudeCliLlm implements Llm {
  private readonly bin: string;
  private readonly model?: string;
  private readonly timeoutMs: number;
  private readonly exec: Exec;
  constructor(opts: ClaudeCliOptions = {}) {
    this.bin = opts.bin ?? process.env.WORLDGEN_CLAUDE_BIN ?? "claude";
    this.model = opts.model;
    this.timeoutMs = opts.timeoutMs ?? 240_000;
    this.exec = opts.exec ?? realExec;
  }
  async complete(req: LlmRequest): Promise<string> {
    const args = ["-p", "--output-format", "text", "--no-session-persistence", "--tools", "", "--strict-mcp-config", "--system-prompt", req.system];
    if (this.model) args.push("--model", this.model);
    const r = await this.exec({ bin: this.bin, args, input: req.user, cwd: tmpdir(), timeoutMs: req.timeoutMs ?? this.timeoutMs });
    if (r.status !== 0) {
      // The CLI prints some errors (e.g. authentication) on stdout.
      const detail = (r.stderr.trim() || r.stdout.trim()).slice(0, 500);
      throw new Error(`claude CLI failed for ${req.tag} (exit ${r.status}): ${detail}`);
    }
    if (!r.stdout.trim()) throw new Error(`claude CLI returned an empty answer for ${req.tag}`);
    return r.stdout;
  }
}

// ───────────── record / replay ─────────────

export interface Recording {
  key: string;
  model: string;
  tag: string;
  text: string;
  recordedAt: string;
}

/** The key is the hash of the whole prompt and the model: a changed prompt can never replay an old answer. */
export function recordingKey(req: Pick<LlmRequest, "system" | "user">, model: string): string {
  return createHash("sha256").update(JSON.stringify({ model, system: req.system, user: req.user })).digest("hex").slice(0, 16);
}

/** One JSON file per recording, so they diff and review well in git. */
export class RecordingStore {
  constructor(private readonly dir: string) {}
  private file(key: string) {
    return join(this.dir, `${key}.json`);
  }
  get(key: string): Recording | undefined {
    const f = this.file(key);
    return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Recording) : undefined;
  }
  put(rec: Recording): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(rec.key), JSON.stringify(rec, null, 2) + "\n");
  }
  keys(): string[] {
    return existsSync(this.dir) ? readdirSync(this.dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
  }
  /** Deletes every recording whose key is not in `keep`. Returns the deleted keys. */
  prune(keep: Set<string>): string[] {
    const gone = this.keys().filter((k) => !keep.has(k));
    for (const k of gone) rmSync(this.file(k));
    return gone;
  }
}

/**
 * - `replay`: only reads recordings; a missing one is an error (strict, reproducible, no model needed).
 * - `auto`: reads a recording if there is one, otherwise calls the model and records the answer.
 * - `record`: always calls the model and records the answer.
 */
export type RecordMode = "replay" | "auto" | "record";

export class RecordingLlm implements Llm {
  /** Keys used (read or written) by this instance: what a pruning run keeps. */
  readonly used = new Set<string>();
  constructor(
    private readonly inner: Llm | null,
    private readonly store: RecordingStore,
    private readonly model: string,
    private readonly mode: RecordMode,
  ) {}
  async complete(req: LlmRequest): Promise<string> {
    const key = recordingKey(req, this.model);
    this.used.add(key);
    if (this.mode !== "record") {
      const hit = this.store.get(key);
      if (hit) return hit.text;
      if (this.mode === "replay" || !this.inner) {
        throw new Error(`no recording for ${req.tag} (key ${key}, model ${this.model}). Run with --writer auto to record it. (A replay needs the same prompt: same scenario text, --lang, --company, --slug and --model as the original run.)`);
      }
    }
    if (!this.inner) throw new Error("record mode needs a model");
    const text = await this.inner.complete(req);
    this.store.put({ key, model: this.model, tag: req.tag, text, recordedAt: new Date().toISOString() });
    return text;
  }
}
