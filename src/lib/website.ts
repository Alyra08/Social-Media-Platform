import crypto from "node:crypto";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { articles, briefs, stories, type BrandIssue, type SourceRef } from "@/db/schema";
import { checkBrandCopy, hasBlockingIssues } from "./brand/check";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { aiEnabled, structured } from "./ai/client";
import { learnedGuidance, recordFeedback } from "./learning";
import { audit, logActivity, notify, type Actor } from "./system";

/**
 * Public website: article publishing. The same safeguards as social content apply:
 *  - Nothing reaches the public site without the owner's approval (recorded who and when).
 *  - A substantive edit after approval resets approval; a content hash is re-checked when publishing.
 *  - Brand rules block exclamation marks, emoji, avoid-list words, war language and unsourced figures.
 *  - Articles built from demo (sample) research can't be published.
 */
export class WebsiteError extends Error {}

type ArticleRow = typeof articles.$inferSelect;

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80)
      .replace(/-+$/, "") || "article"
  );
}

export async function uniqueSlug(db: Db, base: string, exceptId?: string): Promise<string> {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.articles.findFirst({
      where: exceptId ? and(eq(articles.slug, candidate), ne(articles.id, exceptId)) : eq(articles.slug, candidate),
    });
    if (!clash) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 6)}`;
}

/** Fields whose change counts as substantive (resets approval). */
export function articleHash(a: Pick<ArticleRow, "title" | "body" | "excerpt" | "slug" | "seoTitle" | "metaDescription">): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([a.title.trim(), a.body.trim(), (a.excerpt ?? "").trim(), a.slug ?? "", (a.seoTitle ?? "").trim(), (a.metaDescription ?? "").trim()]))
    .digest("hex");
}

/** Statements that carry a verified figure (from the brief / story), allowed to contain numbers. */
async function sourcedStatements(db: Db, a: Pick<ArticleRow, "briefId" | "storyId">): Promise<string[]> {
  const out: string[] = [];
  if (a.briefId) {
    const b = await db.query.briefs.findFirst({ where: eq(briefs.id, a.briefId) });
    if (b) out.push(...b.data.statistics.map((s) => s.statement));
  }
  if (a.storyId) {
    const s = await db.query.stories.findFirst({ where: eq(stories.id, a.storyId) });
    if (s) out.push(...s.keyStats.map((k) => k.statement));
  }
  return out;
}

/** Brand-check an article. Long-form gets one pass per paragraph so the messages point somewhere useful. */
export function checkArticle(a: { title: string; excerpt?: string | null; body: string; seoTitle?: string | null; metaDescription?: string | null }, sourced: string[]): BrandIssue[] {
  const issues: BrandIssue[] = [];
  issues.push(...checkBrandCopy({ hook: a.title, sourcedStatements: sourced }).map((i) => ({ ...i, detail: i.detail.replace(/\bhook\b/, "title") })));
  if (a.excerpt) issues.push(...checkBrandCopy({ caption: a.excerpt, sourcedStatements: sourced }).map((i) => ({ ...i, detail: i.detail.replace(/\bcaption\b/, "summary") })));
  if (a.seoTitle) issues.push(...checkBrandCopy({ supportingCopy: a.seoTitle, sourcedStatements: sourced }).map((i) => ({ ...i, detail: i.detail.replace(/supporting copy/, "SEO title") })));
  if (a.metaDescription) issues.push(...checkBrandCopy({ supportingCopy: a.metaDescription, sourcedStatements: sourced }).map((i) => ({ ...i, detail: i.detail.replace(/supporting copy/, "meta description") })));
  const paras = a.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  paras.forEach((p, n) => {
    // Links are markdown [text](url); the URL itself never counts as a figure.
    const text = p.replace(/\]\([^)]*\)/g, "]");
    for (const i of checkBrandCopy({ caption: text, sourcedStatements: sourced })) {
      if (i.rule === "sentence-case" || i.rule === "headline-full-stop") continue;
      issues.push({ ...i, detail: i.detail.replace(/\bin caption\b/, `in paragraph ${n + 1}`) });
    }
  });
  if (a.seoTitle && a.seoTitle.length > 60) issues.push({ rule: "seo-title-length", severity: "warn", detail: `SEO title is ${a.seoTitle.length} characters; aim for 60 or fewer.` });
  if (a.metaDescription && a.metaDescription.length > 155) issues.push({ rule: "meta-length", severity: "warn", detail: `Meta description is ${a.metaDescription.length} characters; aim for 155 or fewer.` });
  if (/\[(real figure|placeholder|source|tbc|tk)[^\]]*\]/i.test(a.body)) issues.push({ rule: "placeholder", severity: "block", detail: "The article still contains a bracketed placeholder. Replace it with a sourced fact or remove it." });
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.detail) ? false : (seen.add(i.detail), true)));
}

export type ArticleEdit = {
  title: string;
  body: string;
  excerpt?: string | null;
  slug?: string | null;
  category?: string | null;
  seoTitle?: string | null;
  metaDescription?: string | null;
  sources?: SourceRef[];
  status?: string;
};

/** Create a stand-alone article (not from a brief). Human-written, so not demo content. */
export async function createArticle(db: Db, actor: Actor, title: string): Promise<string> {
  const t = title.trim() || "Untitled article.";
  const [row] = await db.insert(articles).values({ title: t, status: "drafting", slug: await uniqueSlug(db, t) }).returning();
  await audit(db, actor, "article.create", "article", row.id, t);
  return row.id;
}

/** Fill website fields from the brief the first time an article from research is opened. */
export async function ensureArticleWebFields(db: Db, articleId: string) {
  const a = await db.query.articles.findFirst({ where: eq(articles.id, articleId) });
  if (!a || a.slug) return;
  const b = a.briefId ? await db.query.briefs.findFirst({ where: eq(briefs.id, a.briefId) }) : null;
  const s = a.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, a.storyId) }) : null;
  await db
    .update(articles)
    .set({
      slug: await uniqueSlug(db, b?.data.urlSlug || a.title, a.id),
      seoTitle: b?.data.seoTitle ?? null,
      metaDescription: b?.data.metaDescription ?? null,
      excerpt: b?.data.topicOverview?.slice(0, 280) ?? null,
      category: s?.category ?? null,
      sources: b?.data.sources ?? [],
      isDemo: Boolean(b?.isDemo || s?.isDemo),
    })
    .where(eq(articles.id, a.id));
}

export async function saveArticleDraft(db: Db, actor: Actor, id: string, edit: ArticleEdit): Promise<{ reset: boolean; issues: BrandIssue[] }> {
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a) throw new WebsiteError("Article not found.");
  const title = edit.title.trim();
  if (!title) throw new WebsiteError("An article needs a title.");
  const slug = edit.slug?.trim() ? await uniqueSlug(db, edit.slug, id) : a.slug ?? (await uniqueSlug(db, title, id));
  const next = {
    title,
    body: edit.body.replace(/\r\n/g, "\n"),
    excerpt: edit.excerpt?.trim() || null,
    slug,
    category: edit.category?.trim() || null,
    seoTitle: edit.seoTitle?.trim() || null,
    metaDescription: edit.metaDescription?.trim() || null,
  };
  const issues = checkArticle(next, await sourcedStatements(db, a));
  const changed = a.approvedHash ? articleHash(next) !== a.approvedHash : false;
  const wasApprovedOrLive = a.status === "approved" || a.status === "published";
  let status = edit.status && !["approved", "published"].includes(edit.status) ? edit.status : a.status;
  let reset = false;
  if (changed) {
    reset = true;
    // A substantive edit takes a live article off the site until it's approved again.
    status = "ready";
  } else if (wasApprovedOrLive && edit.status && edit.status !== a.status && !["approved", "published"].includes(edit.status)) {
    status = a.status; // approval/publishing state only changes through approve / publish / unpublish
  }
  await db
    .update(articles)
    .set({
      ...next,
      sources: edit.sources ?? a.sources,
      brandIssues: issues,
      status,
      ...(reset ? { approvedHash: null, approvedBy: null, approvedAt: null, publishedAt: null, publishedBy: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(articles.id, id));
  await audit(db, actor, reset ? "article.edit_reset_approval" : "article.save", "article", id, title);
  if (reset && a.status === "published") {
    await notify(db, "system", `Article taken off the website for re-approval: ${title}`, "It was edited after approval.", `/website/articles/${id}`);
  }
  return { reset, issues };
}

export async function approveArticle(db: Db, actor: Actor, id: string, opts: { override?: boolean; note?: string } = {}) {
  if (actor.role !== "owner") throw new WebsiteError("Only the owner can approve articles for the website.");
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a) throw new WebsiteError("Article not found.");
  if (!a.body.trim()) throw new WebsiteError("The article is empty.");
  if (!a.slug) throw new WebsiteError("Save the article once to give it a web address.");
  const issues = checkArticle(a, await sourcedStatements(db, a));
  if (hasBlockingIssues(issues) && !opts.override) {
    await db.update(articles).set({ brandIssues: issues }).where(eq(articles.id, id));
    throw new WebsiteError(`Fix the brand issues before approving: ${issues.filter((i) => i.severity === "block").map((i) => i.detail).join(" ")}`);
  }
  await db
    .update(articles)
    .set({ status: "approved", approvedHash: articleHash(a), approvedBy: actor.id ?? null, approvedAt: new Date(), brandIssues: issues, updatedAt: new Date() })
    .where(eq(articles.id, id));
  await audit(db, actor, opts.override && hasBlockingIssues(issues) ? "article.approve_override" : "article.approve", "article", id, opts.note ?? a.title);
  await recordFeedback(db, { area: "editorial", subjectType: "article", subjectId: id, action: "approve", feedback: opts.note });
}

export async function publishArticle(db: Db, actor: Actor, id: string) {
  if (actor.role !== "owner") throw new WebsiteError("Only the owner can publish to the website.");
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a) throw new WebsiteError("Article not found.");
  if (a.isDemo) throw new WebsiteError("This article is built on sample research from demo mode, so it can't go on the public website. Write your own article with New article, or add the Anthropic key for real research.");
  if (!a.approvedHash || !a.approvedAt) throw new WebsiteError("Approve the article before publishing it.");
  if (articleHash(a) !== a.approvedHash) {
    await db.update(articles).set({ status: "ready", approvedHash: null, approvedAt: null, approvedBy: null }).where(eq(articles.id, id));
    throw new WebsiteError("The article changed after it was approved. It needs approval again.");
  }
  const published = await db
    .update(articles)
    .set({ status: "published", publishedAt: a.publishedAt ?? new Date(), publishedBy: actor.id ?? null, updatedAt: new Date() })
    .where(and(eq(articles.id, id), eq(articles.status, "approved")))
    .returning();
  if (!published.length) throw new WebsiteError(a.status === "published" ? "This article is already live." : "Approve the article before publishing it.");
  await audit(db, actor, "article.publish", "article", id, a.title);
  await logActivity(db, "website:publish", "ok", a.title);
}

export async function unpublishArticle(db: Db, actor: Actor, id: string) {
  if (actor.role !== "owner") throw new WebsiteError("Only the owner can take articles off the website.");
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a || a.status !== "published") throw new WebsiteError("This article isn't live.");
  await db.update(articles).set({ status: "approved", updatedAt: new Date() }).where(eq(articles.id, id));
  await audit(db, actor, "article.unpublish", "article", id, a.title);
}

/* ───────────── AI first draft from the brief ───────────── */

const DraftSchema = z.object({ title: z.string(), excerpt: z.string(), body: z.string() });

/** Writes a first draft from the editorial brief. Demo mode assembles a clearly marked scaffold. */
export async function draftArticleFromBrief(db: Db, actor: Actor, id: string): Promise<{ isDemo: boolean }> {
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a?.briefId) throw new WebsiteError("Only articles that come from an editorial brief can be drafted automatically.");
  if (a.body.trim()) throw new WebsiteError("This article already has text. Clear it first if you want a fresh draft.");
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, a.briefId) });
  if (!brief) throw new WebsiteError("Brief not found.");
  const d = brief.data;
  let draft: z.infer<typeof DraftSchema>;
  let isDemo = brief.isDemo || !aiEnabled();
  if (!isDemo) {
    const guidance = await learnedGuidance(db, ["editorial", "voice", "seo"]);
    draft = await structured({
      schema: DraftSchema,
      system: SBF_BRAND_BRIEF,
      task: `You are the SBF digital editor. Write a complete first draft of the article from this brief, for the owner to edit.
Format the body as plain text: paragraphs separated by a blank line, "## " for section headings, "- " for list items, and [link text](url) for links to the sources. British spelling. No exclamation marks, no emoji, no avoid-list words, no war language.
Use ONLY the verified statistics in the brief, each linked to its source. Never invent statistics, quotes, studies or people. Where a fact is needed but not supplied, write around it.
Open with the confession (oddly specific), end with the twist and a question. 900–1400 words. The excerpt is one or two sentences for the website card.
${guidance}`,
      input: JSON.stringify(d),
      effort: "medium",
      maxTokens: 12000,
    });
  } else {
    isDemo = true;
    draft = {
      title: d.proposedTitle,
      excerpt: d.topicOverview.slice(0, 240),
      body: [
        d.suggestedIntroduction,
        ...d.outline.flatMap((o) => [`## ${o.heading}`, ...(o.subheadings.length ? [o.subheadings.map((s) => `- ${s}`).join("\n")] : []), "Write this section in your own words."]),
        d.suggestedConclusion,
      ].join("\n\n"),
    };
  }
  await db
    .update(articles)
    .set({ title: draft.title, excerpt: draft.excerpt, body: draft.body, status: "editing", isDemo: a.isDemo || isDemo, updatedAt: new Date() })
    .where(eq(articles.id, id));
  await saveArticleDraft(db, actor, id, { title: draft.title, body: draft.body, excerpt: draft.excerpt, slug: a.slug, category: a.category, seoTitle: a.seoTitle, metaDescription: a.metaDescription, status: "editing" });
  await audit(db, actor, "article.draft", "article", id, isDemo ? "demo scaffold" : "ai draft");
  return { isDemo };
}

/* ───────────── Public queries ───────────── */

export async function publishedArticles(db: Db, opts: { q?: string; category?: string; limit?: number } = {}) {
  const conds = [eq(articles.status, "published")];
  if (opts.category) conds.push(eq(articles.category, opts.category));
  if (opts.q?.trim()) {
    const like = `%${opts.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(or(ilike(articles.title, like), ilike(articles.body, like), ilike(articles.excerpt, like))!);
  }
  return db
    .select()
    .from(articles)
    .where(and(...conds))
    .orderBy(desc(articles.publishedAt))
    .limit(opts.limit ?? 50);
}

export async function publishedArticleBySlug(db: Db, slug: string) {
  return db.query.articles.findFirst({ where: and(eq(articles.slug, slug), eq(articles.status, "published")) });
}

export async function publishedCategories(db: Db): Promise<{ category: string; n: number }[]> {
  const rows = await db
    .select({ category: articles.category, n: sql<number>`count(*)::int` })
    .from(articles)
    .where(and(eq(articles.status, "published"), sql`${articles.category} is not null`))
    .groupBy(articles.category);
  return rows.filter((r): r is { category: string; n: number } => Boolean(r.category));
}

export const readingMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
