import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { Db } from "@/db/client";
import { accounts, activityLog, articles, auditLog, briefs, designs, interactions, posts, stories } from "@/db/schema";
import { runResearch } from "@/lib/research";
import { decideStory, decidePost, decideDesign, editPost, generateContentForStory, schedulePost, WorkflowError, contentHash } from "@/lib/workflow";
import { publishPost, confirmManualPublish } from "@/lib/publishing";
import { upsertAccount } from "@/lib/integrations/registry";
import { triageInteraction, sendReply } from "@/lib/community";
import { setSetting, type Actor } from "@/lib/system";

let db: Db;
let owner: Actor;

beforeEach(async () => {
  ({ db, owner } = await testDb());
});
afterEach(() => {
  delete process.env.SANDBOX_FAIL_NEXT;
});

async function approvedStoryWithPosts() {
  await runResearch(db, "daily");
  const [s] = await db.select().from(stories).limit(1);
  await decideStory(db, owner, s.id, "approve");
  const ps = await db.select().from(posts).where(eq(posts.storyId, s.id));
  return { story: s, posts: ps };
}

async function cleanPost(id: string) {
  // Demo copy carries placeholder brackets but no brand violations; make sure no blockers remain.
  await editPost(db, owner, id, { caption: "I rewrote the email four times. Who taught you to ask for less?", altText: "Pink card with red serif headline." });
}

describe("research → news approval", () => {
  it("runs daily research (demo mode), populates Daily News, logs activity", async () => {
    const r = await runResearch(db, "daily");
    expect(r.mode).toBe("demo");
    expect(r.added).toBeGreaterThan(0);
    const rows = await db.select().from(stories);
    expect(rows.every((s) => s.status === "pending" && s.isDemo && s.relevanceScore >= 1 && s.relevanceScore <= 100)).toBe(true);
    const log = await db.select().from(activityLog);
    expect(log.some((l) => l.job === "research:daily" && l.status === "ok")).toBe(true);
  });

  it("removes duplicate stories on a second run the same day", async () => {
    await runResearch(db, "daily");
    const second = await runResearch(db, "daily");
    expect(second.added).toBe(0);
  });

  it("does not generate content from unapproved stories", async () => {
    await runResearch(db, "daily");
    const [s] = await db.select().from(stories).limit(1);
    await expect(generateContentForStory(db, s.id, null)).rejects.toBeInstanceOf(WorkflowError);
    expect((await db.select().from(posts)).length).toBe(0);
  });

  it("approving a story generates a brief, an article record and platform-specific drafts", async () => {
    const { story, posts: ps } = await approvedStoryWithPosts();
    expect((await db.select().from(briefs).where(eq(briefs.storyId, story.id))).length).toBe(1);
    expect((await db.select().from(articles).where(eq(articles.storyId, story.id))).length).toBe(1);
    expect(ps.length).toBeGreaterThan(1);
    expect(new Set(ps.map((p) => p.platform)).size).toBe(ps.length); // adapted per platform
    expect(ps.every((p) => p.status === "awaiting_content")).toBe(true);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "story.approve"));
    expect(audits[0].actor).toBe("owner@test.local");
  });

  it("denial records feedback for learning", async () => {
    await runResearch(db, "daily");
    const [s] = await db.select().from(stories).limit(1);
    await decideStory(db, owner, s.id, "deny", "Too American, not relevant");
    const row = await db.query.stories.findFirst({ where: eq(stories.id, s.id) });
    expect(row?.status).toBe("denied");
    const prefs = await db.query.brandPreferences.findMany();
    expect(prefs.some((p) => p.key === "prefer_australian")).toBe(true);
  });
});

describe("content and design approval dependencies", () => {
  it("full pipeline: content approval → designs → design approval → schedule → publish (sandbox) → archive", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    const ig = ps.find((p) => p.platform === "instagram")!;
    await cleanPost(ig.id);
    await decidePost(db, owner, ig.id, "approve");
    const afterApprove = await db.query.posts.findFirst({ where: eq(posts.id, ig.id) });
    expect(afterApprove?.status).toBe("awaiting_design");
    expect(afterApprove?.contentApprovedBy).toBe(owner.id);

    const ds = await db.select().from(designs).where(eq(designs.postId, ig.id));
    expect(ds.length).toBeGreaterThanOrEqual(2);
    expect(ds[0].svg).toContain("<svg");

    const rec = await decideDesign(db, owner, ds[0].id, "approve");
    expect(rec?.reason).toMatch(/Brisbane/);
    const ready = await db.query.posts.findFirst({ where: eq(posts.id, ig.id) });
    expect(ready?.status).toBe("approved_for_publishing");

    await upsertAccount(db, "instagram", { accessToken: "sandbox", handle: "@sbf-test" }, null, undefined, "sandbox");
    await schedulePost(db, owner, ig.id, new Date(Date.now() + 3600_000), null);
    const res = await publishPost(db, ig.id);
    expect(res.status).toBe("published");
    const done = await db.query.posts.findFirst({ where: eq(posts.id, ig.id) });
    expect(done?.status).toBe("published");
    expect(done?.liveUrl).toMatch(/^https:\/\/sandbox\.local/);
  });

  it("blocks design approval before content approval", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    const [d] = await db.insert(designs).values({ postId: ps[0].id, format: "ig_square", width: 1080, height: 1080, svg: "<svg/>" }).returning();
    await expect(decideDesign(db, owner, d.id, "approve")).rejects.toThrow(/content must be approved/);
  });

  it("blocks scheduling without both approvals", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    await expect(schedulePost(db, owner, ps[0].id, new Date(Date.now() + 3600_000), null)).rejects.toThrow(/approved/);
  });

  it("a substantive edit after approval resets approval (renewed approval required)", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    const ig = ps.find((p) => p.platform === "instagram")!;
    await cleanPost(ig.id);
    await decidePost(db, owner, ig.id, "approve");
    const r = await editPost(db, owner, ig.id, { caption: "A completely different caption. Who decided that?" });
    expect(r.reset).toBe(true);
    const p = await db.query.posts.findFirst({ where: eq(posts.id, ig.id) });
    expect(p?.status).toBe("awaiting_content");
    expect(p?.approvedContentHash).toBeNull();
    expect(p?.version).toBeGreaterThan(1);
  });

  it("refuses to publish content changed after approval even if status says scheduled", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    const ig = ps.find((p) => p.platform === "instagram")!;
    await cleanPost(ig.id);
    await decidePost(db, owner, ig.id, "approve");
    const [d] = await db.select().from(designs).where(eq(designs.postId, ig.id)).limit(1);
    await decideDesign(db, owner, d.id, "approve");
    await upsertAccount(db, "instagram", { accessToken: "sandbox", handle: "@t" }, null, undefined, "sandbox");
    await schedulePost(db, owner, ig.id, new Date(Date.now() + 3600_000), null);
    // Tamper directly in the database (bypassing editPost)
    await db.update(posts).set({ caption: "sneaky change" }).where(eq(posts.id, ig.id));
    const res = await publishPost(db, ig.id);
    expect(res.status).toBe("blocked");
  });

  it("brand checker blocks approval of off-brand copy (exclamation, avoid words, unsourced stats)", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    await editPost(db, owner, ps[0].id, { caption: "Time to slay your journey! 87% of women agree." });
    await expect(decidePost(db, owner, ps[0].id, "approve")).rejects.toThrow(/brand issues/);
    const p = await db.query.posts.findFirst({ where: eq(posts.id, ps[0].id) });
    const rules = p!.brandIssues.map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["no-exclamation", "avoid-word", "unverified-figure"]));
  });
});

describe("publishing safety", () => {
  async function scheduledIg() {
    const { posts: ps } = await approvedStoryWithPosts();
    const ig = ps.find((p) => p.platform === "instagram")!;
    await cleanPost(ig.id);
    await decidePost(db, owner, ig.id, "approve");
    const [d] = await db.select().from(designs).where(eq(designs.postId, ig.id)).limit(1);
    await decideDesign(db, owner, d.id, "approve");
    await upsertAccount(db, "instagram", { accessToken: "sandbox", handle: "@t" }, null, undefined, "sandbox");
    await schedulePost(db, owner, ig.id, new Date(Date.now() + 3600_000), null);
    return ig.id;
  }

  it("prevents duplicate publishing when two workers race", async () => {
    const id = await scheduledIg();
    const [a, b] = await Promise.all([publishPost(db, id), publishPost(db, id)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual(["published", "skipped"]);
  });

  it("retries on API failure, then records failure accurately", async () => {
    const id = await scheduledIg();
    process.env.SANDBOX_FAIL_NEXT = "1";
    const r1 = await publishPost(db, id);
    expect(r1.status).toBe("retrying");
    let p = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    expect(p?.status).toBe("scheduled");
    expect(p?.publishAttempts).toBe(1);
    await publishPost(db, id);
    const r3 = await publishPost(db, id);
    expect(r3.status).toBe("failed");
    p = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    expect(p?.status).toBe("failed");
    expect(p?.liveUrl).toBeNull();
  });

  it("never marks manual posts as published until the owner confirms the URL", async () => {
    const { posts: ps } = await approvedStoryWithPosts();
    const tt = ps.find((p) => p.platform === "tiktok")!;
    await cleanPost(tt.id);
    await decidePost(db, owner, tt.id, "approve");
    const [d] = await db.select().from(designs).where(eq(designs.postId, tt.id)).limit(1);
    await decideDesign(db, owner, d.id, "approve");
    const r = await publishPost(db, tt.id);
    expect(r.status).toBe("manual_required");
    expect((await db.query.posts.findFirst({ where: eq(posts.id, tt.id) }))?.publishedAt).toBeNull();
    await confirmManualPublish(db, owner, tt.id, "https://www.tiktok.com/@sbf/video/1");
    expect((await db.query.posts.findFirst({ where: eq(posts.id, tt.id) }))?.status).toBe("published");
  });

  it("demo content cannot be published to a live account", async () => {
    const id = await scheduledIg();
    await db.update(accounts).set({ mode: "live" }).where(and(eq(accounts.platform, "instagram")));
    const r = await publishPost(db, id);
    expect(r.status).toBe("failed");
    expect(r.detail).toMatch(/Demo/);
  });

  it("content hash is stable for identical content", () => {
    const p = { hook: "a.", caption: "b", supportingCopy: null, callToAction: "Join the circle", hashtags: ["#x"], platform: "x", format: "post", altText: null, script: null };
    expect(contentHash(p)).toBe(contentHash({ ...p }));
    expect(contentHash(p)).not.toBe(contentHash({ ...p, caption: "c" }));
  });
});

describe("community safeguards", () => {
  it("sensitive disclosures get no drafted reply and are never auto-sent", async () => {
    await setSetting(db, "autoReplyEnabled", true);
    await setSetting(db, "autoReplyCategories", ["positive", "sensitive", "general"]);
    const [i] = await db.insert(interactions).values({ platform: "instagram", kind: "comment", author: "someone", text: "My partner is controlling and hits me when he's angry. What should I do?", isSandbox: true }).returning();
    await triageInteraction(db, i.id);
    const row = await db.query.interactions.findFirst({ where: eq(interactions.id, i.id) });
    expect(row?.sensitive).toBe(true);
    expect(row?.suggestedReply).toBeNull();
    expect(row?.status).not.toBe("replied");
    await expect(sendReply(db, { email: "auto" }, i.id, "Thinking of you.", true)).rejects.toThrow(/Sensitive/);
  });

  it("auto replies stay off unless explicitly enabled", async () => {
    const [i] = await db.insert(interactions).values({ platform: "instagram", kind: "comment", author: "fan", text: "Love this, needed it today", isSandbox: true }).returning();
    await triageInteraction(db, i.id);
    const row = await db.query.interactions.findFirst({ where: eq(interactions.id, i.id) });
    expect(row?.status).not.toBe("replied");
  });
});
