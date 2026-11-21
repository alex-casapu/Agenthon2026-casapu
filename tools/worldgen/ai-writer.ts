import type { Llm } from "./llm";
import { languageName } from "./numfmt";
import type { Brief, PieceKind, Writer } from "./types";

/** System prompt for the piece writer, for this world. */
export function writerSystem(style: Brief["style"]): string {
  return [
    `Sei l'autore di materiali aziendali sintetici per una simulazione: email, articoli di mercato e documenti di ${style.company} (${style.description}).`,
    `Scrivi SOLO il corpo richiesto, in ${languageName(style.language)} naturale e con il registro adatto al tipo di materiale.`,
    "Regole rigide:",
    "- I fatti obbligatori devono comparire alla lettera, con le stesse cifre, unità e date indicate.",
    "- Non aggiungere altri numeri o date oltre a quelli indicati. Non calcolare totali, differenze, percentuali, risparmi o stime: non farne neppure un cenno.",
    "- Non inventare nomi, cifre o fatti nuovi che contraddicano o completino quelli dati.",
    `- Il nome dell'azienda è «${style.company}»: scrivilo sempre con questa grafia esatta.`,
    "- Non scrivere intestazioni, blocchi di front matter, blocchi di codice, titoli del file, né commenti sul testo (niente 'Ecco il testo').",
    "- Nessuna emoji.",
    "Rispondi solo con il testo del corpo.",
  ].join("\n");
}

const KIND_GUIDE: Record<PieceKind, string> = {
  email:
    "Tipo: corpo di un'email. Saluto, testo, firma. Non scrivere oggetto, mittente o destinatari. Non citare il messaggio precedente: viene aggiunto in automatico.",
  news: "Tipo: corpo di un articolo di mercato. Tono giornalistico e sobrio. Non scrivere il titolo: è già nell'intestazione.",
  doc: "Tipo: testo di un documento aziendale in Markdown (contratto, piano, tabella di un sistema). Non scrivere il titolo del file: è già nell'intestazione.",
};

/** The prompt for a brief. Pure: the same brief always gives the same prompt. */
export function buildPrompt(b: Brief): { system: string; user: string } {
  const parts: string[] = [KIND_GUIDE[b.kind], ""];

  if (b.author) {
    parts.push(`Scrivi come ${b.author.name} (${b.author.role}).${b.author.persona ? ` Il tuo modo di scrivere: ${b.author.persona}` : ""}`);
    if (b.author.knows.length) {
      parts.push("Ciò che sai (dalle tue conversazioni e documenti): " + b.author.knows.join("; ") + ". Non attribuirti conoscenze che non hai.");
    }
    parts.push("");
  }

  if (b.parent) {
    parts.push(`Stai rispondendo a questo messaggio (da ${b.parent.from}, ${b.parent.date.slice(0, 10)}):`, '"""', b.parent.text.trim(), '"""', "");
  }

  parts.push(
    "Contesto (intestazione del materiale, già definita, non va riscritta):",
    ...Object.entries(b.context).map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`),
    "",
    "Cosa deve dire:",
    b.brief,
    "",
    "Fatti obbligatori (devono comparire alla lettera):",
    ...b.mustContain.map((f) => `- ${f}`),
  );
  if (b.example) {
    parts.push("", "Esempio del registro e della lunghezza (scrivi con parole tue, non copiarlo parola per parola):", '"""', b.example, '"""');
  }
  if (b.feedback?.length) {
    parts.push("", "Il tentativo precedente è stato scartato per questi motivi. Correggi:", ...b.feedback.map((f) => `- ${f}`));
  }
  return { system: writerSystem(b.style), user: parts.join("\n") };
}

/** Removes a wrapping code fence, if the model added one. */
export function cleanOutput(text: string): string {
  let t = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/.exec(t);
  if (fence) t = fence[1].trim();
  return t;
}

/** The piece writer: builds the prompt for a brief and asks the model. */
export class LlmWriter implements Writer {
  constructor(private readonly llm: Llm) {}
  async write(b: Brief): Promise<string> {
    const { system, user } = buildPrompt(b);
    const text = cleanOutput(await this.llm.complete({ system, user, tag: b.pieceId }));
    if (!text) throw new Error(`the model returned an empty body for ${b.pieceId}`);
    return text;
  }
}
