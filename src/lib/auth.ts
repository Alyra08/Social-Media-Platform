import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256, verifyPassword } from "./crypto";
import type { Actor } from "./system";

export const SESSION_COOKIE = "sbf_session";
const SESSION_DAYS = 14;

export type Role = "owner" | "editor" | "viewer";
export type CurrentUser = { id: string; email: string; name: string; role: Role };

/** Simple per-email throttle: 5 failed attempts locks that email for 15 minutes. */
const failures = new Map<string, { n: number; until: number }>();

export async function login(email: string, password: string): Promise<boolean> {
  const key = email.toLowerCase().trim();
  const f = failures.get(key);
  if (f && f.n >= 5 && f.until > Date.now()) return false;
  const db = await getDb();
  const user = await db.query.users.findFirst({ where: eq(users.email, key) });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: 0 };
    failures.set(key, { n: cur.n + 1, until: Date.now() + 15 * 60_000 });
    return false;
  }
  failures.delete(key);
  const token = randomToken();
  await db.insert(sessions).values({
    id: sha256(token),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

/**
 * Local testing only: with SBF_DEV_AUTOLOGIN=1 in .env.local, the development server signs you in
 * as the owner without a password. Never active in production builds, and only for requests to
 * localhost / 127.0.0.1 (not other devices on your network).
 */
export async function devAutoLoginActive(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || process.env.SBF_DEV_AUTOLOGIN !== "1") return false;
  const host = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

async function devOwner(): Promise<CurrentUser | null> {
  const db = await getDb();
  const row = await db.query.users.findFirst({ where: eq(users.role, "owner"), columns: { id: true, email: true, name: true, role: true } });
  return (row as CurrentUser) ?? null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return (await devAutoLoginActive()) ? devOwner() : null;
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return (rows[0] as CurrentUser) ?? null;
}

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** Use in pages and server actions. Viewers can read; editors can draft/edit; owners approve & publish. */
export async function requireUser(min: Role = "viewer"): Promise<CurrentUser & Actor> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (RANK[user.role] < RANK[min]) throw new Error(`This action needs the ${min} role.`);
  return user;
}
