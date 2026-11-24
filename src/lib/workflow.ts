import crypto from "node:crypto";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { articles, briefs, designs, postVersions, posts, stories } from "@/db/schema";
import { checkBrandCopy, hasBlockingIssues } from "./brand/check";
import { generateBrief, generatePosts, revisePost } from "./content";
import { generateDesignsForPost } from "./design/engine";
import { recordFeedback } from "./learning";
import { pillarForCategory } from "./ava";
import { markTopicCovered, runResearch } from "./research";
import { recommendTime } from "./scheduling";
import { audit, logActivity, notify, type Actor } from "./system";

/**
 * Workflow orchestration and the mandatory approval safeguards (§21):
 *  1. No unapproved news story can enter the editorial pipeline.
 *  2. No social content can be published without content approval.
 *  3. No design can be published without design approval.
 *  4. No substantive change to approved content without renewed approval.
 *  5. No sensitive community response is sent automatically (see community.ts).
 *  6. No unverified claims / fabricated statistics (brand checker blocks them).
 * Every approval is recorded with who and when (audit log + columns).
 */
export class WorkflowError extends Error {}

type PostRow = typeof posts.$inferSelect;

/* ───────────── Stories ───────────── */

export async function decideStory(
  db: Db,
  actor: Actor,
  storyId: string,
  decision: "approve" | "deny" | "save" | "more_research",
  feedback?: string,
  opts: { background?: boolean } = {},
) {
  const story = await db.query.stories.findFirst({ where: eq(stories.id, storyId) });
  if (!story) throw new WorkflowError("Story not found.");
  if (story.status === "approved") throw new WorkflowError("This story is already approved.");
  if (story.status === "denied" && decision !== "approve") throw new WorkflowError("This story was denied.");

  const status = { approve: "approved", deny: "denied", save: "saved", more_research: "more_research" }[decision];
  await db.update(stories).set({ status, decisionFeedback: feedback ?? null, decidedBy: actor.id ?? null, decidedAt: new Date() }).where(eq(stories.id, storyId));
  await audit(db, actor, `story.${decision}`, "story", storyId, feedback);

  await recordFeedback(db, {
    area: "editorial",
    subjectType: "story",
    subjectId: storyId,
    action: decision,
    feedback,
    extraSignals:
      decision === "deny"
        ? [{ key: `deny_category_${story.category}`, description: `Often declines ${story.category} stories like this` }]
        : decision === "approve"
          ? [{ key: `approve_category_${story.category}`, description: `Often approves ${story.category} stories` }]
          : [],
  });

  if (decision === "approve") {
    await markTopicCovered(db, story.topicKey);
    // Brief + content generation are triggered by approval (event trigger).
    if (opts.background) {
      onStoryApproved(db, storyId).catch((e) =>
        notify(db, "system", "Brief generation failed", e instanceof Error ? e.message : String(e), "/automation"),
      );
    } else {
      await onStoryApproved(db, storyId);
    }
  }
  if (decision === "more_research") {
    runResearch(db, "more_research", `${story.headline}\n${story.overview}\nSource: ${story.sourceUrl}`).catch(() => {});
  }
}

export async function onStoryApproved(db: Db, storyId: string) {
  const story = await db.query.stories.findFirst({ where: eq(stories.id, storyId) });
  if (!story || story.status !== "approved") throw new WorkflowError("Only approved stories can enter the editorial pipeline.");
  await logActivity(db, "editorial:brief", "started", story.headline);
  try {
    const { data, isDemo } = await generateBrief(db, story);
    const [brief] = await db.insert(briefs).values({ storyId, data, isDemo }).returning();
    await db.insert(articles).values({ briefId: brief.id, storyId, title: data.proposedTitle, status: "brief_approved" });
    await logActivity(db, "editorial:brief", "ok", data.proposedTitle);
    await notify(db, "brief_ready", `Article brief ready: ${data.proposedTitle}`, undefined, `/editorial/${brief.id}`);
    await generateContentForStory(db, storyId, brief.id);
  } catch (e) {
    await logActivity(db, "editorial:brief", "failed", e instanceof Error ? e.message : String(e));
    throw e;
  }
}

export async function generateContentForStory(db: Db, storyId: string, briefId: string | null) {
  const story = await db.query.stories.findFirst({ where: eq(stories.id, storyId) });
  if (!story || story.status !== "approved") throw new WorkflowError("Social content can only be generated from an approved story.");
  const brief = briefId ? await db.query.briefs.findFirst({ where: eq(briefs.id, briefId) }) : null;
  await logActivity(db, "content:generate", "started", story.headline);
  const { posts: generated, isDemo } = await generatePosts(db, story, brief?.data ?? null);
  const sourced = story.keyStats.map((k) => k.statement);
  for (const g of generated) {
    const issues = checkBrandCopy({ ...g, sourcedStatements: sourced });
    const [row] = await db
      .insert(posts)
      .values({
        storyId,
        briefId,
        platform: g.platform,
        format: g.format,
        category: g.category,
        treatment: g.treatment,
        hook: g.hook,
        caption: g.caption,
        supportingCopy: g.supportingCopy,
        callToAction: g.callToAction,
        hashtags: g.hashtags,
        keywords: g.keywords,
        seoNotes: g.seoNotes,
        taglines: g.taglines,
        designConcept: g.designConcept,
        altText: g.altText,
        script: g.script,
        suggestedDate: g.suggestedDate,
        suggestedTime: g.suggestedTime,
        audience: g.audience,
        engagementGoal: g.engagementGoal,
        pillar: g.pillar ?? pillarForCategory(g.category),
        contentType: g.contentType ?? null,
        author: isDemo ? null : "ava",
        brandIssues: issues,
        isDemo,
        status: "awaiting_content",
      })
      .returning();
    await snapshot(db, row, null, "Generated");
    // Provisional slot so every draft is visible in the planner. Only "scheduled" posts ever publish.
    if (!["newsletter", "community"].includes(row.platform)) {
      const rec = await recommendTime(db, { platform: row.platform, category: row.category, storyId, postId: row.id });
      await db.update(posts).set({ scheduledAt: rec.at, scheduleReason: rec.reason }).where(eq(posts.id, row.id));
    }
  }
  await logActivity(db, "content:generate", "ok", `${generated.length} drafts`);
  await notify(db, "content_awaiting", `${generated.length} social drafts awaiting approval`, story.headline, "/content");
}

/* ───────────── Social content approval ───────────── */

const SUBSTANTIVE: (keyof PostRow)[] = ["hook", "caption", "supportingCopy", "callToAction", "hashtags", "platform", "format", "altText", "script"];

export function contentHash(p: Pick<PostRow, "hook" | "caption" | "supportingCopy" | "callToAction" | "hashtags" | "platform" | "format" | "altText" | "script">) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([p.hook, p.caption, p.supportingCopy ?? "", p.callToAction, p.hashtags, p.platform, p.format, p.altText ?? "", p.script ?? ""]))
    .digest("hex");
}

async function snapshot(db: Db, p: PostRow, actor: Actor | null, note: string) {
  const snap = Object.fromEntries(SUBSTANTIVE.map((k) => [k, p[k]]));
  await db.insert(postVersions).values({ postId: p.id, version: p.version, snapshot: { ...snap, taglines: p.taglines, suggestedDate: p.suggestedDate, suggestedTime: p.suggestedTime }, note, editedBy: actor?.id ?? null });
}

export type PostEdit = Partial<Pick<PostRow, "hook" | "caption" | "supportingCopy" | "callToAction" | "hashtags" | "altText" | "script" | "taglines" | "suggestedDate" | "suggestedTime" | "campaignId">>;

export async function editPost(db: Db, actor: Actor, postId: string, edit: PostEdit, note = "Edited") {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) throw new WorkflowError("Post not found.");
  if (p.status === "published") throw new WorkflowError("Published posts can't be edited. Duplicate it instead.");
  const next = { ...p, ...edit };
  const substantive = contentHash(next) !== contentHash(p);
  const story = p.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, p.storyId) }) : null;
  const issues = checkBrandCopy({ ...next, sourcedStatements: story?.keyStats.map((k) => k.statement) ?? [] });

  // Safeguard 4: substantive changes to approved content require renewed approval.
  const wasApproved = ["awaiting_design", "approved_for_publishing", "scheduled", "failed"].includes(p.status);
  const reset = substantive && wasApproved;
  const [updated] = await db
    .update(posts)
    .set({
      ...edit,
      brandIssues: issues,
      version: substantive ? p.version + 1 : p.version,
      updatedAt: new Date(),
      ...(reset ? { status: "awaiting_content", approvedContentHash: null, contentApprovedAt: null, contentApprovedBy: null, idempotencyKey: null } : {}),
    })
    .where(eq(posts.id, postId))
    .returning();
  if (substantive) await snapshot(db, updated, actor, note);
  await audit(db, actor, reset ? "post.edit_reset_approval" : "post.edit", "post", postId, reset ? "Substantive change after approval: renewed approval required." : undefined);

  // Learn from edits: e.g. consistently shortened captions.
  if (edit.caption && p.caption && edit.caption.length < p.caption.length * 0.75) {
    await recordFeedback(db, { area: "voice", subjectType: "post", subjectId: postId, action: "edit", extraSignals: [{ key: "shorter", description: "Shorter captions" }] });
  }
  if (edit.hashtags && edit.hashtags.length < p.hashtags.length - 1) {
    await recordFeedback(db, { area: "seo", subjectType: "post", subjectId: postId, action: "edit", extraSignals: [{ key: "fewer_hashtags", description: "Fewer hashtags" }] });
  }
  return { reset, issues };
}

export async function decidePost(
  db: Db,
  actor: Actor,
  postId: string,
  decision: "approve" | "deny" | "revise" | "save",
  feedback?: string,
  opts: { overrideBrandWarnings?: boolean } = {},
) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) throw new WorkflowError("Post not found.");
  if (!["awaiting_content", "revision_requested", "saved"].includes(p.status)) throw new WorkflowError(`This post is ${p.status.replace(/_/g, " ")} and can't take that action.`);

  if (decision === "approve") {
    const story = p.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, p.storyId) }) : null;
    if (story && story.status !== "approved") throw new WorkflowError("The source story is not approved.");
    const issues = checkBrandCopy({ ...p, sourcedStatements: story?.keyStats.map((k) => k.statement) ?? [] });
    if (hasBlockingIssues(issues) && !(opts.overrideBrandWarnings && actor.role === "owner")) {
      throw new WorkflowError(`Fix the brand issues first: ${issues.filter((i) => i.severity === "block").map((i) => i.detail).join(" ")}`);
    }
    const isNetwork = !["newsletter", "community"].includes(p.platform);
    await db
      .update(posts)
      .set({
        status: isNetwork ? "awaiting_design" : "approved_for_publishing",
        approvedContentHash: contentHash(p),
        contentApprovedBy: actor.id ?? null,
        contentApprovedAt: new Date(),
        brandIssues: issues,
        feedback: feedback ?? null,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, postId));
    await audit(db, actor, opts.overrideBrandWarnings ? "post.approve_content_override" : "post.approve_content", "post", postId, feedback);
    await recordFeedback(db, { area: "voice", subjectType: "post", subjectId: postId, action: "approve", feedback, extraSignals: [{ key: `approved_treatment_${p.treatment}`, description: `Approves ${p.treatment} treatments` }] });
    // Posts made in the design studio already carry the owner's own design: keep it rather than generating options.
    const own = isNetwork ? await db.query.designs.findFirst({ where: and(eq(designs.postId, p.id), inArray(designs.status, ["proposed", "draft"]), eq(designs.source, "studio")) }) : null;
    if (own) {
      if (own.status === "draft") await db.update(designs).set({ status: "proposed" }).where(eq(designs.id, own.id));
      await notify(db, "design_awaiting", "Your studio design is ready for approval", p.hook, `/design?post=${p.id}`);
    } else if (isNetwork) {
      await logActivity(db, "design:generate", "started", `${p.platform} ${p.format}`);
      const n = await generateDesignsForPost(db, p);
      await logActivity(db, "design:generate", "ok", `${n} design options`);
      await notify(db, "design_awaiting", `${n} design options awaiting approval`, p.hook, `/design?post=${p.id}`);
    }
    return;
  }

  if (decision === "revise") {
    await db.update(posts).set({ status: "revision_requested", feedback: feedback ?? null, updatedAt: new Date() }).where(eq(posts.id, postId));
    await audit(db, actor, "post.request_revision", "post", postId, feedback);
    await recordFeedback(db, { area: "voice", subjectType: "post", subjectId: postId, action: "revise", feedback });
    if (feedback) {
      const story = p.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, p.storyId) }) : null;
      const rev = await revisePost(db, p, feedback, story?.keyStats.map((k) => k.statement) ?? []).catch(() => null);
      if (rev) {
        await editPost(db, { id: null, email: "system" }, postId, rev, `AI revision: ${feedback.slice(0, 120)}`);
        await db.update(posts).set({ status: "awaiting_content" }).where(eq(posts.id, postId));
      }
    }
    return;
  }

  const status = decision === "deny" ? "denied" : "saved";
  await db.update(posts).set({ status, feedback: feedback ?? null, updatedAt: new Date() }).where(eq(posts.id, postId));
  await audit(db, actor, `post.${decision}`, "post", postId, feedback);
  if (decision === "deny") await recordFeedback(db, { area: "voice", subjectType: "post", subjectId: postId, action: "deny", feedback });
}

export async function bulkApprovePosts(db: Db, actor: Actor, ids: string[]) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      await decidePost(db, actor, id, "approve");
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}

export async function duplicatePost(db: Db, actor: Actor, postId: string) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) throw new WorkflowError("Post not found.");
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = p;
  void _id; void _c; void _u;
  const [copy] = await db
    .insert(posts)
    .values({
      ...rest,
      status: "awaiting_content",
      version: 1,
      approvedContentHash: null,
      contentApprovedAt: null,
      contentApprovedBy: null,
      designApprovedAt: null,
      designApprovedBy: null,
      approvedDesignId: null,
      scheduledAt: null,
      publishedAt: null,
      liveUrl: null,
      externalId: null,
      publishAttempts: 0,
      lastError: null,
      idempotencyKey: null,
      manualInstructions: null,
    })
    .returning();
  await snapshot(db, copy, actor, `Duplicated from ${postId}`);
  await audit(db, actor, "post.duplicate", "post", copy.id, `from ${postId}`);
  return copy.id;
}

export async function restoreVersion(db: Db, actor: Actor, postId: string, versionId: string) {
  const v = await db.query.postVersions.findFirst({ where: eq(postVersions.id, versionId) });
  if (!v || v.postId !== postId) throw new WorkflowError("Version not found.");
  const s = v.snapshot as PostEdit;
  return editPost(db, actor, postId, {
    hook: s.hook, caption: s.caption, supportingCopy: s.supportingCopy, callToAction: s.callToAction, hashtags: s.hashtags, altText: s.altText, script: s.script,
  }, `Restored version ${v.version}`);
}

/* ───────────── Design approval ───────────── */

export async function decideDesign(db: Db, actor: Actor, designId: string, decision: "approve" | "deny" | "changes", feedback?: string) {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.postId) throw new WorkflowError("Design not found.");
  const p = await db.query.posts.findFirst({ where: eq(posts.id, d.postId) });
  if (!p) throw new WorkflowError("Post not found.");

  if (decision === "approve") {
    // Safeguard 3 depends on 2: content must be approved and unchanged since approval.
    if (p.status !== "awaiting_design" || !p.approvedContentHash) throw new WorkflowError("The post's content must be approved before its design.");
    if (p.approvedContentHash !== contentHash(p)) throw new WorkflowError("Content changed after approval. Re-approve the content first.");
    await db.update(designs).set({ status: "approved", feedback: feedback ?? null }).where(eq(designs.id, designId));
    await db.update(designs).set({ status: "superseded" }).where(and(eq(designs.postId, p.id), ne(designs.id, designId), inArray(designs.status, ["proposed", "changes_requested"])));
    const rec = p.scheduledAt && p.scheduledAt.getTime() > Date.now() + 15 * 60_000 && p.scheduleReason
      ? { at: p.scheduledAt, reason: p.scheduleReason }
      : await recommendTime(db, { platform: p.platform, category: p.category, storyId: p.storyId, postId: p.id });
    await db
      .update(posts)
      .set({ status: "approved_for_publishing", approvedDesignId: designId, designApprovedBy: actor.id ?? null, designApprovedAt: new Date(), scheduledAt: rec.at, scheduleReason: rec.reason, updatedAt: new Date() })
      .where(eq(posts.id, p.id));
    await audit(db, actor, "design.approve", "design", designId, `post ${p.id}`);
    await recordFeedback(db, {
      area: "visual",
      subjectType: "design",
      subjectId: designId,
      action: "approve",
      feedback,
      extraSignals: d.params ? [{ key: `layout_${d.params.layout}`, description: `Approves ${d.params.layout} layouts` }, { key: `lead_${d.params.lead}`, description: `Approves ${d.params.lead} as lead colour` }] : [],
    });
    return rec;
  }
  await db.update(designs).set({ status: decision === "deny" ? "denied" : "changes_requested", feedback: feedback ?? null }).where(eq(designs.id, designId));
  await audit(db, actor, `design.${decision}`, "design", designId, feedback);
  await recordFeedback(db, { area: "visual", subjectType: "design", subjectId: designId, action: decision, feedback });
}

/* ───────────── Scheduling ───────────── */

export async function schedulePost(db: Db, actor: Actor, postId: string, at: Date, accountId: string | null, recurrence: string | null = null) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p) throw new WorkflowError("Post not found.");
  assertPublishable(p);
  if (at.getTime() < Date.now() - 60_000) throw new WorkflowError("Choose a time in the future.");
  await db
    .update(posts)
    .set({ status: "scheduled", scheduledAt: at, accountId, recurrence, idempotencyKey: `${p.id}:v${p.version}:${at.toISOString()}`, updatedAt: new Date() })
    .where(eq(posts.id, postId));
  await audit(db, actor, "post.schedule", "post", postId, at.toISOString());
  await notify(db, "post_scheduled", `Scheduled: ${p.hook}`, `${p.platform} · ${at.toISOString()}`, "/planner");
}

export async function unschedulePost(db: Db, actor: Actor, postId: string) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p || p.status !== "scheduled") throw new WorkflowError("Post isn't scheduled.");
  await db.update(posts).set({ status: "approved_for_publishing", idempotencyKey: null, updatedAt: new Date() }).where(eq(posts.id, postId));
  await audit(db, actor, "post.unschedule", "post", postId);
}

/** The gate every publish path passes through (safeguards 2, 3 and 4). */
export function assertPublishable(p: PostRow) {
  if (!["approved_for_publishing", "scheduled", "failed"].includes(p.status)) throw new WorkflowError("Content and design must both be approved before publishing.");
  if (!p.contentApprovedAt || !p.approvedContentHash) throw new WorkflowError("Content has not been approved.");
  if (p.approvedContentHash !== contentHash(p)) throw new WorkflowError("Content changed after approval. Renewed approval required.");
  const needsDesign = !["newsletter", "community"].includes(p.platform);
  if (needsDesign && (!p.designApprovedAt || !p.approvedDesignId)) throw new WorkflowError("Design has not been approved.");
}
