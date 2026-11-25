import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { activityLog, auditLog, notifications, settings } from "@/db/schema";
import { DEFAULT_CONTENT_TYPES, DEFAULT_PILLARS, type ContentType, type Pillar } from "./ava-defaults";

export type Actor = { id?: string | null; email: string; role?: string };
export const SYSTEM: Actor = { id: null, email: "system", role: "system" };

export async function logActivity(db: Db, job: string, status: "started" | "ok" | "failed" | "skipped", detail?: string) {
  await db.insert(activityLog).values({ job, status, detail: detail?.slice(0, 4000) });
}

export async function audit(db: Db, actor: Actor, action: string, subjectType: string, subjectId?: string | null, detail?: string) {
  await db.insert(auditLog).values({
    userId: actor.id ?? null,
    actor: actor.email,
    action,
    subjectType,
    subjectId: subjectId ?? null,
    detail,
  });
}

export type NotificationKind =
  | "research_ready"
  | "breaking_story"
  | "brief_ready"
  | "content_awaiting"
  | "design_awaiting"
  | "post_scheduled"
  | "post_published"
  | "publish_failed"
  | "manual_publish_needed"
  | "interaction"
  | "report_ready"
  | "system";

const ATTENTION: NotificationKind[] = [
  "breaking_story",
  "content_awaiting",
  "design_awaiting",
  "publish_failed",
  "manual_publish_needed",
  "interaction",
  "research_ready",
  "brief_ready",
];

export async function notify(db: Db, kind: NotificationKind, title: string, body?: string, link?: string) {
  const prefs = await getSetting(db, "notificationPreferences", DEFAULT_SETTINGS.notificationPreferences);
  if (prefs[kind] === false) return;
  await db.insert(notifications).values({ kind, title, body, link, requiresAttention: ATTENTION.includes(kind) });
}

export const DEFAULT_SETTINGS = {
  timezone: "Australia/Brisbane",
  researchCron: "0 6 * * *",
  breakingCheckCron: "0 9,12,15,18 * * *",
  publishCheckCron: "* * * * *",
  maxPostsPerDayPerPlatform: 2,
  minHoursBetweenSimilarTopics: 48,
  autoReplyEnabled: false, // must be explicitly enabled by the owner
  autoReplyCategories: ["positive"] as string[],
  aiModel: "claude-opus-5-5",
  storiesPerRun: 10,
  editorialBalance: {
    "social-issues": 30,
    relationships: 20,
    motherhood: 15,
    confidence: 15,
    humour: 10,
    "positive-stories": 10,
  } as Record<string, number>,
  notificationPreferences: {} as Partial<Record<NotificationKind, boolean>>,
  automationEnabled: true,
  // Ava, the caption specialist: all editable on Ava's page.
  avaPillars: DEFAULT_PILLARS as Pillar[],
  avaContentTypes: DEFAULT_CONTENT_TYPES as ContentType[],
  avaInstructions: "" as string,
};
export type Settings = typeof DEFAULT_SETTINGS;

export async function getSetting<K extends keyof Settings>(db: Db, key: K, fallback?: Settings[K]): Promise<Settings[K]> {
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return (row?.value as Settings[K]) ?? fallback ?? DEFAULT_SETTINGS[key];
}

export async function getAllSettings(db: Db): Promise<Settings> {
  const rows = await db.select().from(settings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) out[r.key] = r.value;
  return out as Settings;
}

export async function setSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
