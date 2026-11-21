import { connection } from "next/server";
import { listClaimViews, type EvidenceView } from "@/lib/claims-view";
import { principalFromRequest } from "@/lib/api-principal";
import { getPrincipals } from "@/lib/policy-config";
import { listNotices, noticeState } from "@/lib/proactive";
import { getDb } from "@/lib/store";

/** What the memory has told this person on its own, newest first, with the sources behind each statement. */
export async function GET(req: Request) {
  await connection();
  const principal = principalFromRequest(req);
  if (!principal) return Response.json({ error: "Choose who you are first." }, { status: 403 });
  const db = getDb();
  const byId = new Map(listClaimViews(db).map((c) => [c.claim_id, c]));
  const nameOf = (actor: string) => getPrincipals().find((p) => `human:${p.id}` === actor)?.name ?? actor.replace(/^policy:|^human:|^agent:/, "");

  const notices = listNotices(db, principal.id).map((n) => {
    // numbered by first use, like a chat answer
    const order: string[] = [];
    const st = noticeState(n, byId);
    const segments = (n.segments ?? []).map((s, i) => ({
      text: s.text,
      withdrawn: st.segment_withdrawn[i],
      cites: s.cites.map((id) => {
        if (!order.includes(id)) order.push(id);
        return order.indexOf(id) + 1;
      }),
    }));
    const citations = order.flatMap((id, i) => {
      const c = byId.get(id);
      return c ? [{ n: i + 1, claim_id: id, sentence: c.sentence, labels: c.labels, status: c.status, valid_to: c.valid_to, evidence: c.evidence as EvidenceView[] }] : [];
    });
    // a notice dismissed before a claim behind it was withdrawn comes back: that is news too
    const seen = n.seen && !(st.changed_at && n.seen_at && st.changed_at > n.seen_at);
    return {
      notice_id: n.notice_id,
      topic: n.topic,
      urgency: n.urgency,
      created_at: n.created_at,
      seen,
      state: st.state,
      withdrawn: st.withdrawn.map((w) => ({ ...w, by: nameOf(w.by) })),
      segments,
      citations,
    };
  });
  return Response.json({ notices, unseen: notices.filter((n) => !n.seen).length });
}
