import "server-only";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import type { Db } from "@/db/client";
import { requireUser, type CurrentUser, type Role } from "./auth";

export type Flash = { kind: "ok" | "error"; message: string };

export async function setFlash(f: Flash) {
  (await cookies()).set("sbf_flash", JSON.stringify(f), { path: "/", maxAge: 20, httpOnly: false, sameSite: "lax" });
}

/**
 * Wraps a server action: checks the role, runs it, turns errors into a friendly flash message
 * (instead of an error page) and revalidates the affected paths.
 */
export async function act(
  role: Role,
  fn: (ctx: { db: Db; user: CurrentUser }) => Promise<string | void>,
  revalidate: string[] = ["/"],
) {
  try {
    const user = await requireUser(role);
    const db = await getDb();
    const msg = await fn({ db, user });
    if (msg) await setFlash({ kind: "ok", message: msg });
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    await setFlash({ kind: "error", message: e instanceof Error ? e.message : String(e) });
  }
  for (const p of revalidate) revalidatePath(p, "layout");
}
