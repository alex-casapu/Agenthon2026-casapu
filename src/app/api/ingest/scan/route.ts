import { inboxDir, scanInbox } from "@/lib/ingest/inbox";
import { getDb } from "@/lib/store";

/** Ingest anything new in the inbox right now (the watcher does this automatically). */
export async function POST() {
  const { outcomes, pending } = scanInbox(getDb(), inboxDir());
  return Response.json({ outcomes, pending });
}
