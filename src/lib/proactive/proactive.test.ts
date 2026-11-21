import { beforeEach, describe, expect, it } from "vitest";
import { scriptedLlm } from "../extract/fake-llm";
import type { LlmResponse } from "../llm";
import { getPrincipal } from "../policy-config";
import { listClaimViews } from "../claims-view";
import { insertSource, reviewClaim, submitClaim, verify, type DB } from "../store";
import { memDb } from "../testkit";
import { considerClaims, isParticipant, listDecisions, listNotices, markSeen, noticeState } from ".";

const marta = getPrincipal("marta")!;
const luca = getPrincipal("luca")!;
const sara = getPrincipal("sara")!;

const TEXT = "Il prezzo spot della semola è salito a 502 €/t, +18% in tre settimane.";
const reply = (o: Record<string, unknown>): LlmResponse => ({ text: JSON.stringify(o), structured: o });
const opts = (llm: ReturnType<typeof scriptedLlm>["llm"], principals = [marta, luca, sara]) => ({ llm, model: "test", principals });
const cites = (prompt: string, tag: string) => new RegExp(`\\[(${tag}\\d+)\\]`).exec(prompt)![1];

/** An email from Anna to Marta (and only Marta), carrying one trusted, public claim. */
function world(extra: { thread?: boolean; labels?: string[] } = {}) {
  const db = memDb();
  const source = insertSource(db, {
    kind: "email",
    external_id: "m1",
    thread_id: extra.thread ? "t1" : null,
    author: "anna.rossi@molino.example",
    recipients: ["marta.ricci@pasta.example"],
    occurred_at: "2026-11-21T07:00:00Z",
    raw: TEXT,
    acl_labels: extra.labels ?? ["public"],
    meta: { subject: "Prezzo semola", from_name: "Anna Rossi", to: [{ name: "Marta Ricci", addr: "marta.ricci@pasta.example" }], cc: [] },
  }).source_id;
  const r = submitClaim(
    db,
    { predicate_id: "spot_price", fields: { item: "ent:durum_semolina", amount: 502, currency: "EUR", per: "t", change_pct: 18 }, evidence: [{ source_id: source, quote: "salito a 502 €/t, +18% in tre settimane" }] },
    "agent:test",
    { trust: true },
  );
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { db, source, claim: r.claim_id };
}

describe("isParticipant", () => {
  it("matches by display name or by address, and across the whole thread", () => {
    const { db, source } = world({ thread: true });
    expect(isParticipant(db, marta, source)).toBe(true);
    expect(isParticipant(db, luca, source)).toBe(false);
    // Luca is in another message of the same thread: he has seen the conversation
    insertSource(db, { kind: "email", external_id: "m2", thread_id: "t1", author: "marta.ricci@pasta.example", recipients: ["luca.bianchi@pasta.example"], occurred_at: "2026-11-21T08:00:00Z", raw: "Inoltro a Luca.", acl_labels: ["public"], meta: { subject: "Re", to: [] } });
    expect(isParticipant(db, luca, source)).toBe(true);
    expect(isParticipant(db, sara, source)).toBe(false);
  });
});

describe("considerClaims", () => {
  let w: ReturnType<typeof world>;
  beforeEach(() => {
    w = world();
  });

  it("never asks the model about someone who is directly part of the source", async () => {
    const { llm, calls } = scriptedLlm([() => reply({ notify: false, segments: [], reason: "routine" }), () => reply({ notify: false, segments: [], reason: "routine" })]);
    const s = await considerClaims(w.db, w.source, [w.claim], opts(llm));
    expect(s.skipped).toContainEqual({ principal: "marta", decision: "skip_participant" });
    expect(calls).toHaveLength(2); // luca and sara only
    expect(listNotices(w.db, "marta")).toEqual([]);
  });

  it("tells a person who has access but was not on the email, with verified, cited text", async () => {
    const { llm, calls } = scriptedLlm([
      (req) => reply({ notify: true, topic: "Semola in rialzo", urgency: "high", segments: [{ text: "La semola è a 502 €/t, +18%.", cites: [cites(req.prompt, "N")] }] }),
      () => reply({ notify: false, segments: [], reason: "not relevant to production" }),
    ]);
    const s = await considerClaims(w.db, w.source, [w.claim], opts(llm));
    expect(s.notified).toEqual(["luca"]);
    const [n] = listNotices(w.db, "luca");
    expect(n).toMatchObject({ topic: "Semola in rialzo", urgency: "high", seen: false });
    expect(n.segments).toEqual([{ text: "La semola è a 502 €/t, +18%.", cites: [w.claim] }]);
    expect(listDecisions(w.db).map((d) => `${d.principal_id}:${d.decision}`).sort()).toEqual(["luca:notify", "marta:skip_participant", "sara:skip_model"]);
    expect(calls[0].prompt).toContain("Luca Bianchi");
  });

  it("rejects invented figures, asks once more, and otherwise stays silent", async () => {
    const bad = (req: { prompt: string }) => reply({ notify: true, topic: "x", segments: [{ text: "La semola è a 999 €/t.", cites: [cites(req.prompt, "N")] }] });
    const { llm, calls } = scriptedLlm([bad, bad, () => reply({ notify: false, segments: [] })]);
    const s = await considerClaims(w.db, w.source, [w.claim], opts(llm, [luca, sara]));
    expect(calls).toHaveLength(3); // luca twice (repair), sara once
    expect(s.skipped).toContainEqual({ principal: "luca", decision: "skip_unverified" });
    expect(listNotices(w.db, "luca")).toEqual([]);
  });

  it("repairs a message that cites nothing new", async () => {
    const { llm } = scriptedLlm([
      () => reply({ notify: true, topic: "x", segments: [{ text: "La semola è a 502 €/t.", cites: ["C1"] }] }),
      (req) => reply({ notify: true, topic: "Semola", segments: [{ text: "La semola è a 502 €/t.", cites: [cites(req.prompt, "N")] }] }),
    ]);
    const s = await considerClaims(w.db, w.source, [w.claim], opts(llm, [luca]));
    expect(s.notified).toEqual(["luca"]);
  });

  it("shows the model what it already told this person, in full", async () => {
    const tell = (req: { prompt: string }) => reply({ notify: true, topic: "Semola in rialzo", segments: [{ text: "La semola è a 502 €/t, +18%.", cites: [cites(req.prompt, "N")] }] });
    await considerClaims(w.db, w.source, [w.claim], opts(scriptedLlm([tell]).llm, [luca]));
    // a second source arrives later
    const src2 = insertSource(w.db, { kind: "news", external_id: "n2", occurred_at: "2026-11-22T07:00:00Z", raw: "La semola sale a 520 €/t.", acl_labels: ["public"], meta: { title: "Ancora su", domain: "m.example" } }).source_id;
    const r = submitClaim(w.db, { predicate_id: "spot_price", fields: { item: "ent:durum_semolina", amount: 520, currency: "EUR", per: "t" }, evidence: [{ source_id: src2, quote: "sale a 520 €/t" }] }, "agent:test", { trust: true });
    const second = scriptedLlm([() => reply({ notify: false, segments: [], reason: "already told" })]);
    await considerClaims(w.db, src2, [(r as { claim_id: string }).claim_id], opts(second.llm, [luca]));
    expect(second.calls[0].prompt).toContain("Semola in rialzo");
    expect(second.calls[0].prompt).toContain("La semola è a 502 €/t, +18%.");
  });

  it("does not ask twice for the same source and claims", async () => {
    const quiet = () => reply({ notify: false, segments: [], reason: "no" });
    const first = scriptedLlm([quiet, quiet]);
    await considerClaims(w.db, w.source, [w.claim], opts(first.llm));
    const again = scriptedLlm([]);
    const s = await considerClaims(w.db, w.source, [w.claim], opts(again.llm));
    expect(again.calls).toHaveLength(0);
    expect(s.notified).toEqual([]);
  });

  it("records nothing when the model call fails, so it is retried", async () => {
    const s = await considerClaims(w.db, w.source, [w.claim], { llm: async () => { throw new Error("down"); }, model: "t", principals: [luca] });
    expect(s.failed).toEqual(["luca"]);
    expect(listDecisions(w.db).filter((d) => d.principal_id === "luca")).toEqual([]);
  });

  it("ignores claims that are not yet approved", async () => {
    const db = memDb();
    const src = insertSource(db, { kind: "news", external_id: "n", occurred_at: "2026-11-21T07:00:00Z", raw: TEXT, acl_labels: ["public"], meta: { title: "t", domain: "d.example" } }).source_id;
    const r = submitClaim(db, { predicate_id: "spot_price", fields: { item: "ent:durum_semolina", amount: 502, currency: "EUR", per: "t", change_pct: 18 }, evidence: [{ source_id: src, quote: "salito a 502 €/t, +18% in tre settimane" }] });
    const { llm, calls } = scriptedLlm([]);
    await considerClaims(db, src, [(r as { claim_id: string }).claim_id], opts(llm));
    expect(calls).toHaveLength(0);
  });
});

describe("access", () => {
  it("shows the model nothing the person may not see, and skips people who may see none of the news", async () => {
    const w = world({ labels: ["finance"] });
    const hidden = insertSource(w.db, { kind: "document", external_id: "secret", occurred_at: "2026-11-01T00:00:00Z", raw: "Il margine target è del 9% sul contratto Alfa.", acl_labels: ["board"], meta: { title: "Board", doc_type: "memo" } }).source_id;
    submitClaim(w.db, { predicate_id: "statement", fields: { text: "Margine target 9% sul contratto Alfa." }, evidence: [{ source_id: hidden, quote: "Il margine target è del 9% sul contratto Alfa" }] }, "agent:test", { trust: true });
    const { llm, calls } = scriptedLlm([() => reply({ notify: false, segments: [], reason: "no" })]);
    await considerClaims(w.db, w.source, [w.claim], opts(llm));
    expect(calls).toHaveLength(1); // only luca (finance); sara cannot see the new claim at all
    expect(calls[0].prompt).not.toContain("Margine target");
    expect(listDecisions(w.db).some((d) => d.principal_id === "sara")).toBe(false);
  });
});

describe("storage", () => {
  it("keeps the hash chain valid, is append-only, and dismissal only works on your own notices", async () => {
    const w = world();
    const { llm } = scriptedLlm([
      (req) => reply({ notify: true, topic: "Semola", segments: [{ text: "La semola è a 502 €/t.", cites: [cites(req.prompt, "N")] }] }),
      () => reply({ notify: false, segments: [] }),
    ]);
    await considerClaims(w.db, w.source, [w.claim], opts(llm));
    expect(verify(w.db as DB).ok).toBe(true);
    expect(() => w.db.prepare("UPDATE notices SET topic = 'x'").run()).toThrow(/append-only/);
    const id = listNotices(w.db, "luca")[0].notice_id;
    expect(markSeen(w.db, "sara", [id])).toBe(0);
    expect(markSeen(w.db, "luca", [id])).toBe(1);
    expect(listNotices(w.db, "luca")[0].seen).toBe(true);
  });
});

describe("when a claim behind a notice is rejected", () => {
  const views = (db: DB) => new Map(listClaimViews(db).map((c) => [c.claim_id, c]));
  const tell = (text: (req: { prompt: string }) => { text: string; cites: string[] }[]) => (req: { prompt: string }) => reply({ notify: true, topic: "Semola", segments: text(req) });

  it("is cancelled, with who and why, and the notice itself is kept", async () => {
    const w = world();
    await considerClaims(w.db, w.source, [w.claim], opts(scriptedLlm([tell((r) => [{ text: "La semola è a 502 €/t.", cites: [cites(r.prompt, "N")] }]), () => reply({ notify: false, segments: [] })]).llm, [luca, sara]));
    const [n] = listNotices(w.db, "luca");
    expect(noticeState(n, views(w.db))).toMatchObject({ state: "ok", withdrawn: [] });

    reviewClaim(w.db, w.claim, "rejected", "human:marta", "wrong figure");
    const st = noticeState(listNotices(w.db, "luca")[0], views(w.db));
    expect(st.state).toBe("cancelled");
    expect(st.withdrawn).toMatchObject([{ claim_id: w.claim, status: "rejected", by: "human:marta", reason: "wrong figure" }]);
    expect(st.segment_withdrawn).toEqual([true]);
    expect(listNotices(w.db, "luca")).toHaveLength(1); // never deleted
  });

  it("is only updated when some statements still stand on other claims", async () => {
    const w = world();
    const r2 = submitClaim(w.db, { predicate_id: "spot_price", fields: { item: "ent:durum_semolina", amount: 502, currency: "EUR", per: "t" }, evidence: [{ source_id: w.source, quote: "salito a 502 €/t" }] }, "agent:test", { trust: true });
    expect(r2.ok).toBe(true);
    const second = (r2 as { claim_id: string }).claim_id;
    const both = (req: { prompt: string }) => {
      const hs = [...req.prompt.matchAll(/\[(N\d+)\]/g)].map((m) => m[1]);
      return [{ text: "La semola è a 502 €/t.", cites: [hs[0]] }, { text: "Il prezzo spot è 502 €/t.", cites: [hs[1]] }];
    };
    await considerClaims(w.db, w.source, [w.claim, second], opts(scriptedLlm([tell(both)]).llm, [luca]));
    const n = listNotices(w.db, "luca")[0];
    expect(n.segments).toHaveLength(2);
    reviewClaim(w.db, n.segments![0].cites[0], "rejected", "human:marta");
    const st = noticeState(listNotices(w.db, "luca")[0], views(w.db));
    expect(st.state).toBe("updated");
    expect(st.segment_withdrawn).toEqual([true, false]);
  });

  it("a dismissed notice can be dismissed again after it is cancelled", async () => {
    const w = world();
    await considerClaims(w.db, w.source, [w.claim], opts(scriptedLlm([tell((r) => [{ text: "La semola è a 502 €/t.", cites: [cites(r.prompt, "N")] }])]).llm, [luca]));
    const id = listNotices(w.db, "luca")[0].notice_id;
    markSeen(w.db, "luca", [id]);
    const before = listNotices(w.db, "luca")[0].seen_at!;
    await new Promise((r) => setTimeout(r, 5));
    markSeen(w.db, "luca", [id]);
    expect(listNotices(w.db, "luca")[0].seen_at! > before).toBe(true);
  });
});
