import path from "node:path";
import { createDb, type Db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import type { Actor } from "@/lib/system";

export async function testDb(): Promise<{ db: Db; owner: Actor; editor: Actor }> {
  const db = await createDb({ dataDir: "memory://", migrationsFolder: path.join(process.cwd(), "drizzle") });
  const [o] = await db.insert(users).values({ email: "owner@test.local", name: "Owner", role: "owner", passwordHash: hashPassword("x") }).returning();
  const [e] = await db.insert(users).values({ email: "editor@test.local", name: "Editor", role: "editor", passwordHash: hashPassword("x") }).returning();
  return { db, owner: { id: o.id, email: o.email, role: "owner" }, editor: { id: e.id, email: e.email, role: "editor" } };
}
