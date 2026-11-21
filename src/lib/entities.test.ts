import { describe, expect, it } from "vitest";
import { DEMO_ENTITIES } from "./demo-entities";
import { ENTITIES, describeEntities, entityIdFor, findEntity, getEntity, normName, registryOf, suggestEntities } from "./entities";

const ALL = [...ENTITIES, ...DEMO_ENTITIES];

describe("shipped entities", () => {
  it("there are none: everything is discovered, never seeded", () => {
    expect(ENTITIES).toEqual([]);
    expect(getEntity("ent:marta_ricci")).toBeUndefined();
    expect(getEntity("ent:molino_rossi")).toBeUndefined();
    expect(new Set(DEMO_ENTITIES.map((e) => e.id)).size).toBe(DEMO_ENTITIES.length);
    for (const e of DEMO_ENTITIES) expect(e.id, e.id).toMatch(/^ent:[a-z0-9_]+$/);
  });
});

describe("normName", () => {
  it("compares names without case, accents, punctuation or legal forms", () => {
    expect(normName("Molino Tavoliere S.r.l.")).toBe("molino tavoliere");
    expect(normName("MOLINO  TAVOLIERE srl")).toBe("molino tavoliere");
    expect(normName("Pastaco S.p.A.")).toBe("pastaco");
    expect(normName("Müller GmbH")).toBe("muller");
    expect(normName("Café Crème Ltd.")).toBe("cafe creme");
    expect(normName("Acme, Inc.")).toBe("acme");
    expect(normName("   ")).toBe("");
  });
});

describe("entityIdFor", () => {
  it("derives a stable ascii id from the name, ignoring legal forms", () => {
    expect(entityIdFor("Molino Tavoliere S.r.l.")).toBe("ent:molino_tavoliere");
    expect(entityIdFor("Molino Tavoliere")).toBe("ent:molino_tavoliere");
    expect(entityIdFor("Semola di grano duro")).toBe("ent:semola_di_grano_duro");
    expect(entityIdFor("Müller & Söhne GmbH")).toBe("ent:muller_sohne");
    expect(entityIdFor("日本")).toBe("");
    expect(entityIdFor("---")).toBe("");
    expect(entityIdFor("x".repeat(200)).length).toBeLessThanOrEqual(64);
  });
});

describe("findEntity", () => {
  it("finds by id, name, alias and by an id spelled like a name", () => {
    expect(findEntity(ALL, "ent:molino_rossi")?.name).toBe("Molino Rossi S.r.l.");
    expect(findEntity(ALL, "Molino Rossi")?.id).toBe("ent:molino_rossi");
    expect(findEntity(ALL, "molino rossi srl")?.id).toBe("ent:molino_rossi");
    expect(findEntity(ALL, "Tavoliere")?.id).toBe("ent:molino_tavoliere");
    expect(findEntity(ALL, "semola di grano duro")?.id).toBe("ent:durum_semolina");
    expect(findEntity(ALL, "ent:durum semolina")?.id).toBe("ent:durum_semolina");
    expect(findEntity(ALL, "ent:nobody_here")).toBeUndefined();
    expect(findEntity(ALL, "")).toBeUndefined();
  });
});

describe("suggestions and prompt text", () => {
  it("suggests the closest entries for an unknown id", () => {
    expect(suggestEntities("ent:fornitore_semola", ALL).map((e) => e.id)).toContain("ent:durum_semolina");
    expect(suggestEntities("ent:parma", ALL).map((e) => e.id)).toContain("ent:parma_plant");
    expect(suggestEntities("ent:zzz_qqq", ALL)).toEqual([]);
    expect(suggestEntities("ent:molino", ALL, 2)).toHaveLength(2);
    expect(registryOf(ALL).suggest("ent:fornitore_semola").length).toBeGreaterThan(0);
    expect(registryOf(ALL).get("ent:parma_plant")?.kind).toBe("site");
  });

  it("describes the registry for the prompt, aliases included", () => {
    const text = describeEntities(ALL);
    expect(text).toContain("ent:molino_rossi: Molino Rossi S.r.l. (organization; also: Molino Rossi");
    expect(text).toContain("ent:marketing: Marketing (department)");
    expect(text.split("\n")).toHaveLength(ALL.length);
  });
});
