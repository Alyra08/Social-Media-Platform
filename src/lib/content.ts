import { AVA_PERSONA, avaGuidance, contentTypeEnum, pillarEnum } from "./ava";
import { z } from "zod";
import type { Db } from "@/db/client";
import type { BriefData } from "@/db/schema";
import { aiEnabled, structured } from "./ai/client";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { learnedGuidance } from "./learning";
import { demoBrief, demoPosts } from "./demo";

type StoryLike = {
  headline: string;
  overview: string;
  whyItMatters: string;
  whyRelevantToSbf: string;
  suggestedAngle: string;
  suggestedArticleHeadline: string;
  sourceUrl: string;
  sourceOrganisation: string;
  category: string;
  keyStats: { statement: string; sourceUrl: string }[];
  supportingSources: { title: string; url: string; organisation?: string }[];
  region: string;
  regionalDifferences: string | null;
  factsVsOpinion: string | null;
  conflictingReports: string | null;
  verification: string;
  isDemo: boolean;
};

const storyContext = (s: StoryLike) =>
  `STORY\nHeadline: ${s.headline}\nOverview: ${s.overview}\nWhy it matters: ${s.whyItMatters}\nWhy SBF: ${s.whyRelevantToSbf}\nSuggested angle: ${s.suggestedAngle}\nRegion: ${s.region}${s.regionalDifferences ? `\nRegional differences: ${s.regionalDifferences}` : ""}\nVerification: ${s.verification}\nFacts vs opinion: ${s.factsVsOpinion ?? ""}\nConflicting reports: ${s.conflictingReports ?? "none noted"}\nPrimary source: ${s.sourceOrganisation} — ${s.sourceUrl}\nSupporting sources:\n${s.supportingSources.map((x) => `- ${x.title} (${x.organisation ?? ""}) ${x.url}`).join("\n") || "- none"}\nVERIFIED FIGURES (the only figures you may use):\n${s.keyStats.map((k) => `- ${k.statement} [${k.sourceUrl}]`).join("\n") || "- none: use bracketed placeholders like [real figure]"}`;

/* ───────────── Editorial brief ───────────── */

const BriefSchema = z.object({
  proposedTitle: z.string(),
  alternativeHeadlines: z.array(z.string()),
  topicOverview: z.string(),
  background: z.string(),
  whyItMatters: z.string(),
  keyArguments: z.array(z.string()),
  statistics: z.array(z.object({ statement: z.string(), sourceUrl: z.string() })),
  supportingEvidence: z.array(z.string()),
  perspectives: z.array(z.string()),
  counterarguments: z.array(z.string()),
  questionsToExplore: z.array(z.string()),
  outline: z.array(z.object({ heading: z.string(), subheadings: z.array(z.string()) })),
  suggestedIntroduction: z.string(),
  suggestedConclusion: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string(), organisation: z.string() })),
  keywords: z.array(z.string()),
  longTailPhrases: z.array(z.string()),
  searchIntent: z.string(),
  seoTitle: z.string(),
  metaDescription: z.string(),
  urlSlug: z.string(),
  internalLinks: z.array(z.string()),
  relatedArticles: z.array(z.string()),
  socialPromotion: z.array(z.string()),
});

export async function generateBrief(db: Db, story: StoryLike): Promise<{ data: BriefData; isDemo: boolean }> {
  if (!aiEnabled() || story.isDemo) return { data: demoBrief(story), isDemo: true };
  const guidance = await learnedGuidance(db, ["editorial", "voice", "seo"]);
  const allowedUrls = new Set([story.sourceUrl, ...story.supportingSources.map((s) => s.url), ...story.keyStats.map((k) => k.sourceUrl)]);
  const data = await structured({
    schema: BriefSchema,
    system: SBF_BRAND_BRIEF,
    task: `You are the SBF digital editor and SEO specialist. Write an editorial briefing detailed enough that the owner can write the full article without researching again.
Rules: British spelling. Headlines short, declarative, ending with a full stop. Use ONLY the verified figures and sources provided; for anything else use bracketed placeholders. Never invent statistics, quotes or studies. Give 3–5 alternative headlines, a detailed outline with headings and subheadings, a suggested introduction (confess first, oddly specific) and conclusion (the twist, then a question). SEO: primary/secondary keywords, long-tail phrases, search intent, SEO title (≤60 chars), meta description (≤155 chars), URL slug, internal linking ideas (SBF circles, coaching, retreats, podcast, Sunday note), related articles, and social promotion opportunities.
${guidance}`,
    input: storyContext(story),
    effort: "high",
  });
  // Strip any source the model added that wasn't in the verified set.
  data.sources = data.sources.filter((s) => allowedUrls.has(s.url));
  data.statistics = data.statistics.filter((s) => allowedUrls.has(s.sourceUrl));
  return { data, isDemo: false };
}

/* ───────────── Social content suite ───────────── */

export const PLATFORM_FORMATS: Record<string, string[]> = {
  instagram: ["post", "carousel", "reel", "story"],
  facebook: ["post"],
  tiktok: ["video"],
  linkedin: ["post"],
  pinterest: ["pin"],
  threads: ["post"],
  x: ["post"],
  bluesky: ["post"],
  youtube: ["short"],
  newsletter: ["sunday-note"],
  community: ["discussion-prompt"],
};

const PostSchema = z.object({
  platform: z.enum(["instagram", "facebook", "tiktok", "linkedin", "pinterest", "threads", "x", "bluesky", "youtube", "newsletter", "community"]),
  format: z.string(),
  treatment: z.enum(["serious", "humorous", "inspirational", "lifestyle"]),
  hook: z.string(),
  caption: z.string(),
  supportingCopy: z.string().nullable(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  keywords: z.array(z.string()),
  seoNotes: z.string(),
  taglines: z.array(z.string()).describe("at least five original alternative taglines/hooks"),
  designConcept: z.string(),
  altText: z.string(),
  script: z.string().nullable().describe("for reels/TikTok/shorts: timed script; else null"),
  suggestedDate: z.string().nullable(),
  suggestedTime: z.string().nullable(),
  audience: z.string(),
  engagementGoal: z.string(),
  pillar: pillarEnum.describe("Ava's content pillar for this post"),
  contentType: contentTypeEnum.describe("Ava's content type for this post"),
});
const PostsSchema = z.object({ posts: z.array(PostSchema) });
export type GeneratedPost = Omit<z.infer<typeof PostSchema>, "platform" | "pillar" | "contentType"> & { platform: string; category: string; pillar?: string; contentType?: string };

export async function generatePosts(db: Db, story: StoryLike, brief: BriefData | null): Promise<{ posts: GeneratedPost[]; isDemo: boolean }> {
  if (!aiEnabled() || story.isDemo) return { posts: demoPosts(story), isDemo: true };
  const [guidance, ava] = await Promise.all([learnedGuidance(db, ["voice", "seo", "audience", "performance"]), avaGuidance(db)]);
  const res = await structured({
    schema: PostsSchema,
    system: SBF_BRAND_BRIEF,
    task: `${ava}

As Ava, turn one approved topic into a suite of platform-appropriate content. Do NOT duplicate the same caption across platforms: adapt language, structure, length, formatting, hooks and CTAs per channel.
Produce: Instagram post, Instagram carousel (slide-by-slide in supportingCopy), Instagram Reel concept and script, Instagram Story concept, Facebook post, TikTok concept and script, LinkedIn post (only if appropriate), Pinterest pin, Threads post, X post, Bluesky post, a community discussion prompt, and a Sunday note (newsletter) section if relevant.
Each post: hook, full caption, supporting copy, CTA (from the approved CTA style: say exactly what happens), hashtags (platform-appropriate count; none for LinkedIn/newsletter if not useful), search keywords placed naturally, SEO notes (social discovery vs search indexing differ — explain per platform), ≥5 original taglines/hooks in the SBF voice (not recycled examples), recommended format, a design concept that follows the brand colour and type rules, meaningful alt text, intended audience and engagement outcome.
Mechanics: British spelling, sentence case, no exclamation marks, no emoji (✦ allowed), no avoid-list words, no war/battle language, no celebrities. Use ONLY the verified figures provided — otherwise use [real figure] placeholders. Avoid robotic AI phrasing, generic hooks and engagement bait.
Treatment: serious for social issues, humorous for relatable/lifestyle, inspirational for positive stories, lifestyle for everyday topics.
${guidance}`,
    input: `${storyContext(story)}\n\nEDITORIAL BRIEF (for linking and SEO):\nTitle: ${brief?.proposedTitle ?? story.suggestedArticleHeadline}\nKeywords: ${brief?.keywords.join(", ") ?? ""}\nSlug: ${brief?.urlSlug ?? ""}`,
    effort: "high",
    maxTokens: 32000,
  });
  return { posts: res.posts.map((p) => ({ ...p, category: story.category })), isDemo: false };
}

/* ───────────── Revisions ───────────── */

const RevisionSchema = z.object({
  hook: z.string(),
  caption: z.string(),
  supportingCopy: z.string().nullable(),
  callToAction: z.string(),
  hashtags: z.array(z.string()),
  taglines: z.array(z.string()),
});

export async function revisePost(
  db: Db,
  post: { platform: string; format: string; hook: string; caption: string; supportingCopy: string | null; callToAction: string; hashtags: string[]; taglines: string[] },
  feedback: string,
  verifiedFigures: string[],
) {
  if (!aiEnabled()) return null;
  const guidance = await learnedGuidance(db, ["voice", "seo"]);
  return structured({
    schema: RevisionSchema,
    system: SBF_BRAND_BRIEF,
    task: `${AVA_PERSONA}

As Ava, revise this ${post.platform} ${post.format} per the owner's feedback, keeping everything else on brand. Use only these verified figures: ${verifiedFigures.join("; ") || "none (use placeholders)"}.\n${guidance}`,
    input: `CURRENT\n${JSON.stringify(post, null, 2)}\n\nOWNER FEEDBACK\n${feedback}`,
    effort: "medium",
  });
}
