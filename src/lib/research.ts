import { z } from "zod";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { researchRuns, stories, topics } from "@/db/schema";
import { aiEnabled, normaliseUrl, structured, webResearch, type SearchHit } from "./ai/client";
import { SBF_BRAND_BRIEF, RESEARCH_AREAS, CATEGORY_LABELS } from "./brand/brief";
import { learnedGuidance } from "./learning";
import { logActivity, notify } from "./system";
import { demoStories } from "./demo";

const StorySchema = z.object({
  topicKey: z.string().describe("short kebab-case key for the underlying issue, stable across days, e.g. 'au-gender-pay-gap-wgea'"),
  meaningfulDevelopment: z.boolean().describe("true if this is a genuinely new development on a topic listed as already covered"),
  category: z.enum(["social-issues", "relationships", "motherhood", "confidence", "humour", "positive-stories"]),
  headline: z.string(),
  overview: z.string(),
  whyItMatters: z.string().describe("why this matters to women"),
  whyRelevantToSbf: z.string(),
  keyStats: z.array(z.object({ statement: z.string(), sourceUrl: z.string() })).describe("only figures stated in the cited source; empty if none"),
  sourceUrl: z.string().describe("the original source URL, exactly as returned by web search"),
  sourceOrganisation: z.string(),
  publishedAt: z.string().describe("publication date of the source, YYYY-MM-DD, or 'unknown'"),
  eventDate: z.string().describe("when the underlying event occurred, YYYY-MM-DD or a short description, or 'unknown'"),
  supportingSources: z.array(z.object({ title: z.string(), url: z.string(), organisation: z.string() })),
  region: z.enum(["australian", "international", "global"]),
  regionalDifferences: z.string().describe("differences between Australian, UK, US and other experiences, or empty"),
  trending: z.boolean(),
  momentum: z.enum(["new", "rising", "steady", "renewed"]),
  verification: z.enum(["confirmed", "developing", "unverified"]),
  factsVsOpinion: z.string().describe("what is confirmed fact vs opinion/commentary"),
  conflictingReports: z.string().describe("conflicting reports, or empty"),
  suggestedAngle: z.string(),
  socialOpportunities: z.array(z.string()),
  audienceInterest: z.enum(["low", "medium", "high"]),
  suggestedArticleHeadline: z.string(),
  scoreBreakdown: z.object({
    relevance: z.number().int().min(0).max(100),
    momentum: z.number().int().min(0).max(100),
    significance: z.number().int().min(0).max(100),
    audience: z.number().int().min(0).max(100),
    discussion: z.number().int().min(0).max(100),
    originality: z.number().int().min(0).max(100),
    brandAlignment: z.number().int().min(0).max(100),
  }),
  scoreExplanation: z.string(),
});
const StoriesSchema = z.object({ stories: z.array(StorySchema) });
export type ResearchedStory = z.infer<typeof StorySchema>;

/** Weighted relevance score (1–100) from the seven criteria in §6. */
export function relevanceScore(b: ResearchedStory["scoreBreakdown"]): number {
  const w = { relevance: 0.22, momentum: 0.14, significance: 0.16, audience: 0.16, discussion: 0.12, originality: 0.08, brandAlignment: 0.12 };
  const s = Object.entries(w).reduce((acc, [k, wt]) => acc + (b[k as keyof typeof b] ?? 0) * wt, 0);
  return Math.max(1, Math.min(100, Math.round(s)));
}

const RESEARCH_SYSTEM = `${SBF_BRAND_BRIEF}

---
You are now acting as the Simply Being Female research desk. Your job is to find what women are actually experiencing, discussing, questioning and responding to right now — beyond mainstream headlines.

Research rules (non-negotiable):
- Verify the original publication date and, separately, when the underlying event occurred. A story being newly reported is not the same as an event newly occurring.
- Always cite the original source URL exactly as returned by the search tool. Never invent URLs, statistics, quotations or research findings.
- Cross-reference important claims with a second source where possible. Distinguish confirmed fact from opinion. Note conflicting reports. Flag developing or unverified information.
- Prioritise Australian issues while keeping an international perspective; note differences between Australian, British, American and other experiences where relevant.
- Use a broad range of reliable sources: Australian and international news, government and official statistics (e.g. ABS, WGEA, AIHW), academic research, universities, advocacy and non-profit organisations, industry reports, public trend data, and publicly accessible Reddit and social discussions. Do not rely only on mainstream media.
- Never name or quote celebrities in SBF-facing angles.`;

export async function runResearch(db: Db, kind: "daily" | "breaking" | "more_research" = "daily", focus?: string): Promise<{ runId: string; added: number; mode: "ai" | "demo" }> {
  const mode = aiEnabled() ? "ai" : "demo";
  const [run] = await db.insert(researchRuns).values({ kind, mode, status: "running" }).returning();
  await logActivity(db, `research:${kind}`, "started", `mode=${mode}${focus ? ` focus=${focus}` : ""}`);

  try {
    const recentTopics = await db.select().from(topics).where(gte(topics.lastSeen, new Date(Date.now() - 30 * 86400_000))).orderBy(desc(topics.lastSeen)).limit(80);
    const recentUrls = new Set(
      (await db.select({ u: stories.sourceUrl }).from(stories).where(gte(stories.createdAt, new Date(Date.now() - 60 * 86400_000)))).map((r) => normaliseUrl(r.u)),
    );

    let found: ResearchedStory[];
    let hits: SearchHit[] = [];
    if (mode === "ai") {
      const guidance = await learnedGuidance(db, ["editorial", "audience"]);
      const today = new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "full" });
      const areas = RESEARCH_AREAS.map((a) => `${a.code}. ${a.name}: ${a.topics.join("; ")}`).join("\n");
      const covered = recentTopics.map((t) => `${t.key} (${t.label}; seen ${t.mentions}x, covered ${t.timesCovered}x)`).join("\n") || "none yet";
      const prompt =
        kind === "breaking"
          ? `Today is ${today} (Brisbane). Check for significant BREAKING developments, viral conversations or emerging issues affecting women in the last 24 hours only. Report only genuinely significant items.\n\nAlready-known topics:\n${covered}`
          : kind === "more_research"
            ? `Today is ${today}. Do deeper research on this story and find additional, independent, primary sources, updated figures, differing perspectives and any conflicting reports:\n${focus}`
            : `Today is ${today} (Brisbane). Conduct the daily SBF research sweep across these areas, and add any emerging area you discover:\n${areas}\n\nTopics already identified in the last 30 days (avoid repeating them unless there is a meaningful development; note renewed attention or sentiment change):\n${covered}\n\n${guidance}\n\nSearch widely (news, government statistics, research, advocacy organisations, Reddit and public social conversations, trend data). Then write research notes for the 12–15 most relevant and interesting stories, each with its source URLs, dates, key figures as stated in the source, and your assessment.`;
      const research = await webResearch({ system: RESEARCH_SYSTEM, prompt, maxSearches: kind === "daily" ? 25 : 10 });
      hits = research.hits;
      const allowed = hits.map((h) => `${h.url}${h.pageAge ? ` (page age: ${h.pageAge})` : ""} — ${h.title}`).join("\n");
      const parsed = await structured({
        schema: StoriesSchema,
        system: RESEARCH_SYSTEM,
        task:
          "Convert the research notes into structured story cards for the Daily News Approval Centre. Use ONLY URLs from the allowed list. Only include statistics that the notes attribute to a listed source. If a date is unknown, say 'unknown'. Score honestly; explain the score in 1–2 sentences. Category must be one of: " +
          Object.entries(CATEGORY_LABELS).map(([k, v]) => `${k} (${v})`).join(", "),
        input: `ALLOWED SOURCE URLS (from web search):\n${allowed}\n\nRESEARCH NOTES:\n${research.notes}\n\nALREADY-KNOWN TOPIC KEYS:\n${recentTopics.map((t) => t.key).join(", ")}`,
        effort: "medium",
      });
      found = parsed.stories;
    } else {
      found = demoStories();
    }

    // Verify sources against what search actually returned.
    const hitSet = new Set(hits.map((h) => normaliseUrl(h.url)));
    const knownTopicKeys = new Set(recentTopics.map((t) => t.key));
    let added = 0;
    let dupes = 0;
    for (const s of found) {
      const src = normaliseUrl(s.sourceUrl);
      const isRepeat = knownTopicKeys.has(s.topicKey) && !s.meaningfulDevelopment;
      if (recentUrls.has(src) || isRepeat) {
        dupes++;
        await touchTopic(db, s, false);
        continue;
      }
      const verified = mode === "ai" ? hitSet.has(src) : false;
      const stats = mode === "ai" ? s.keyStats.filter((k) => hitSet.has(normaliseUrl(k.sourceUrl))) : s.keyStats;
      const supporting = mode === "ai" ? s.supportingSources.filter((k) => hitSet.has(normaliseUrl(k.url))) : s.supportingSources;
      const momentum = await touchTopic(db, s, true);
      await db.insert(stories).values({
        researchRunId: run.id,
        topicKey: s.topicKey,
        category: s.category,
        headline: s.headline,
        overview: s.overview,
        whyItMatters: s.whyItMatters,
        whyRelevantToSbf: s.whyRelevantToSbf,
        keyStats: stats,
        sourceUrl: s.sourceUrl,
        sourceOrganisation: s.sourceOrganisation,
        publishedAt: s.publishedAt,
        eventDate: s.eventDate,
        supportingSources: supporting,
        region: s.region,
        regionalDifferences: s.regionalDifferences || null,
        trending: s.trending,
        momentum: momentum ?? s.momentum,
        verification: verified || mode === "demo" ? s.verification : "unverified",
        factsVsOpinion: s.factsVsOpinion,
        conflictingReports: s.conflictingReports || null,
        suggestedAngle: s.suggestedAngle,
        socialOpportunities: s.socialOpportunities,
        audienceInterest: s.audienceInterest,
        suggestedArticleHeadline: s.suggestedArticleHeadline,
        relevanceScore: relevanceScore(s.scoreBreakdown),
        scoreBreakdown: s.scoreBreakdown,
        scoreExplanation: s.scoreExplanation,
        sourcesVerified: verified,
        isDemo: mode === "demo",
        status: "pending",
      });
      added++;
    }

    await db.update(researchRuns).set({ status: "done", storiesFound: added, duplicatesRemoved: dupes, finishedAt: new Date() }).where(eq(researchRuns.id, run.id));
    await logActivity(db, `research:${kind}`, "ok", `${added} new stories, ${dupes} duplicates removed, ${hits.length} search results checked`);
    if (added > 0) {
      await notify(
        db,
        kind === "breaking" ? "breaking_story" : "research_ready",
        kind === "breaking" ? `${added} breaking ${added === 1 ? "story" : "stories"} to review` : `Today's research is ready: ${added} stories`,
        mode === "demo" ? "Demo mode: add an Anthropic API key in Settings for live research." : undefined,
        "/news",
      );
    }
    return { runId: run.id, added, mode };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.update(researchRuns).set({ status: "failed", notes: msg, finishedAt: new Date() }).where(eq(researchRuns.id, run.id));
    await logActivity(db, `research:${kind}`, "failed", msg);
    await notify(db, "system", "Research run failed", msg, "/automation");
    throw err;
  }
}

/** Update topic memory. Returns a momentum override when the topic history says so. */
async function touchTopic(db: Db, s: ResearchedStory, isNewStory: boolean): Promise<ResearchedStory["momentum"] | null> {
  const existing = await db.query.topics.findFirst({ where: eq(topics.key, s.topicKey) });
  if (!existing) {
    await db.insert(topics).values({ key: s.topicKey, label: s.headline.slice(0, 120), category: s.category });
    return "new";
  }
  const daysSince = (Date.now() - existing.lastSeen.getTime()) / 86400_000;
  await db.update(topics).set({ mentions: existing.mentions + 1, lastSeen: new Date() }).where(eq(topics.id, existing.id));
  if (!isNewStory) return null;
  if (daysSince > 14) return "renewed";
  if (existing.mentions >= 2) return "rising";
  return null;
}

export async function markTopicCovered(db: Db, topicKey: string) {
  const t = await db.query.topics.findFirst({ where: eq(topics.key, topicKey) });
  if (t) await db.update(topics).set({ timesCovered: t.timesCovered + 1 }).where(eq(topics.id, t.id));
}

/** Topics in the memory that have been seen repeatedly but not yet covered. */
export async function uncoveredTopics(db: Db) {
  return db.select().from(topics).where(and(eq(topics.timesCovered, 0), gte(topics.mentions, 2))).orderBy(desc(topics.mentions)).limit(10);
}

export async function pendingStoryCount(db: Db) {
  return (await db.select({ id: stories.id }).from(stories).where(inArray(stories.status, ["pending"]))).length;
}
