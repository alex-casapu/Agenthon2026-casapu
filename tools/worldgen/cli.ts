import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { LlmWriter } from "./ai-writer";
import { compile, type Compiled } from "./compile";
import { checkDir, defaultTargets, playTier, readSpec, SPEC_FILE, writeWorld } from "./files";
import { generateWorld, GenerationError } from "./generate";
import { lintSpec } from "./lint";
import { ClaudeCliLlm, RecordingLlm, RecordingStore, type RecordMode } from "./llm";
import { PlanError, planScenario } from "./planner";
import { parseSpec } from "./spec";
import type { Writer } from "./types";
import { ExampleWriter } from "./writer";

const USAGE = `Uso: tsx tools/worldgen/cli.ts <comando> [opzioni]

  make "<scenario>"   | make --file scenario.txt
        Da un testo libero genera TUTTO in un colpo: lo scenario strutturato, i materiali
        (email, news, documenti per tappa), la chiave delle risposte e SUMMARY.md.
        Esce in worlds/<slug>/.
          --lang it            lingua dei materiali (default it)
          --company "Nome"     nome fisso dell'azienda (altrimenti ne inventa uno)
          --slug nome          nome della cartella
          --writer auto|replay|record   auto: rilegge le registrazioni, chiama claude per il resto (default)
          --model sonnet       modello per i materiali      --planner-model sonnet   modello per lo scenario
          --concurrency 3      materiali scritti in parallelo
          --out worlds         cartella delle uscite

  gen <worlds/slug | scenario.json>   rigenera i materiali da uno scenario esistente
          --writer auto|replay|record|example   (example: usa i testi "example" dello scenario, senza modello)
          --prune              elimina le registrazioni non più usate
  lint <scenario.json>        controlla uno scenario, senza modello
  check <worlds/slug>         verifica che i file su disco rispettino contratti e scenario
  play <worlds/slug> <tappa>  rilascia una tappa nelle cartelle del sistema
                              (BRAIN_INBOX, BRAIN_NEWS, BRAIN_DOCS; default data/inbox, data/news, data/docs)
`;

interface Args {
  pos: string[];
  opts: Record<string, string | true>;
}
const BOOLEAN = new Set(["prune"]);
function parseArgs(argv: string[]): Args {
  const pos: string[] = [];
  const opts: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      pos.push(a);
      continue;
    }
    const name = a.slice(2);
    if (BOOLEAN.has(name) || i + 1 >= argv.length || argv[i + 1].startsWith("--")) opts[name] = true;
    else opts[name] = argv[++i];
  }
  return { pos, opts };
}
const str = (a: Args, name: string, fallback: string): string => (typeof a.opts[name] === "string" ? (a.opts[name] as string) : fallback);

const modeOf = (a: Args, fallback: string): string => str(a, "writer", fallback);

/** A scenario file: either a scenario.json or a folder that contains one. */
function specPathOf(p: string): string {
  const abs = resolve(p);
  return existsSync(abs) && statSync(abs).isDirectory() ? join(abs, SPEC_FILE) : abs;
}

function makeWriter(a: Args, c: Compiled, worldDir: string, defaultMode: string): { writer: Writer; label: string; mode: string; prune?: () => string[] } {
  const mode = modeOf(a, defaultMode);
  if (mode === "example") return { writer: new ExampleWriter(c.world.pieces), label: "testi di esempio dello scenario (nessun modello)", mode };
  if (mode !== "auto" && mode !== "replay" && mode !== "record") throw new Error(`--writer sconosciuto: ${mode}`);
  const model = str(a, "model", "sonnet");
  const store = new RecordingStore(join(worldDir, "recordings"));
  const llm = new RecordingLlm(mode === "replay" ? null : new ClaudeCliLlm({ model }), store, model, mode as RecordMode);
  return { writer: new LlmWriter(llm), label: model, mode, prune: () => store.prune(llm.used) };
}

async function generate(a: Args, c: Compiled, worldDir: string, defaultMode: string): Promise<number> {
  const made = makeWriter(a, c, worldDir, defaultMode);
  const concurrency = Number(str(a, "concurrency", "3")) || 1;
  console.log(`Genero ${c.world.pieces.length} materiali (${made.label}, ${made.mode}, ${concurrency} in parallelo)…`);
  try {
    const files = await generateWorld(c.world, {
      writer: made.writer,
      concurrency,
      onAttempt: (id, attempt, errors) => console.log(errors.length ? `  ${id}: tentativo ${attempt} scartato (${errors.join("; ")})` : `  ${id}: ok`),
    });
    mkdirSync(worldDir, { recursive: true });
    writeWorld(c, files, worldDir, { writer: made.label });
    if (a.opts.prune && made.prune) console.log(`Registrazioni potate: ${made.prune().length}`);
    console.log(`\nFatto: ${files.length} file in ${worldDir}`);
    console.log(`Riepilogo da leggere: ${join(worldDir, "SUMMARY.md")}`);
    return 0;
  } catch (e) {
    if (e instanceof GenerationError) {
      console.error(`Errore su ${e.pieceId}:\n  ${e.errors.join("\n  ")}`);
      return 1;
    }
    throw e;
  }
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest);

  if (cmd === "make") {
    const text = typeof a.opts.file === "string" ? readFileSync(resolve(a.opts.file), "utf8") : a.pos.join(" ");
    if (!text.trim()) {
      console.error('Serve il testo dello scenario: make "<scenario>" oppure make --file scenario.txt');
      return 1;
    }
    const out = resolve(str(a, "out", "worlds"));
    const mode = modeOf(a, "auto");
    if (mode !== "auto" && mode !== "replay" && mode !== "record") throw new Error(`--writer sconosciuto: ${mode}`);
    const plannerModel = str(a, "planner-model", "sonnet");
    const plannerLlm = new RecordingLlm(mode === "replay" ? null : new ClaudeCliLlm({ model: plannerModel }), new RecordingStore(join(out, "_planner")), plannerModel, mode as RecordMode);

    console.log("1/3 Progetto lo scenario…");
    let spec;
    try {
      const planned = await planScenario({
        text,
        llm: plannerLlm,
        language: str(a, "lang", "it"),
        company: typeof a.opts.company === "string" ? a.opts.company : undefined,
        slug: typeof a.opts.slug === "string" ? a.opts.slug : undefined,
        onAttempt: (n, errors) => console.log(errors.length ? `  tentativo ${n} scartato:\n    ${errors.slice(0, 8).join("\n    ")}${errors.length > 8 ? `\n    …e altri ${errors.length - 8}` : ""}` : `  tentativo ${n}: scenario valido`),
      });
      spec = planned.spec;
    } catch (e) {
      if (e instanceof PlanError) {
        console.error(e.message);
        return 1;
      }
      throw e;
    }
    const slug = typeof a.opts.slug === "string" ? a.opts.slug : spec.slug;
    spec = { ...spec, slug };
    const worldDir = join(out, slug);
    mkdirSync(worldDir, { recursive: true });
    writeFileSync(join(worldDir, "scenario.txt"), text.trim() + "\n");
    writeFileSync(join(worldDir, SPEC_FILE), JSON.stringify(spec, null, 2) + "\n");
    console.log(`  ${spec.title}: ${spec.pieces.length} materiali, ${spec.tiers.length} tappe, ${spec.facts.length} fatti, ${spec.derived.length} valori derivati`);

    console.log("2/3 Scrivo i materiali…");
    const c = compile(spec);
    const code = await generate(a, c, worldDir, "auto");
    if (code === 0) console.log("3/3 Fatto.");
    return code;
  }

  if (cmd === "gen") {
    const file = specPathOf(a.pos[0] ?? "");
    if (!a.pos[0] || !existsSync(file)) {
      console.error("Serve uno scenario: gen worlds/<slug>  oppure  gen scenario.json");
      return 1;
    }
    const spec = readSpec(file);
    const errs = lintSpec(spec);
    if (errs.length) {
      console.error(`Lo scenario non è valido:\n  ${errs.join("\n  ")}`);
      return 1;
    }
    const worldDir = typeof a.opts.out === "string" ? resolve(a.opts.out) : basename(file) === SPEC_FILE ? dirname(file) : resolve("worlds", spec.slug);
    return generate(a, compile(spec), worldDir, "auto");
  }

  if (cmd === "lint") {
    const file = specPathOf(a.pos[0] ?? "");
    if (!a.pos[0] || !existsSync(file)) {
      console.error("Serve uno scenario: lint scenario.json");
      return 1;
    }
    const parsed = parseSpec(JSON.parse(readFileSync(file, "utf8")));
    if (!parsed.ok) {
      console.error(`Schema non valido:\n  ${parsed.errors.join("\n  ")}`);
      return 1;
    }
    const errs = lintSpec(parsed.spec);
    if (errs.length) {
      console.error(`Scenario non valido (${errs.length} problemi):\n  ${errs.join("\n  ")}`);
      return 1;
    }
    console.log(`Scenario valido: ${parsed.spec.title} (${parsed.spec.pieces.length} materiali)`);
    return 0;
  }

  if (cmd === "check") {
    const dir = resolve(a.pos[0] ?? "");
    if (!a.pos[0] || !existsSync(join(dir, SPEC_FILE))) {
      console.error(`Serve una cartella con ${SPEC_FILE}: check worlds/<slug>`);
      return 1;
    }
    const c = compile(readSpec(join(dir, SPEC_FILE)));
    const errors = checkDir(c.world, dir);
    if (errors.length) {
      console.error(`Mondo non valido (${errors.length} problemi):\n  ${errors.join("\n  ")}`);
      return 1;
    }
    console.log(`Mondo valido: ${c.world.pieces.length} file in ${dir}`);
    return 0;
  }

  if (cmd === "play") {
    const dir = resolve(a.pos[0] ?? "");
    const tier = a.pos[1];
    if (!a.pos[0] || !existsSync(join(dir, SPEC_FILE))) {
      console.error(`Serve una cartella con ${SPEC_FILE}: play worlds/<slug> <tappa>`);
      return 1;
    }
    const c = compile(readSpec(join(dir, SPEC_FILE)));
    if (!tier || !c.world.tiers.includes(tier)) {
      console.error(`Tappa sconosciuta: ${tier ?? "(nessuna)"}. Tappe di questo mondo: ${c.world.tiers.join(", ")}.`);
      return 1;
    }
    const written = playTier(tier, dir, defaultTargets());
    console.log(`Tappa ${tier}: ${written.length} file rilasciati`);
    for (const w of written) console.log(`  ${w}`);
    return 0;
  }

  console.error(USAGE);
  return cmd ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
