import { z } from "zod";

export const SourceBody = z.object({
  kind: z.enum(["email", "chat", "task", "doc"]),
  external_id: z.string().min(1),
  author: z.string().nullish(),
  thread_id: z.string().nullish(),
  occurred_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO timestamp"),
  raw: z.string().min(1),
});

export const ClaimBody = z.object({
  predicate_id: z.string().min(1),
  fields: z.record(z.string(), z.unknown()),
  evidence: z.array(z.object({ source_id: z.string(), quote: z.string() })),
  extractor: z.record(z.string(), z.unknown()).optional(),
});

export const ReviewBody = z.object({
  type: z.enum(["approved", "rejected", "retracted"]),
  actor: z.string().default("human:reviewer"),
  reason: z.string().optional(),
});
