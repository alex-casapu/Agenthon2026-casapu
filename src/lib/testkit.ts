import { DEMO_ENTITIES } from "./demo-entities";
import { openDb, seedEntities, type DB } from "./store";

/** An in-memory database with the demo entities registered, for tests that submit claims. */
export function memDb(): DB {
  const db = openDb(":memory:");
  seedEntities(db, DEMO_ENTITIES);
  return db;
}
