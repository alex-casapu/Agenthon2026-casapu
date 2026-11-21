import { describe, expect, it } from "vitest";
import { ENTITIES, describeEntities, getEntity, suggestEntities } from "./entities";

describe("entity registry", () => {
  it("has unique, well-formed ids", () => {
    expect(new Set(ENTITIES.map((e) => e.id)).size).toBe(ENTITIES.length);
    for (const e of ENTITIES) expect(e.id, e.id).toMatch(/^ent:[a-z0-9_]+$/);
  });

  it("looks entities up by id", () => {
    expect(getEntity("ent:molino_rossi")?.name).toBe("Molino Rossi S.r.l.");
    expect(getEntity("ent:parma_plant")?.kind).toBe("site");
    expect(getEntity("ent:nope")).toBeUndefined();
    expect(getEntity("molino_rossi")).toBeUndefined();
  });

  it("suggests the closest entries for an unknown id", () => {
    expect(suggestEntities("ent:fornitore_semola").map((e) => e.id)).toContain("ent:durum_semolina");
    expect(suggestEntities("ent:molino_tavolier")[0].id).toMatch(/^ent:molin/);
    expect(suggestEntities("ent:parma").map((e) => e.id)).toContain("ent:parma_plant");
    expect(suggestEntities("ent:zzz_qqq")).toEqual([]);
    expect(suggestEntities("ent:molino", 2)).toHaveLength(2);
  });

  it("describes the registry for the prompt, aliases included", () => {
    const text = describeEntities();
    expect(text).toContain("ent:molino_rossi: Molino Rossi S.r.l. (organization; also: Molino Rossi");
    expect(text).toContain("ent:marketing: Marketing (department)");
    expect(text.split("\n")).toHaveLength(ENTITIES.length);
  });
});
