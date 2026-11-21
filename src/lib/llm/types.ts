export interface LlmRequest {
  model: string;
  system: string;
  prompt: string;
  /** JSON Schema the response must satisfy (enforced by the CLI). */
  schema?: Record<string, unknown>;
}

export interface LlmResponse {
  /** The model's text result. */
  text: string;
  /** Parsed structured output when a schema was given. */
  structured?: unknown;
  cost_usd?: number;
  duration_ms?: number;
}

/** Anything that can answer a request. The extractor only knows this type. */
export type Llm = (req: LlmRequest) => Promise<LlmResponse>;
