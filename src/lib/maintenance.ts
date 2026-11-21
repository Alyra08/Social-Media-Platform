import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activityLog, notifications, oauthStates, sessions, stories } from "@/db/schema";
import { logActivity } from "./system";

/**
 * Retention and backups (Australian Privacy Principle 11: keep personal information only as long
 * as needed). Defaults below are conservative and can be changed in one place.
 */
export const RETENTION = {
  deniedStoriesDays: 180,
  readNotificationsDays: 90,
  activityLogDays: 365,
  backupsToKeep: 8,
};

export async function runMaintenance(db: Db) {
  const ago = (d: number) => new Date(Date.now() - d * 86400_000);
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(oauthStates).where(lt(oauthStates.createdAt, ago(1)));
  await db.delete(stories).where(and(eq(stories.status, "denied"), lt(stories.createdAt, ago(RETENTION.deniedStoriesDays))));
  await db.delete(notifications).where(and(eq(notifications.read, true), lt(notifications.createdAt, ago(RETENTION.readNotificationsDays))));
  await db.delete(activityLog).where(and(inArray(activityLog.status, ["ok", "skipped"]), lt(activityLog.createdAt, ago(RETENTION.activityLogDays))));
  const backup = await backupLocalDatabase(db);
  await logActivity(db, "maintenance:daily", "ok", `Retention applied${backup ? `; backup saved to ${backup}` : ""}`);
}

/** Weekly-ish compressed snapshot of the embedded database. Hosted Postgres uses the provider's backups. */
export async function backupLocalDatabase(db: Db): Promise<string | null> {
  if (process.env.DATABASE_URL) return null;
  const client = (db as unknown as { $client?: { dumpDataDir?: (c?: "gzip") => Promise<Blob> } }).$client;
  if (!client?.dumpDataDir) return null;
  const base = process.env.PGLITE_DIR ? path.dirname(process.env.PGLITE_DIR) : path.join(process.cwd(), ".data");
  const dir = path.join(base, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const today = new Date(Date.now() + 10 * 3600_000).toISOString().slice(0, 10); // Brisbane date
  const file = path.join(dir, `sbf-db-${today}.tar.gz`);
  if (fs.existsSync(file)) return null;
  const blob = await client.dumpDataDir("gzip");
  fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
  const all = fs.readdirSync(dir).filter((f) => f.startsWith("sbf-db-")).sort();
  for (const old of all.slice(0, Math.max(0, all.length - RETENTION.backupsToKeep))) fs.rmSync(path.join(dir, old), { force: true });
  return file;
}
