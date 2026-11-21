import type { PredicateDef } from "./gate/types";

/**
 * Predicate vocabulary. During development this file is the source of truth;
 * on startup each (id, version, hash) is recorded in the append-only
 * `predicates` table so every claim points at the exact definition it was
 * extracted under. Changing a definition requires bumping its version.
 */
export const PREDICATES: PredicateDef[] = [
  {
    id: "supplier_price",
    version: 1,
    kind: "structured",
    description: "A supplier quotes a price per unit for an item.",
    cardinality: "single",
    fields: [
      { name: "supplier", slot: "subject", tier: "interpretive", type: "entity", required: true },
      { name: "item", slot: "subject", tier: "interpretive", type: "entity", required: true },
      { name: "amount", slot: "value", tier: "literal", type: "number", required: true },
      { name: "currency", slot: "value", tier: "resolved", type: "currency", required: true },
      { name: "per", slot: "value", tier: "resolved", type: "quantity_unit", required: true },
      { name: "min_volume", slot: "conditions", tier: "literal", type: "number", required: false },
      { name: "valid_to", slot: "valid_to", tier: "resolved", type: "date", required: false },
    ],
  },
  {
    id: "commitment",
    version: 1,
    kind: "structured",
    description: "Someone commits to do something for someone else, optionally by a date.",
    cardinality: "multi",
    fields: [
      { name: "owner", slot: "subject", tier: "interpretive", type: "entity", required: true },
      { name: "counterparty", slot: "subject", tier: "interpretive", type: "entity", required: false },
      { name: "action", slot: "value", tier: "interpretive", type: "string", required: true },
      { name: "due", slot: "valid_to", tier: "resolved", type: "date", required: false },
    ],
  },
  {
    id: "statement",
    version: 1,
    kind: "statement",
    description: "Catch-all: a useful fact that fits no predicate yet. Quote-grounded, unstructured.",
    cardinality: "multi",
    fields: [{ name: "text", slot: "value", tier: "interpretive", type: "string", required: true }],
  },
];

export function getPredicate(id: string, version?: number): PredicateDef | undefined {
  const matches = PREDICATES.filter((p) => p.id === id && (version === undefined || p.version === version));
  return matches.sort((a, b) => b.version - a.version)[0];
}
