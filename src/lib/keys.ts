import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appSecrets } from "@/db/schema";
import { decrypt, encrypt } from "./crypto";
import { audit, type Actor } from "./system";

/**
 * Keys and connection settings the owner can add later, in Settings → Keys and connections,
 * without editing .env.local or restarting. Values are encrypted (AES-256-GCM, ENCRYPTION_KEY)
 * and copied into process.env so every integration picks them up. A key saved in the app wins
 * over the same key in .env.local; removing it in the app falls back to the .env.local value.
 */
export type KeyDef = {
  name: string;
  label: string;
  group: string;
  secret: boolean;
  help: string;
  placeholder?: string;
};

export const KEY_GROUPS: { id: string; title: string; intro: string }[] = [
  { id: "ai", title: "AI", intro: "Turns off demo mode: live research, briefs, captions, article drafts, design feedback, inbox triage and reports. Charged per use." },
  { id: "web", title: "Web address", intro: "Needed once the studio is hosted. Social networks and Canva send you back to this address after you sign in, and fetch approved images from it." },
  { id: "email", title: "Email (Sunday note and event confirmations)", intro: "Sends newsletter confirmations, the Sunday note and RSVP confirmations through Resend. Until it's added, sign-ups are collected and you can export the list." },
  { id: "canva", title: "Canva", intro: "Open any post's design in Canva, edit it there, then bring it back for approval. Create an integration at canva.com/developers." },
  { id: "social", title: "Social networks", intro: "Add the developer app for each network you plan to post to. Each one then shows Connect in Integrations." },
];

export const KEYS: KeyDef[] = [
  { name: "ANTHROPIC_API_KEY", label: "Anthropic API key", group: "ai", secret: true, help: "console.anthropic.com → API keys.", placeholder: "sk-ant-…" },

  { name: "APP_URL", label: "Studio address", group: "web", secret: false, help: "The public HTTPS address of this studio, e.g. https://studio.simplybeingfemale.com", placeholder: "https://…" },
  { name: "PUBLIC_BASE_URL", label: "Public image address", group: "web", secret: false, help: "Usually the same as the studio address. Networks fetch approved images from here.", placeholder: "https://…" },
  { name: "SITE_URL", label: "Website address", group: "web", secret: false, help: "Where the public website lives. Used in emails, the sitemap and share links. Defaults to the studio address + /site.", placeholder: "https://simplybeingfemale.com" },

  { name: "RESEND_API_KEY", label: "Resend API key", group: "email", secret: true, help: "resend.com → API keys. Verify your sending domain there first.", placeholder: "re_…" },
  { name: "NEWSLETTER_FROM", label: "Send emails from", group: "email", secret: false, help: "A name and address on your verified domain.", placeholder: "Simply Being Female <hello@simplybeingfemale.com>" },

  { name: "CANVA_CLIENT_ID", label: "Canva client ID", group: "canva", secret: false, help: "canva.com/developers → Your integrations. Set the redirect URL to <studio address>/api/oauth/canva/callback." },
  { name: "CANVA_CLIENT_SECRET", label: "Canva client secret", group: "canva", secret: true, help: "Shown once when you generate it." },

  { name: "META_APP_ID", label: "Meta app ID (Instagram + Facebook)", group: "social", secret: false, help: "developers.facebook.com" },
  { name: "META_APP_SECRET", label: "Meta app secret", group: "social", secret: true, help: "" },
  { name: "THREADS_APP_ID", label: "Threads app ID", group: "social", secret: false, help: "Same Meta developer site, Threads use case." },
  { name: "THREADS_APP_SECRET", label: "Threads app secret", group: "social", secret: true, help: "" },
  { name: "LINKEDIN_CLIENT_ID", label: "LinkedIn client ID", group: "social", secret: false, help: "linkedin.com/developers" },
  { name: "LINKEDIN_CLIENT_SECRET", label: "LinkedIn client secret", group: "social", secret: true, help: "" },
  { name: "LINKEDIN_ORGANIZATION_URN", label: "LinkedIn company page URN", group: "social", secret: false, help: "urn:li:organization:<id>, to post as the SBF page." },
  { name: "X_CLIENT_ID", label: "X client ID", group: "social", secret: false, help: "developer.x.com (posting needs a paid plan)" },
  { name: "X_CLIENT_SECRET", label: "X client secret", group: "social", secret: true, help: "" },
  { name: "PINTEREST_APP_ID", label: "Pinterest app ID", group: "social", secret: false, help: "developers.pinterest.com" },
  { name: "PINTEREST_APP_SECRET", label: "Pinterest app secret", group: "social", secret: true, help: "" },
  { name: "PINTEREST_BOARD_ID", label: "Pinterest board ID", group: "social", secret: false, help: "The board new pins go to." },
  { name: "TIKTOK_CLIENT_KEY", label: "TikTok client key", group: "social", secret: false, help: "developers.tiktok.com" },
  { name: "TIKTOK_CLIENT_SECRET", label: "TikTok client secret", group: "social", secret: true, help: "" },
  { name: "GOOGLE_CLIENT_ID", label: "Google client ID (YouTube)", group: "social", secret: false, help: "console.cloud.google.com, with YouTube Data API v3 turned on." },
  { name: "GOOGLE_CLIENT_SECRET", label: "Google client secret", group: "social", secret: true, help: "" },
];

const BY_NAME = new Map(KEYS.map((k) => [k.name, k]));
export const isManagedKey = (name: string) => BY_NAME.has(name);

/** Values from .env.local as they were at startup, so removing an in-app key restores them. */
const g = globalThis as unknown as { __sbfEnvSnapshot?: Record<string, string | undefined>; __sbfKeysLoadedAt?: number; __sbfKeysInApp?: Set<string> };
function envSnapshot(): Record<string, string | undefined> {
  if (!g.__sbfEnvSnapshot) g.__sbfEnvSnapshot = Object.fromEntries(KEYS.map((k) => [k.name, process.env[k.name]]));
  return g.__sbfEnvSnapshot;
}
function inApp(): Set<string> {
  if (!g.__sbfKeysInApp) g.__sbfKeysInApp = new Set();
  return g.__sbfKeysInApp;
}

function applyToEnv(name: string, value: string | undefined) {
  if (value === undefined || value === "") delete process.env[name];
  else process.env[name] = value;
}

/** Copy in-app keys into process.env. Called when the database opens, then at most once a minute. */
export async function loadKeys(db: Db, opts: { force?: boolean } = {}) {
  if (!opts.force && g.__sbfKeysLoadedAt && Date.now() - g.__sbfKeysLoadedAt < 60_000) return;
  g.__sbfKeysLoadedAt = Date.now();
  const snap = envSnapshot();
  if (!process.env.ENCRYPTION_KEY) return;
  const rows = await db.select().from(appSecrets);
  const seen = new Set<string>();
  for (const r of rows) {
    if (!isManagedKey(r.name)) continue;
    try {
      applyToEnv(r.name, decrypt(r.encryptedValue));
      seen.add(r.name);
    } catch {
      // Encrypted with a different ENCRYPTION_KEY: ignore rather than break startup.
    }
  }
  // A key removed in the app (possibly on another instance) falls back to .env.local.
  for (const name of inApp()) if (!seen.has(name)) applyToEnv(name, snap[name]);
  g.__sbfKeysInApp = seen;
}

export type KeyStatus = KeyDef & { source: "app" | "env" | "none"; display: string | null };

const mask = (v: string) => (v.length <= 8 ? "••••" : `••••${v.slice(-4)}`);

export async function keyStatuses(db: Db): Promise<KeyStatus[]> {
  const rows = await db.select({ name: appSecrets.name }).from(appSecrets);
  const saved = new Set(rows.map((r) => r.name));
  const snap = envSnapshot();
  return KEYS.map((k) => {
    const value = process.env[k.name];
    const source = saved.has(k.name) ? "app" : snap[k.name] ? "env" : "none";
    return { ...k, source, display: value ? (k.secret ? mask(value) : value) : null };
  });
}

function validate(def: KeyDef, value: string) {
  if (value.length > 4000) throw new Error(`${def.label} is too long.`);
  if (/\s/.test(value) && def.name !== "NEWSLETTER_FROM") throw new Error(`${def.label} can't contain spaces. Check you copied only the key.`);
  if (["APP_URL", "PUBLIC_BASE_URL", "SITE_URL"].includes(def.name)) {
    let u: URL;
    try {
      u = new URL(value);
    } catch {
      throw new Error(`${def.label} must be a full address starting with https://`);
    }
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw new Error(`${def.label} must start with https://`);
  }
  if (def.name === "NEWSLETTER_FROM" && !/@[^\s>]+\.[^\s>]+/.test(value)) throw new Error("Send emails from needs an email address, e.g. Simply Being Female <hello@yourdomain.com>");
}

export async function saveKey(db: Db, actor: Actor, name: string, raw: string) {
  const def = BY_NAME.get(name);
  if (!def) throw new Error("That isn't a key the studio knows about.");
  const trimmed = raw.trim();
  const stored = def.name.endsWith("_URL") ? trimmed.replace(/\/+$/, "") : trimmed;
  if (!stored) throw new Error(`Paste the ${def.label} first.`);
  validate(def, stored);
  envSnapshot();
  const encryptedValue = encrypt(stored);
  await db
    .insert(appSecrets)
    .values({ name, encryptedValue, updatedBy: actor.email })
    .onConflictDoUpdate({ target: appSecrets.name, set: { encryptedValue, updatedBy: actor.email, updatedAt: new Date() } });
  applyToEnv(name, stored);
  inApp().add(name);
  // Never log the value itself.
  await audit(db, actor, "key.save", "key", name, def.label);
}

export async function removeKey(db: Db, actor: Actor, name: string) {
  const def = BY_NAME.get(name);
  if (!def) throw new Error("That isn't a key the studio knows about.");
  await db.delete(appSecrets).where(eq(appSecrets.name, name));
  applyToEnv(name, envSnapshot()[name]);
  inApp().delete(name);
  await audit(db, actor, "key.remove", "key", name, def.label);
}

/* Internal encrypted values (e.g. the connected Canva account's tokens). Not shown in Settings. */
export async function getInternalSecret(db: Db, name: string): Promise<string | null> {
  const row = await db.query.appSecrets.findFirst({ where: eq(appSecrets.name, `__${name}`) });
  if (!row) return null;
  try {
    return decrypt(row.encryptedValue);
  } catch {
    return null;
  }
}
export async function setInternalSecret(db: Db, name: string, value: string | null) {
  const key = `__${name}`;
  if (value === null) {
    await db.delete(appSecrets).where(eq(appSecrets.name, key));
    return;
  }
  const encryptedValue = encrypt(value);
  await db
    .insert(appSecrets)
    .values({ name: key, encryptedValue, updatedBy: "system" })
    .onConflictDoUpdate({ target: appSecrets.name, set: { encryptedValue, updatedAt: new Date() } });
}
