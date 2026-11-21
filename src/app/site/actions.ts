"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { subscribe } from "@/lib/newsletter";
import { rsvp } from "@/lib/events";

/**
 * Public form handlers. No login. Protected by a hidden honeypot field and a per-visitor limit
 * (10 submissions per 10 minutes). Results come back as a status in the URL, never as raw errors.
 */
const hits = new Map<string, number[]>();

async function allowed(kind: string): Promise<boolean> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local").trim();
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 10) return false;
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 10 * 60_000)) hits.delete(k);
  return true;
}

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Only same-site relative paths are accepted as the return address. */
function back(f: FormData, fallback: string): string {
  const to = s(f, "back");
  return /^\/site(\/[\w\-/]*)?$/.test(to) ? to : fallback;
}

export async function subscribeAction(f: FormData) {
  const to = back(f, "/site/newsletter");
  let status = "pending";
  if (s(f, "website")) status = "pending"; // honeypot filled: pretend success, store nothing
  else if (!(await allowed("subscribe"))) status = "slow";
  else {
    try {
      status = await subscribe(await getDb(), { email: s(f, "email"), name: s(f, "name") || null, source: s(f, "source") || "website" });
    } catch {
      status = "invalid";
    }
  }
  redirect(`${to}?signup=${status}#signup`);
}

export async function rsvpAction(f: FormData) {
  const slug = s(f, "slug");
  const to = `/site/events/${encodeURIComponent(slug)}`;
  let status = "going";
  if (s(f, "website")) status = "going";
  else if (!(await allowed("rsvp"))) status = "slow";
  else {
    try {
      const r = await rsvp(await getDb(), { slug, name: s(f, "name"), email: s(f, "email") });
      status = r.already ? `already-${r.status}` : r.status;
    } catch (e) {
      status = e instanceof Error && /started|isn't taking/.test(e.message) ? "closed" : "invalid";
    }
  }
  redirect(`${to}?rsvp=${status}#rsvp`);
}
