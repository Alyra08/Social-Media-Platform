import fs from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzlePglite<typeof schema>>;

export async function createDb(opts: {
  databaseUrl?: string;
  dataDir?: string; // undefined or "memory://" for in-memory (tests)
  migrationsFolder: string;
}): Promise<Db> {
  if (opts.databaseUrl) {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: opts.migrationsFolder });
    // Both drivers expose the same query-builder surface; the PGlite type is used app-wide.
    return db as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = opts.dataDir && opts.dataDir !== "memory://" ? opts.dataDir : undefined;
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    // PGlite runs in-process; a postmaster.pid left by a killed dev server is always stale.
    fs.rmSync(`${dir}/postmaster.pid`, { force: true });
  }
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: opts.migrationsFolder });
  return db;
}
