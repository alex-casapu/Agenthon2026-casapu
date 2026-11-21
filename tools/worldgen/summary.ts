import { buildAnswerKey } from "./answers";
import type { Compiled } from "./compile";
import { relPath } from "./render";
import { pieceId, type Piece } from "./types";

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

const describe = (p: Piece, c: Compiled): string => {
  const person = (key: string) => c.spec.people.find((x) => x.key === key)?.name ?? key;
  const specPiece = c.spec.pieces.find((s) => pieceId(s as unknown as Piece) === pieceId(p))!;
  if (specPiece.kind === "email") {
    const h = specPiece.header;
    return `${person(h.from)} → ${h.to.map(person).join(", ")}${h.cc?.length ? ` (cc ${h.cc.map(person).join(", ")})` : ""}: ${h.subject}`;
  }
  if (specPiece.kind === "news") return `${specPiece.header.domain}: ${specPiece.header.title}${specPiece.header.corrects ? ` (rettifica di ${specPiece.header.corrects})` : ""}`;
  return `${specPiece.header.origin ?? "documento"}: ${specPiece.header.title}${specPiece.header.supersedes ? ` (sostituisce ${specPiece.header.supersedes})` : ""}`;
};

/** One page to read after generation: what the world contains and what the answers should be. */
export function buildSummary(c: Compiled, meta: { writer: string; attempts: Record<string, number> }): string {
  const { spec, values } = c;
  const key = buildAnswerKey(c);
  const out: string[] = [];

  out.push(`# ${spec.title}`, "", spec.description, "");
  out.push(`Azienda: **${spec.company.name}** (${spec.company.description}). Lingua: \`${spec.language}\`. Data della simulazione: ${spec.today}. Dati sintetici.`, "");

  out.push("## Persone e ruoli", "");
  out.push("| Persona | Ruolo | Voce |", "|---|---|---|");
  for (const p of spec.people) out.push(`| ${cell(p.name)} | ${cell(p.role)} | ${cell(p.persona ?? "")} |`);
  out.push("", "| Ruolo di accesso | Vede le etichette | Cura la memoria |", "|---|---|---|");
  for (const [r, v] of Object.entries(spec.roles)) out.push(`| ${r} | ${["public", ...v.sees].join(", ")} | ${v.curator ? "sì" : "no"} |`);
  out.push("");

  out.push("## Tappe e materiali", "");
  for (const t of spec.tiers) {
    const pieces = c.world.pieces.filter((p) => p.tier === t.id);
    out.push(`### ${t.id}: ${t.label}`, "");
    if (!pieces.length) {
      out.push("(nessun materiale)", "");
      continue;
    }
    out.push("| File | Tipo | Cosa | Etichette | Affid. | Fatti | Tentativi |", "|---|---|---|---|---|---|---|");
    for (const p of pieces) {
      const sp = spec.pieces.find((s) => pieceId(s as unknown as Piece) === pieceId(p))!;
      out.push(
        `| \`${relPath(p)}\` | ${p.kind} | ${cell(describe(p, c))} | ${(p.header.labels ?? ["public"]).join(", ")} | ${p.header.reliability ?? "-"} | ${sp.facts.join(", ")} | ${meta.attempts[pieceId(p)] ?? "-"} |`,
      );
    }
    out.push("");
  }

  out.push("## Fatti", "", "| Id | Testo | Valore |", "|---|---|---|");
  for (const f of spec.facts) out.push(`| \`${f.id}\` | ${cell(f.text)} | ${f.value ?? ""} |`);
  out.push("");

  out.push("## Valori derivati (non compaiono in nessun materiale: li calcola il sistema)", "", "| Id | Cosa | Formula | Risultato |", "|---|---|---|---|");
  for (const d of spec.derived) out.push(`| \`${d.id}\` | ${cell(d.label)} | \`${cell(d.formula)}\` | **${c.derivedText[d.id]}${d.unit ? ` ${d.unit}` : ""}** (${values[d.id]}) |`);
  out.push("");

  out.push("## Domande attese", "", "| Id | Quando | Ruolo | Domanda | Esito | Deve contenere | Cita |", "|---|---|---|---|---|---|---|");
  for (const i of key.items) out.push(`| ${i.id} | ${cell(i.when)} | ${i.role} | ${cell(i.question)} | ${i.expect} | ${cell((i.mustInclude ?? []).join("; "))} | ${cell((i.cites ?? []).join("; "))} |`);
  out.push("");

  if (spec.adversarial.length) {
    out.push("## Prove avversarie", "", "| Ruolo | Domanda | Esito atteso |", "|---|---|---|");
    for (const a of spec.adversarial) out.push(`| ${a.role} | ${cell(a.question)} | ${a.expect} |`);
    out.push("");
  }

  out.push("## Note di generazione", "", `- Writer: ${meta.writer}.`, `- Parole vietate: ${spec.banned.length ? spec.banned.join(", ") : "nessuna"}.`, `- Letterali vietati (valori derivati): ${c.world.forbidden.join(", ") || "nessuno"}.`, "");
  return out.join("\n");
}
