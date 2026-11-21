import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, oauthStates } from "@/db/schema";
import { decrypt, encrypt, randomToken } from "../crypto";
import type { AccountCredentials, PlatformAdapter } from "./types";
import * as A from "./adapters";

/** Register new networks here. */
export const ADAPTERS: Record<string, PlatformAdapter> = {
  instagram: A.instagram,
  facebook: A.facebook,
  tiktok: A.tiktok,
  linkedin: A.linkedin,
  pinterest: A.pinterest,
  youtube: A.youtube,
  threads: A.threads,
  x: A.x,
  bluesky: A.bluesky,
  sandbox: A.sandbox,
};

/** Platforms that only produce content for the owner (no network integration). */
export const NON_NETWORK = ["newsletter", "community"];

export function adapterFor(platform: string): PlatformAdapter | undefined {
  return ADAPTERS[platform];
}

export function oauthReady(a: PlatformAdapter): boolean {
  return a.auth !== "oauth" || Boolean(a.oauth && process.env[a.oauth.clientIdEnv] && process.env[a.oauth.clientSecretEnv]);
}

const baseUrl = () => process.env.APP_URL ?? "http://localhost:3000";
const redirectUri = (platform: string) => `${baseUrl()}/api/oauth/${platform}/callback`;

export async function beginOAuth(db: Db, platform: string): Promise<string> {
  const a = ADAPTERS[platform];
  if (!a?.oauth) throw new Error(`${platform} does not use OAuth.`);
  if (!oauthReady(a)) throw new Error(`Add ${a.oauth.clientIdEnv} and ${a.oauth.clientSecretEnv} to the environment first.`);
  const state = randomToken(24);
  const verifier = a.oauth.pkce ? randomToken(48) : null;
  await db.insert(oauthStates).values({ state, platform, codeVerifier: verifier });
  const params = new URLSearchParams({
    client_id: process.env[a.oauth.clientIdEnv]!,
    redirect_uri: redirectUri(platform),
    response_type: "code",
    scope: a.oauth.scopes.join(platform === "tiktok" ? "," : " "),
    state,
    ...(a.oauth.extraAuthParams ?? {}),
  });
  if (platform === "tiktok") {
    params.set("client_key", params.get("client_id")!);
    params.delete("client_id");
  }
  if (verifier) {
    params.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
    params.set("code_challenge_method", "S256");
  }
  return `${a.oauth.authorizeUrl}?${params}`;
}

export async function completeOAuth(db: Db, platform: string, code: string, state: string) {
  const row = await db.query.oauthStates.findFirst({ where: eq(oauthStates.state, state) });
  if (!row || row.platform !== platform || Date.now() - row.createdAt.getTime() > 15 * 60_000) throw new Error("OAuth state is invalid or expired. Please try connecting again.");
  await db.delete(oauthStates).where(eq(oauthStates.state, state));
  const a = ADAPTERS[platform];
  const o = a.oauth!;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(platform),
    client_id: process.env[o.clientIdEnv]!,
    client_secret: process.env[o.clientSecretEnv]!,
  });
  if (platform === "tiktok") body.set("client_key", process.env[o.clientIdEnv]!);
  if (row.codeVerifier) body.set("code_verifier", row.codeVerifier);
  const res = await fetch(o.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: unknown };
  if (!res.ok || !tok.access_token) throw new Error(`Token exchange failed: ${JSON.stringify(tok).slice(0, 300)}`);
  const who = a.identify ? await a.identify(tok.access_token) : { externalId: "", handle: platform };
  await upsertAccount(db, platform, {
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token ?? null,
    externalId: who.externalId,
    handle: who.handle,
  }, tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null, o.scopes.join(" "));
}

export async function upsertAccount(db: Db, platform: string, c: AccountCredentials, expiresAt: Date | null, scopes?: string, mode: "live" | "sandbox" = "live") {
  const existing = await db.query.accounts.findFirst({ where: eq(accounts.platform, platform) });
  const values = {
    platform,
    handle: c.handle,
    status: "connected",
    mode,
    encryptedAccessToken: encrypt(c.accessToken),
    encryptedRefreshToken: c.refreshToken ? encrypt(c.refreshToken) : null,
    tokenExpiresAt: expiresAt,
    scopes,
    externalId: c.externalId ?? null,
    lastError: null,
    connectedAt: new Date(),
  };
  if (existing) await db.update(accounts).set(values).where(eq(accounts.id, existing.id));
  else await db.insert(accounts).values(values);
}

export function credentialsFor(acc: typeof accounts.$inferSelect): AccountCredentials {
  if (!acc.encryptedAccessToken) throw new Error(`${acc.platform} account has no stored token.`);
  return {
    accessToken: decrypt(acc.encryptedAccessToken),
    refreshToken: acc.encryptedRefreshToken ? decrypt(acc.encryptedRefreshToken) : null,
    externalId: acc.externalId,
    handle: acc.handle,
  };
}

/** Refresh OAuth tokens that expire within 24h. */
export async function refreshExpiringTokens(db: Db) {
  const rows = await db.select().from(accounts);
  for (const acc of rows) {
    const a = ADAPTERS[acc.platform];
    if (!a?.oauth || acc.mode !== "live" || !acc.tokenExpiresAt || !acc.encryptedRefreshToken) continue;
    if (acc.tokenExpiresAt.getTime() - Date.now() > 86400_000) continue;
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decrypt(acc.encryptedRefreshToken),
        client_id: process.env[a.oauth.clientIdEnv] ?? "",
        client_secret: process.env[a.oauth.clientSecretEnv] ?? "",
      });
      const res = await fetch(a.oauth.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
      const tok = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
      if (!tok.access_token) throw new Error(JSON.stringify(tok).slice(0, 200));
      await db
        .update(accounts)
        .set({
          encryptedAccessToken: encrypt(tok.access_token),
          ...(tok.refresh_token ? { encryptedRefreshToken: encrypt(tok.refresh_token) } : {}),
          tokenExpiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
          status: "connected",
          lastError: null,
        })
        .where(eq(accounts.id, acc.id));
    } catch (e) {
      await db.update(accounts).set({ status: "expired", lastError: e instanceof Error ? e.message : String(e) }).where(eq(accounts.id, acc.id));
    }
  }
}
