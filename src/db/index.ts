import "server-only";
import path from "node:path";
import { createDb, type Db } from "./client";
import { loadKeys } from "@/lib/keys";

/**
 * Single shared database handle.
 * - DATABASE_URL set  → PostgreSQL via node-postgres (production).
 * - DATABASE_URL unset → embedded PostgreSQL (PGlite) stored in ./.data/pg (local development).
 */
const globalForDb = globalThis as unknown as { __sbfDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__sbfDb) {
    globalForDb.__sbfDb = createDb({
      databaseUrl: process.env.DATABASE_URL,
      dataDir: process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pg"),
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    }).then(async (db) => {
      await loadKeys(db, { force: true }).catch((e) => console.error("[sbf] could not load in-app keys:", e));
      return db;
    });
  }
  // Keys added in Settings (possibly on another instance) are picked up within a minute.
  return globalForDb.__sbfDb.then((db) => {
    void loadKeys(db).catch(() => {});
    return db;
  });
}

export * as t from "./schema";
