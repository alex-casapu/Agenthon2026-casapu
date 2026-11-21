/**
 * A tiny, safe formula language for derived values: numbers, identifiers, + - * / ^, parentheses,
 * unary minus and a few functions (round, floor, ceil, abs, min, max). No eval, no Function.
 */

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|([-+*/^(),]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`unexpected character "${src.slice(pos).trim()[0]}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "id", v: m[2] });
    else out.push({ t: "op", v: m[3] });
  }
  return out;
}

export type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => number> = {
  round: (x, d = 0) => {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  },
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

export function parseFormula(src: string): Node {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`expected "${v}"`);
    i++;
  };

  const primary = (): Node => {
    const t = toks[i++];
    if (!t) throw new Error("unexpected end of formula");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "id") {
      if (isOp("(")) {
        if (!(t.v in FUNCS)) throw new Error(`unknown function "${t.v}"`);
        i++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            i++;
            args.push(expr());
          }
        }
        expect(")");
        return { k: "call", fn: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    if (t.v === "(") {
      const e = expr();
      expect(")");
      return e;
    }
    throw new Error(`unexpected "${t.v}"`);
  };
  const unary = (): Node => (isOp("-") ? (i++, { k: "neg", a: unary() }) : isOp("+") ? (i++, unary()) : power());
  const power = (): Node => {
    const base = primary();
    return isOp("^") ? (i++, { k: "bin", op: "^", a: base, b: unary() }) : base;
  };
  const term = (): Node => {
    let a = unary();
    while (isOp("*") || isOp("/")) {
      const op = (toks[i++] as { v: string }).v;
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  };
  const expr = (): Node => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[i++] as { v: string }).v;
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  };

  const tree = expr();
  if (i < toks.length) throw new Error(`unexpected "${(toks[i] as { v: string | number }).v}"`);
  return tree;
}

/** Identifiers a formula refers to. */
export function variablesOf(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg") variablesOf(n.a, out);
  else if (n.k === "bin") {
    variablesOf(n.a, out);
    variablesOf(n.b, out);
  }
  else if (n.k === "call") n.args.forEach((a) => variablesOf(a, out));
  return out;
}

export function evaluate(n: Node, env: (name: string) => number): number {
  switch (n.k) {
    case "num":
      return n.v;
    case "var":
      return env(n.name);
    case "neg":
      return -evaluate(n.a, env);
    case "call":
      return FUNCS[n.fn](...n.args.map((a) => evaluate(a, env)));
    case "bin": {
      const a = evaluate(n.a, env);
      const b = evaluate(n.b, env);
      if (n.op === "+") return a + b;
      if (n.op === "-") return a - b;
      if (n.op === "*") return a * b;
      if (n.op === "^") return a ** b;
      if (b === 0) throw new Error("division by zero");
      return a / b;
    }
  }
}

export interface DerivedDef {
  id: string;
  formula: string;
}

/**
 * Evaluates the derived values in dependency order. `facts` are the numeric values of the facts ledger.
 * Throws a readable error on unknown identifiers, cycles, bad syntax or non-finite results.
 */
export function evaluateDerived(facts: Record<string, number>, derived: DerivedDef[]): Record<string, number> {
  const defs = new Map(derived.map((d) => [d.id, d]));
  const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
  const values: Record<string, number> = {};
  const state = new Map<string, "visiting" | "done">();

  const resolve = (id: string): number => {
    if (own(facts, id)) return facts[id];
    const def = defs.get(id);
    if (!def) throw new Error(`unknown identifier "${id}" (not a fact with a value, nor a derived value)`);
    if (state.get(id) === "done") return values[id];
    if (state.get(id) === "visiting") throw new Error(`circular formula involving "${id}"`);
    state.set(id, "visiting");
    let tree: Node;
    try {
      tree = parseFormula(def.formula);
    } catch (e) {
      throw new Error(`derived "${id}": ${(e as Error).message} in "${def.formula}"`);
    }
    let v: number;
    try {
      v = evaluate(tree, resolve);
    } catch (e) {
      const msg = (e as Error).message;
      throw new Error(msg.startsWith("derived") || msg.startsWith("unknown") || msg.startsWith("circular") ? msg : `derived "${id}": ${msg}`);
    }
    if (!Number.isFinite(v)) throw new Error(`derived "${id}" is not a finite number`);
    values[id] = v;
    state.set(id, "done");
    return v;
  };
  for (const d of derived) resolve(d.id);
  return values;
}
