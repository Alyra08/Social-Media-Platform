import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { designs, oauthStates, posts } from "@/db/schema";
import { randomToken } from "./crypto";
import { getInternalSecret, setInternalSecret } from "./keys";
import { designPng } from "./design/png";
import { DESIGN_FORMATS } from "./design/render";
import { writeBytes } from "./files";
import { audit, logActivity, notify, type Actor } from "./system";

/**
 * Canva Connect (https://www.canva.dev/docs/connect/). Open a post's design in Canva, edit it
 * there, then bring the finished PNG back into the studio, where it goes through design approval
 * like any other design. Needs CANVA_CLIENT_ID and CANVA_CLIENT_SECRET (Settings → Keys).
 */
export class CanvaError extends Error {}

const AUTHORIZE_URL = "https://www.canva.com/api/oauth/authorize";
const API = "https://api.canva.com/rest/v1";
export const CANVA_SCOPES = ["design:content:read", "design:content:write", "design:meta:read", "asset:read", "asset:write", "profile:read"];

type Tokens = { access: string; refresh: string; expiresAt: number; name?: string };

export const canvaConfigured = () => Boolean(process.env.CANVA_CLIENT_ID && process.env.CANVA_CLIENT_SECRET);
const redirectUri = () => `${(process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "")}/api/oauth/canva/callback`;
const basicAuth = () => `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString("base64")}`;

async function readTokens(db: Db): Promise<Tokens | null> {
  const raw = await getInternalSecret(db, "canva_tokens");
  return raw ? (JSON.parse(raw) as Tokens) : null;
}
const writeTokens = (db: Db, t: Tokens | null) => setInternalSecret(db, "canva_tokens", t ? JSON.stringify(t) : null);

export async function canvaStatus(db: Db): Promise<{ configured: boolean; connected: boolean; name?: string }> {
  const t = await readTokens(db);
  return { configured: canvaConfigured(), connected: Boolean(t), name: t?.name };
}

export async function beginCanvaAuth(db: Db): Promise<string> {
  if (!canvaConfigured()) throw new CanvaError("Add the Canva client ID and secret in Settings → Keys and connections first.");
  const state = randomToken(24);
  const verifier = randomToken(48);
  await db.insert(oauthStates).values({ state, platform: "canva", codeVerifier: verifier });
  const params = new URLSearchParams({
    client_id: process.env.CANVA_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: CANVA_SCOPES.join(" "),
    state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE_URL}?${params}`;
}

async function tokenRequest(body: URLSearchParams): Promise<Tokens> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; message?: string };
  if (!res.ok || !j.access_token || !j.refresh_token) throw new CanvaError(`Canva sign-in failed: ${j.error_description ?? j.message ?? res.status}`);
  return { access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 14400) * 1000 };
}

export async function completeCanvaAuth(db: Db, code: string, state: string) {
  const row = await db.query.oauthStates.findFirst({ where: eq(oauthStates.state, state) });
  if (!row || row.platform !== "canva" || Date.now() - row.createdAt.getTime() > 15 * 60_000) throw new CanvaError("The Canva sign-in link expired. Please connect again.");
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  const t = await tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: row.codeVerifier ?? "", redirect_uri: redirectUri() }));
  await writeTokens(db, t);
  try {
    const me = await canvaFetch<{ profile?: { display_name?: string } }>(db, "/users/me/profile");
    if (me.profile?.display_name) await writeTokens(db, { ...t, name: me.profile.display_name });
  } catch {
    // Name is a nicety only.
  }
}

export async function disconnectCanva(db: Db, actor: Actor) {
  await writeTokens(db, null);
  await audit(db, actor, "canva.disconnect", "integration", null, "canva");
}

async function accessToken(db: Db): Promise<string> {
  const t = await readTokens(db);
  if (!t) throw new CanvaError("Connect your Canva account first (Integrations → Canva).");
  if (t.expiresAt - Date.now() > 120_000) return t.access;
  if (!canvaConfigured()) throw new CanvaError("The Canva keys were removed. Add them again in Settings.");
  try {
    // Canva rotates refresh tokens: always store the new pair.
    const next = await tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh }));
    await writeTokens(db, { ...next, name: t.name });
    return next.access;
  } catch (e) {
    await writeTokens(db, null);
    throw new CanvaError(`Canva needs reconnecting: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function canvaFetch<T>(db: Db, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${await accessToken(db)}`, ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { message?: string; code?: string };
  if (!res.ok) throw new CanvaError(`Canva: ${j.message ?? j.code ?? `request failed (${res.status})`}`);
  return j;
}

async function poll<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  let delay = 800;
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new CanvaError("Canva is taking longer than usual. Try again in a minute.");
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 4000);
  }
}

type Job<X> = { job: { id: string; status: "in_progress" | "success" | "failed"; error?: { message?: string } } & X };

async function uploadAsset(db: Db, name: string, bytes: Buffer): Promise<string> {
  const start = await canvaFetch<Job<{ asset?: { id: string } }>>(db, "/asset-uploads", {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream", "Asset-Upload-Metadata": JSON.stringify({ name_base64: Buffer.from(name.slice(0, 50)).toString("base64") }) },
    body: new Uint8Array(bytes),
  });
  const done = await poll(() => canvaFetch<Job<{ asset?: { id: string } }>>(db, `/asset-uploads/${start.job.id}`), (j) => j.job.status !== "in_progress");
  if (done.job.status !== "success" || !done.job.asset) throw new CanvaError(`Canva couldn't take the image: ${done.job.error?.message ?? "upload failed"}`);
  return done.job.asset.id;
}

/**
 * Create a Canva design for a post at the right size. With `fromDesignId`, the studio's design is
 * placed in it as a starting point. Returns the Canva edit link.
 */
export async function openInCanva(db: Db, actor: Actor, postId: string, opts: { fromDesignId?: string; format?: string } = {}): Promise<string> {
  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) throw new CanvaError("Post not found.");
  if (post.status !== "awaiting_design") throw new CanvaError("Designs can be made in Canva while the post is awaiting design approval.");
  const from = opts.fromDesignId ? await db.query.designs.findFirst({ where: eq(designs.id, opts.fromDesignId) }) : null;
  const format = from?.format ?? opts.format ?? "ig_square";
  const dims = DESIGN_FORMATS[format] ?? DESIGN_FORMATS.ig_square;
  let assetId: string | undefined;
  if (from) {
    const { bytes } = await designPng(db, from.id);
    assetId = await uploadAsset(db, `SBF ${post.hook}`.slice(0, 50), bytes);
  }
  const created = await canvaFetch<{ design: { id: string; urls: { edit_url: string; view_url: string } } }>(db, "/designs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ design_type: { type: "custom", width: dims.w, height: dims.h }, title: `SBF · ${post.hook}`.slice(0, 255), ...(assetId ? { asset_id: assetId } : {}) }),
  });
  await db.insert(designs).values({
    postId,
    format,
    width: dims.w,
    height: dims.h,
    source: "canva",
    status: "in_canva",
    parentId: from?.id ?? null,
    canvaDesignId: created.design.id,
    canvaEditUrl: created.design.urls.edit_url,
  });
  await audit(db, actor, "canva.open", "post", postId, created.design.id);
  return created.design.urls.edit_url;
}

/** Export the Canva design as PNG and put it into design approval. */
export async function importFromCanva(db: Db, actor: Actor, designId: string) {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.canvaDesignId) throw new CanvaError("This design isn't linked to Canva.");
  const post = d.postId ? await db.query.posts.findFirst({ where: eq(posts.id, d.postId) }) : null;
  if (!post || post.status !== "awaiting_design") throw new CanvaError("The post is no longer awaiting design approval.");
  const start = await canvaFetch<Job<{ urls?: string[] }>>(db, "/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ design_id: d.canvaDesignId, format: { type: "png", width: d.width, height: d.height, pages: [1] } }),
  });
  const done = await poll(() => canvaFetch<Job<{ urls?: string[] }>>(db, `/exports/${start.job.id}`), (j) => j.job.status !== "in_progress", 120_000);
  if (done.job.status !== "success" || !done.job.urls?.length) throw new CanvaError(`Canva export failed: ${done.job.error?.message ?? "no file returned"}`);
  const url = done.job.urls[0];
  if (!/^https:\/\/[^/]*\.(canva\.com|cloudfront\.net|amazonaws\.com)\//.test(url) && !url.startsWith("https://")) throw new CanvaError("Canva returned an unexpected download link.");
  const res = await fetch(url);
  if (!res.ok) throw new CanvaError(`Couldn't download the export from Canva (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.subarray(0, 4).toString("hex") !== "89504e47") throw new CanvaError("Canva's export wasn't a PNG.");
  const rel = `${new Date().toISOString().slice(0, 7)}/canva-${crypto.randomUUID()}.png`;
  writeBytes(rel, bytes);
  await db.update(designs).set({ uploadPath: rel, uploadMime: "image/png", svg: null, status: "proposed", feedback: null }).where(eq(designs.id, d.id));
  await audit(db, actor, "canva.import", "design", d.id, d.canvaDesignId);
  await logActivity(db, "canva:import", "ok", post.hook);
  await notify(db, "design_awaiting", `Canva design ready to approve: ${post.hook}`, undefined, `/design?post=${post.id}`);
}

/** Bring a design that was already imported back into Canva for more changes. */
export async function reopenInCanva(db: Db, actor: Actor, designId: string): Promise<string> {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.canvaEditUrl) throw new CanvaError("This design isn't linked to Canva.");
  if (d.status === "approved") throw new CanvaError("This design is approved. Open a new copy in Canva instead.");
  await db.update(designs).set({ status: "in_canva" }).where(eq(designs.id, d.id));
  await audit(db, actor, "canva.reopen", "design", d.id);
  return d.canvaEditUrl;
}
