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
    id: "supplier_price",
    version: 2,
    kind: "structured",
    description:
      "A price per unit for an item from a supplier: a contract price, an offer, or an invoiced price. Not market-wide prices (use spot_price).",
    cardinality: "single",
    fields: [
      { name: "supplier", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "who sells, as ent:<snake_case>" },
      { name: "item", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "what is sold, as ent:<snake_case>" },
      { name: "amount", slot: "value", tier: "literal", type: "number", required: true, hint: "the unit price, digits as written" },
      { name: "currency", slot: "value", tier: "resolved", type: "currency", required: true },
      { name: "per", slot: "value", tier: "resolved", type: "quantity_unit", required: true, hint: "the unit the price is per (t, kg, pallet)" },
      { name: "price_type", slot: "conditions", tier: "interpretive", type: "string", required: false, hint: "fixed | offer | invoiced | list" },
      { name: "min_volume", slot: "conditions", tier: "literal", type: "number", required: false, hint: "minimum order quantity, only if stated as a minimum" },
      { name: "volume", slot: "conditions", tier: "literal", type: "number", required: false, hint: "the quantity the price applies to (e.g. an offer of 3.000 t)" },
      { name: "coverage_pct", slot: "conditions", tier: "literal", type: "number", required: false, hint: "share of needs covered, 60 for 60%" },
      { name: "valid_to", slot: "valid_to", tier: "resolved", type: "date", required: false, hint: "last day the price or offer is valid" },
    ],
  },
  {
    id: "spot_price",
    version: 1,
    kind: "structured",
    description: "A market (spot) price for an item, as reported by a market source, optionally with its change over a period.",
    cardinality: "multi",
    fields: [
      { name: "item", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "what is priced, as ent:<snake_case>" },
      { name: "market", slot: "subject", tier: "interpretive", type: "string", required: false, hint: "the market or scope, e.g. national average, Foggia" },
      { name: "amount", slot: "value", tier: "literal", type: "number", required: true, hint: "the price, digits as written" },
      { name: "currency", slot: "value", tier: "resolved", type: "currency", required: true },
      { name: "per", slot: "value", tier: "resolved", type: "quantity_unit", required: true },
      { name: "change_pct", slot: "value", tier: "literal", type: "number", required: false, hint: "percentage change as written, 18 for +18%" },
      { name: "period", slot: "conditions", tier: "interpretive", type: "string", required: false, hint: "the period the price refers to, e.g. October 2026, last three weeks" },
    ],
  },
  {
    id: "demand",
    version: 1,
    kind: "structured",
    description: "A planned or observed requirement for an item at a site, per period.",
    cardinality: "single",
    fields: [
      { name: "item", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "as ent:<snake_case>" },
      { name: "site", slot: "subject", tier: "interpretive", type: "entity", required: false, hint: "plant or site, as ent:<snake_case>" },
      { name: "amount", slot: "value", tier: "literal", type: "number", required: true, hint: "quantity, digits as written" },
      { name: "unit", slot: "value", tier: "resolved", type: "quantity_unit", required: true },
      { name: "period", slot: "conditions", tier: "interpretive", type: "string", required: true, hint: "month, week, year, ..." },
    ],
  },
  {
    id: "stock_coverage",
    version: 1,
    kind: "structured",
    description: "How many days of coverage the stock of an item gives at a site, as of a date.",
    cardinality: "single",
    fields: [
      { name: "item", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "as ent:<snake_case>" },
      { name: "site", slot: "subject", tier: "interpretive", type: "entity", required: true, hint: "as ent:<snake_case>" },
      { name: "days", slot: "value", tier: "literal", type: "number", required: true, hint: "days of coverage, digits as written" },
      { name: "as_of", slot: "valid_from", tier: "resolved", type: "date", required: false, hint: "the date the figure refers to; include a quote that states it" },
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

/** The highest version of every predicate: what the extractor and the proposal form use. */
export function latestPredicates(): PredicateDef[] {
  const byId = new Map<string, PredicateDef>();
  for (const p of PREDICATES) {
    const cur = byId.get(p.id);
    if (!cur || p.version > cur.version) byId.set(p.id, p);
  }
  return [...byId.values()];
}
