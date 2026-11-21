import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import type { Llm, LlmRequest, LlmResponse } from "./types";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
/** Runs the claude binary. Injectable so tests never spawn a process. */
export type Runner = (args: string[], stdin: string, opts: { cwd: string; timeoutMs: number }) => Promise<RunResult>;

const spawnRunner: Runner = (args, stdin, { cwd, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.BRAIN_CLAUDE_BIN ?? "claude", args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude CLI timed out after ${timeoutMs} ms`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
    child.stdin.end(stdin);
  });

/** The arguments for one stateless, tool-less call. The prompt goes in on stdin. */
export function cliArgs(req: LlmRequest): string[] {
  return [
    "-p",
    "--output-format", "json",
    "--model", req.model,
    "--tools", "",
    "--no-session-persistence",
    "--setting-sources", "",
    "--strict-mcp-config",
    "--system-prompt", req.system,
    ...(req.schema ? ["--json-schema", JSON.stringify(req.schema)] : []),
  ];
}

/**
 * LLM backed by the `claude` CLI (the user's own login). Runs from the OS temp
 * directory so no project context is loaded, with no tools and no session.
 */
export function claudeCli(opts: { run?: Runner; timeoutMs?: number } = {}): Llm {
  const run = opts.run ?? spawnRunner;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  return async (req): Promise<LlmResponse> => {
    const r = await run(cliArgs(req), req.prompt, { cwd: tmpdir(), timeoutMs });
    let j: Record<string, unknown>;
    try {
      j = JSON.parse(r.stdout);
    } catch {
      throw new Error(`claude CLI exited ${r.code} without JSON output: ${(r.stderr || r.stdout).slice(0, 300)}`);
    }
    if (r.code !== 0 || j.is_error) throw new Error(`claude CLI error: ${String(j.result ?? r.stderr).slice(0, 300)}`);
    return {
      text: typeof j.result === "string" ? j.result : "",
      structured: j.structured_output,
      cost_usd: typeof j.total_cost_usd === "number" ? j.total_cost_usd : undefined,
      duration_ms: typeof j.duration_ms === "number" ? j.duration_ms : undefined,
    };
  };
}
