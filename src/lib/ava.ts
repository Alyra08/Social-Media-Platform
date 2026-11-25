import { z } from "zod";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { posts, reports } from "@/db/schema";
import { aiEnabled, normaliseUrl, structured, webResearch } from "./ai/client";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { getSetting, logActivity, notify } from "./system";
import { DEFAULT_CONTENT_TYPES, DEFAULT_PILLARS, type ContentType, type Pillar } from "./ava-defaults";

/**
 * Ava: SBF's social media caption specialist (an AI persona).
 * Every caption the studio drafts is written "as Ava": her expertise, the content pillars,
 * a rotation of content types, and her latest weekly trend briefing are added to the prompt.
 * The brand brief always wins, and nothing Ava writes is published without the owner's approval.
 */

export const AVA = {
  name: "Ava",
  role: "Social media caption specialist",
  summary:
    "Ten-plus years writing captions that get found, saved and shared. Ava writes SEO-aware, algorithm-savvy copy with original hooks and taglines in the SBF voice, rotates content pillars and formats so the feed never repeats itself, and researches platform trends and changes every week.",
};

export const AVA_PERSONA = `You are Ava, Simply Being Female's social media caption specialist, with more than ten years' experience. You write as part of the SBF team, always in the SBF brand voice from the brief.
Your craft:
- Hooks that stop the scroll in the first line, using the voice habits (specific detail, the twist, confess first, sass with a wink, leave a question). No clickbait, no engagement bait ("comment YES"), no generic openers.
- Search-aware captions: put the words women actually search for (for example "menopause at work", "making friends after 40", "how to ask for a raise") naturally in the first lines, on-screen text and alt text. Platforms are search engines now.
- Algorithm-aware: write for the signals platforms reward. Shares and sends (make it worth sending to a friend), saves (scripts, checklists, how-tos), comments (a real question at the end), watch time and completion (hook in two seconds for video), and profile visits. Follow each platform's length and hashtag norms.
- Original taglines: fresh, quotable lines in the SBF voice, never recycled slogans or trending audio lyrics.
- Variety: rotate content pillars and content types (below) so the feed stays balanced and never repeats a format back to back.
- Trends: adapt current trends only when they genuinely fit SBF, in SBF's own words. Never invent a trend, statistic or platform rule; if unsure, leave it out.
The brand brief overrides everything here.`;

/* ───────────── Editable setup (pillars, content types, extra instructions) ───────────── */

export type { Pillar, ContentType } from "./ava-defaults";
export { DEFAULT_PILLARS, DEFAULT_CONTENT_TYPES } from "./ava-defaults";
/** Kept for older imports: the default lists. Live lists come from getAvaConfig. */
export const PILLARS = DEFAULT_PILLARS;
export const CONTENT_TYPES = DEFAULT_CONTENT_TYPES;

export type AvaConfig = { pillars: Pillar[]; types: ContentType[]; instructions: string };

/** Ava's current setup as the owner has edited it (defaults until then). */
export async function getAvaConfig(db: Db): Promise<AvaConfig> {
  const [pillars, types, instructions] = await Promise.all([getSetting(db, "avaPillars"), getSetting(db, "avaContentTypes"), getSetting(db, "avaInstructions")]);
  return {
    pillars: pillars?.length ? pillars : DEFAULT_PILLARS,
    types: types?.length ? types : DEFAULT_CONTENT_TYPES,
    instructions: instructions ?? "",
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Match whatever the AI returned (key or label) to a current pillar/type key, or null. */
export function matchKey(value: string | null | undefined, list: { key: string; label: string }[]) {
  if (!value) return null;
  const v = norm(value);
  return list.find((x) => norm(x.key) === v || norm(x.label) === v)?.key ?? null;
}
export const labelFor = (k: string | null | undefined, list: { key: string; label: string }[]) => list.find((x) => x.key === k)?.label ?? null;
/** Kept for older imports (default lists). */
export const pillarLabel = (k: string | null | undefined) => labelFor(k, DEFAULT_PILLARS);
export const typeLabel = (k: string | null | undefined) => labelFor(k, DEFAULT_CONTENT_TYPES);
/** AI output fields: free text, matched to the live lists after the call. */
export const pillarEnum = z.string();
export const contentTypeEnum = z.string();

/* ───────────── Trend briefing ───────────── */

export type TrendBriefing = {
  summary: string;
  platformChanges: string[];
  formatsWorking: string[];
  conversations: string[];
  taglineAngles: string[];
  doThis: string[];
  avoid: string[];
  sources: { title: string; url: string }[];
};

/** Ava's starting briefing: the sourced trend analysis of 22 Nov 2026 (docs/trend-analysis-2026-11.md). */
export const STARTING_BRIEFING: TrendBriefing = {
  summary: "Small, warm communities are outperforming broad reach. Women are talking about money, menopause at work and midlife friendship. Carousels, searchable captions and fast replies are working.",
  platformChanges: [
    "Social platforms work as search engines: captions, on-screen text and alt text are indexed.",
    "Instagram Reels can run longer and TikTok allows 10-minute uploads; longer video is back alongside short clips.",
    "LinkedIn rewards personal, conversational posts and document carousels over corporate updates.",
  ],
  formatsWorking: ["Instagram carousels (more engagement per person reached than Reels)", "LinkedIn document carousels", "Recurring series with an inside joke or identity marker", "Short video with the hook in the first two seconds"],
  conversations: ["Equal pay and salary transparency (Equal Pay Day, Nov)", "Menopause and careers", "The midlife 'friendship recession' and choosing smaller circles", "Social wellness replacing solo self-care", "16 Days of Activism, 25 Nov to 10 Dec"],
  taglineAngles: ["The raise conversation you rehearse four times", "Making a new friend on purpose", "Nobody put it on the agenda. So we did."],
  doThis: ["Reply to comments within 24 hours", "Use the words women search for in the first line", "End with one real question", "Rotate carousel, script and question posts"],
  avoid: ["Engagement bait", "Treating awareness days as a ritual rather than action", "Quoting unverified statistics"],
  sources: [
    { title: "Sprout Social: social media trends 2026", url: "https://sproutsocial.com/insights/social-media-trends/" },
    { title: "Buffer: best content format on social platforms in 2026", url: "https://buffer.com/resources/data-best-content-format-social-media/" },
    { title: "CNBC: menopause career setbacks", url: "https://www.cnbc.com/make-it/2026/11/13/menopause-career-setbacks.html" },
    { title: "Psychology Today: the midlife friendship gap", url: "https://www.psychologytoday.com/us/blog/mental-and-sexual-health/202511/the-midlife-friendship-gap" },
    { title: "UN Women Asia-Pacific: 16 Days of Activism 2026", url: "https://asiapacific.unwomen.org/en/stories/announcement/2026/08/16-days-of-activism-2026" },
  ],
};

export async function latestBriefing(db: Db): Promise<{ briefing: TrendBriefing; date: string; isStarting: boolean }> {
  const r = await db.query.reports.findFirst({ where: eq(reports.kind, "trends"), orderBy: desc(reports.createdAt) });
  if (!r) return { briefing: STARTING_BRIEFING, date: "2026-11-22", isStarting: true };
  return { briefing: r.data as unknown as TrendBriefing, date: r.periodEnd, isStarting: false };
}

/** Pillar and type mix over the last 30 days, and which pillars are under target. */
export async function pillarBalance(db: Db, config?: AvaConfig) {
  const cfg = config ?? (await getAvaConfig(db));
  const since = new Date(Date.now() - 30 * 86400_000);
  const rows = await db.select({ pillar: posts.pillar, contentType: posts.contentType }).from(posts).where(and(isNotNull(posts.pillar), gte(posts.createdAt, since)));
  const total = rows.length;
  const pillars = cfg.pillars.map((p) => {
    const n = rows.filter((r) => r.pillar === p.key).length;
    return { ...p, n, share: total ? n / total : 0 };
  });
  const types = cfg.types.map((t) => ({ ...t, n: rows.filter((r) => r.contentType === t.key).length }));
  const under = pillars.filter((p) => p.share < p.target * 0.75).map((p) => p.label);
  return { total, pillars, types, under, recentTypes: rows.slice(-6).map((r) => r.contentType).filter(Boolean) as string[] };
}

/** Everything Ava needs in a prompt: persona, pillars, types, balance to correct, and this week's trends. */
export async function avaGuidance(db: Db): Promise<string> {
  const cfg = await getAvaConfig(db);
  const [{ briefing, date }, bal] = await Promise.all([latestBriefing(db), pillarBalance(db, cfg)]);
  return `${AVA_PERSONA}
${cfg.instructions.trim() ? `\nTHE OWNER'S OWN INSTRUCTIONS FOR AVA (follow these unless they break the brand brief):\n${cfg.instructions.trim()}\n` : ""}
CONTENT PILLARS (tag every post with one key from this list; keep the mix balanced):
${cfg.pillars.map((p) => `- ${p.key}: ${p.label}. ${p.about} Target about ${Math.round(p.target * 100)}%.`).join("\n")}
${bal.total ? `Last 30 days: ${bal.pillars.map((p) => `${p.label} ${Math.round(p.share * 100)}%`).join(", ")}.${bal.under.length ? ` Under-used, favour these where they fit: ${bal.under.join(", ")}.` : ""}` : "No tagged posts yet: spread across pillars."}

CONTENT TYPES (tag every post with one key from this list; vary them and don't repeat the last few: ${bal.recentTypes.join(", ") || "none yet"}):
${cfg.types.map((t) => `- ${t.key}: ${t.label} (best for ${t.best})`).join("\n")}

THIS WEEK'S TREND BRIEFING (${date}). Use only where it genuinely fits SBF:
${briefing.summary}
Platform changes: ${briefing.platformChanges.join(" | ")}
Formats working: ${briefing.formatsWorking.join(" | ")}
Conversations: ${briefing.conversations.join(" | ")}
Tagline angles: ${briefing.taglineAngles.join(" | ")}
Do: ${briefing.doThis.join(" | ")}
Avoid: ${briefing.avoid.join(" | ")}`;
}

/* ───────────── Weekly research ───────────── */

const Briefing = z.object({
  summary: z.string(),
  platformChanges: z.array(z.string()).max(8),
  formatsWorking: z.array(z.string()).max(8),
  conversations: z.array(z.string()).max(8),
  taglineAngles: z.array(z.string()).max(8),
  doThis: z.array(z.string()).max(8),
  avoid: z.array(z.string()).max(6),
  sourceUrls: z.array(z.string()).max(20),
});

/** Weekly job: Ava researches platform changes and trends, and the briefing feeds every draft after it. */
export async function runAvaTrendResearch(db: Db) {
  if (!aiEnabled()) {
    await logActivity(db, "ava:trends", "skipped", "Needs the Anthropic key. Ava is using her starting briefing.");
    return { skipped: true };
  }
  const { notes, hits } = await webResearch({
    system: `${SBF_BRAND_BRIEF}\n\n${AVA_PERSONA}`,
    prompt: `Research the last 7 days for Simply Being Female's social media (audience: women 28 to 55, Australia first, then UK/US). Find:
1. Platform and algorithm changes announced or widely reported (Instagram, TikTok, Facebook, LinkedIn, Pinterest, Threads, X, Bluesky, YouTube): ranking signals, new features, length or hashtag changes.
2. Formats and content types performing well right now, with evidence.
3. Conversations and trends women in this audience are engaging with, and upcoming awareness dates in the next four weeks.
4. Tagline and hook angles SBF could use in its own voice.
Prefer primary sources (platform announcements, reputable reports). Note dates. Do not speculate.`,
    maxSearches: 15,
    effort: "high",
  });
  const known = new Set(hits.map((h) => normaliseUrl(h.url)));
  const b = await structured({
    schema: Briefing,
    system: `${SBF_BRAND_BRIEF}\n\n${AVA_PERSONA}`,
    task: "Turn these research notes into Ava's weekly trend briefing for the content team. Short, specific bullets. Only include what the notes support. sourceUrls must be URLs that appear in the notes.",
    input: notes,
    effort: "medium",
    maxTokens: 6000,
  });
  const sources = b.sourceUrls
    .filter((u) => known.has(normaliseUrl(u)))
    .map((u) => ({ url: u, title: hits.find((h) => normaliseUrl(h.url) === normaliseUrl(u))?.title ?? u }));
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const briefing: TrendBriefing = { summary: b.summary, platformChanges: b.platformChanges, formatsWorking: b.formatsWorking, conversations: b.conversations, taglineAngles: b.taglineAngles, doThis: b.doThis, avoid: b.avoid, sources };
  await db.insert(reports).values({ kind: "trends", periodStart: weekAgo, periodEnd: today, title: `Ava's trend briefing, week to ${today}`, data: briefing as unknown as Record<string, unknown> });
  await logActivity(db, "ava:trends", "ok", `${briefing.platformChanges.length} platform changes, ${briefing.conversations.length} conversations, ${sources.length} verified sources`);
  await notify(db, "report_ready", "Ava's weekly trend briefing is ready", briefing.summary, "/ava");
  return { ok: true };
}

/** Fallback pillar for drafts made without AI (demo mode), from the research category. */
export function pillarForCategory(category: string, pillars: Pillar[] = DEFAULT_PILLARS): string | null {
  const guess = ({ "social-issues": "now-is-our-time", relationships: "say-it-out-loud", motherhood: "say-it-out-loud", confidence: "practical-courage", humour: "dry-wit", "positive-stories": "good-news" } as Record<string, string>)[category];
  if (guess && pillars.some((p) => p.key === guess)) return guess;
  return pillars[0]?.key ?? null;
}
