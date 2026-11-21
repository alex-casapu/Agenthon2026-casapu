import { describe, expect, it } from "vitest";
import { canonicalize, cpLength, cpSlice, CANON_VERSION } from "./canon";
import { canonicalJson, sha256 } from "./hash";
import { getPredicate, PREDICATES } from "./predicates";

describe("hash", () => {
  it("matches the SHA-256 test vector", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("canonicalJson sorts keys at every depth and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });
  it("is insensitive to key order and sensitive to values", () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
  it("handles primitives and null", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson("x")).toBe('"x"');
    expect(canonicalJson([1, null])).toBe("[1,null]");
  });
});

describe("canon", () => {
  it("normalises newlines and unicode form, nothing else", () => {
    expect(canonicalize("a\r\nb\rc")).toBe("a\nb\nc");
    expect(canonicalize("café")).toBe("café");
    expect(canonicalize("a   b\t c")).toBe("a   b\t c");
    expect(CANON_VERSION).toBe(1);
  });
  it("counts and slices by code point", () => {
    expect(cpLength("a🍝b")).toBe(3);
    expect(cpSlice("a🍝b", 1, 2)).toBe("🍝");
  });
});

describe("predicates", () => {
  it("has unique (id, version) pairs", () => {
    const keys = PREDICATES.map((p) => `${p.id}:${p.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("returns the latest version unless one is requested", () => {
    expect(getPredicate("supplier_price")?.version).toBe(1);
    expect(getPredicate("supplier_price", 1)?.id).toBe("supplier_price");
    expect(getPredicate("supplier_price", 99)).toBeUndefined();
    expect(getPredicate("nope")).toBeUndefined();
  });
  it("keeps tier and type combinations coherent", () => {
    for (const p of PREDICATES)
      for (const f of p.fields) {
        if (f.tier === "literal") expect(["number", "string"]).toContain(f.type);
        if (f.tier === "resolved") expect(["date", "currency", "quantity_unit"]).toContain(f.type);
        if (f.type === "date") expect(["valid_from", "valid_to", "value", "conditions"]).toContain(f.slot);
      }
  });
});
