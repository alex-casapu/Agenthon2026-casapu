"use server";

import { releaseStageEvent, type ReleaseResult } from "@/lib/stage";

/** Release one stage event into the source folders. Off in production unless BRAIN_STAGE=on. */
export async function releaseEvent(id: string): Promise<ReleaseResult> {
  if (process.env.NODE_ENV === "production" && process.env.BRAIN_STAGE !== "on") return { ok: false, error: "stage is off" };
  return releaseStageEvent(id);
}
