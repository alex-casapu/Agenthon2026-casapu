import type { Llm, LlmRequest, LlmResponse } from "../llm";

export type Scripted = LlmResponse | Error | ((req: LlmRequest, call: number) => LlmResponse | Promise<LlmResponse>);

/** A scripted LLM for tests: replies in order (the last reply repeats) and records every request. */
export function scriptedLlm(script: Scripted[]): { llm: Llm; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const llm: Llm = async (req) => {
    const step = script[Math.min(calls.length, script.length - 1)];
    calls.push(req);
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(req, calls.length - 1) : step;
  };
  return { llm, calls };
}

/** A structured-output reply carrying these claims. */
export const reply = (claims: unknown[]): LlmResponse => ({ text: JSON.stringify({ claims }), structured: { claims }, cost_usd: 0.01, duration_ms: 5 });
