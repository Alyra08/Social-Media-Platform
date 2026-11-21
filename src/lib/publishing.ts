import { and, eq, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, posts } from "@/db/schema";
import { adapterFor, credentialsFor, NON_NETWORK } from "./integrations/registry";
import { designPng } from "./design/png";
import { publicDesignUrl } from "./files";
import { assertPublishable, WorkflowError } from "./workflow";
import { audit, logActivity, notify, SYSTEM, type Actor } from "./system";

const MAX_ATTEMPTS = 3;

/** Build the final platform-specific text: caption + CTA + hashtags, respecting platform norms. */
export function finalText(p: typeof posts.$inferSelect): string {
  const tags = p.hashtags.length ? `\n\n${p.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "";
  const cta = p.callToAction && !p.caption.includes(p.callToAction) ? `\n\n${p.callToAction}.` : "";
  const text = `${p.caption}${cta}${tags}`.replace(/\.\.$/, ".");
  if (p.platform === "x") return text.slice(0, 280);
  if (p.platform === "bluesky") return text.slice(0, 300);
  return text;
}

/** Platform technical checks before attempting to publish. */
export function technicalCheck(p: typeof posts.$inferSelect): string[] {
  const problems: string[] = [];
  const text = finalText(p);
  const limits: Record<string, number> = { instagram: 2200, facebook: 63206, tiktok: 2200, linkedin: 3000, pinterest: 500, threads: 500, x: 280, bluesky: 300, youtube: 5000 };
  if (limits[p.platform] && text.length > limits[p.platform]) problems.push(`Text is ${text.length} characters; ${p.platform} allows ${limits[p.platform]}.`);
  if (p.platform === "instagram" && p.hashtags.length > 30) problems.push("Instagram allows at most 30 hashtags.");
  if (!p.altText && !NON_NETWORK.includes(p.platform)) problems.push("Alt text is missing.");
  return problems;
}

/**
 * Publish one post now. Uses an atomic status claim so a post can never be published twice
 * (duplicate publishing prevention), and never marks a manual post as published until the
 * owner confirms the live URL.
 */
export async function publishPost(db: Db, postId: string, actor: Actor = SYSTEM): Promise<{ status: string; detail?: string }> {
  const claimed = await db
    .update(posts)
    .set({ status: "publishing", updatedAt: new Date() })
    .where(and(eq(posts.id, postId), inArray(posts.status, ["scheduled", "approved_for_publishing", "failed"])))
    .returning();
  const p = claimed[0];
  if (!p) return { status: "skipped", detail: "Already being published or not publishable." };

  const revert = async (status: string, set: Partial<typeof posts.$inferInsert> = {}) => {
    await db.update(posts).set({ status, updatedAt: new Date(), ...set }).where(eq(posts.id, p.id));
  };

  try {
    assertPublishable({ ...p, status: "scheduled" });
  } catch (e) {
    await revert("awaiting_content", { lastError: (e as Error).message });
    await notify(db, "publish_failed", "Publishing blocked: approval missing", (e as Error).message, `/content`);
    await logActivity(db, "publish", "skipped", `${p.id}: ${(e as Error).message}`);
    return { status: "blocked", detail: (e as Error).message };
  }

  const tech = technicalCheck(p);
  if (tech.length) {
    await revert("failed", { lastError: tech.join(" ") });
    await notify(db, "publish_failed", `Can't publish: ${p.hook}`, tech.join(" "), "/publishing");
    return { status: "failed", detail: tech.join(" ") };
  }

  // Newsletter / community content and platforms without direct API publishing → manual.
  const acc = p.accountId
    ? await db.query.accounts.findFirst({ where: eq(accounts.id, p.accountId) })
    : await db.query.accounts.findFirst({ where: and(eq(accounts.platform, p.platform), eq(accounts.status, "connected")) });
  const adapter = acc ? adapterFor(acc.mode === "sandbox" ? "sandbox" : acc.platform) : undefined;

  if (p.isDemo && acc && adapter && acc.mode !== "sandbox" && !NON_NETWORK.includes(p.platform)) {
    await revert("failed", { lastError: "Demo content can only be published to a sandbox account." });
    return { status: "failed", detail: "Demo content can't go to a live account." };
  }

  if (NON_NETWORK.includes(p.platform) || !acc || !adapter) {
    const instructions = NON_NETWORK.includes(p.platform)
      ? `This ${p.platform === "newsletter" ? "Sunday note section" : "community prompt"} is ready. Copy it into your email tool or community space, then confirm it here.`
      : `No connected ${p.platform} account. Connect one in Integrations, or publish manually: download the approved design, paste the caption, then confirm with the live URL.`;
    await revert("manual_required", { manualInstructions: instructions });
    await notify(db, "manual_publish_needed", `Ready to publish manually: ${p.hook}`, instructions, "/publishing");
    await logActivity(db, "publish", "skipped", `${p.id}: manual (${p.platform})`);
    return { status: "manual_required", detail: instructions };
  }

  let imageBytes: Buffer | null = null;
  if (p.approvedDesignId) imageBytes = (await designPng(db, p.approvedDesignId)).bytes;
  const result = await adapter.publish(credentialsFor(acc), {
    postId: p.id,
    caption: finalText(p),
    altText: p.altText,
    imageUrl: p.approvedDesignId ? publicDesignUrl(p.approvedDesignId) : null,
    imageBytes,
    format: p.format,
    idempotencyKey: p.idempotencyKey ?? `${p.id}:v${p.version}`,
  });

  const attempts = p.publishAttempts + 1;
  if (result.kind === "published") {
    await revert("published", { liveUrl: result.url, externalId: result.externalId, publishedAt: new Date(), publishAttempts: attempts, lastError: null, accountId: acc.id });
    await audit(db, actor, "post.published", "post", p.id, result.url);
    await notify(db, "post_published", `Published on ${adapter.name}${acc.mode === "sandbox" ? " (sandbox)" : ""}`, p.hook, result.url);
    await logActivity(db, "publish", "ok", `${p.platform} ${result.url}`);
    await scheduleRecurrence(db, p);
    return { status: "published", detail: result.url };
  }
  if (result.kind === "manual") {
    await revert("manual_required", { manualInstructions: result.instructions, publishAttempts: attempts });
    await notify(db, "manual_publish_needed", `Publish manually on ${adapter.name}`, result.instructions, "/publishing");
    return { status: "manual_required", detail: result.instructions };
  }
  // failed
  if (result.retryable && attempts < MAX_ATTEMPTS) {
    await revert("scheduled", { publishAttempts: attempts, lastError: result.error, scheduledAt: new Date(Date.now() + attempts * 5 * 60_000) });
    await logActivity(db, "publish", "failed", `${p.id} attempt ${attempts}, retrying: ${result.error}`);
    return { status: "retrying", detail: result.error };
  }
  await revert("failed", { publishAttempts: attempts, lastError: result.error });
  await notify(db, "publish_failed", `Publishing failed on ${adapter.name}`, result.error, "/publishing");
  await logActivity(db, "publish", "failed", `${p.id}: ${result.error}`);
  return { status: "failed", detail: result.error };
}

/** Owner confirms a manual publication with its live URL (never assumed). */
export async function confirmManualPublish(db: Db, actor: Actor, postId: string, liveUrl: string) {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!p || p.status !== "manual_required") throw new WorkflowError("This post isn't waiting for manual publication.");
  if (!/^https?:\/\//.test(liveUrl)) throw new WorkflowError("Enter the live post URL.");
  await db.update(posts).set({ status: "published", liveUrl, publishedAt: new Date(), updatedAt: new Date() }).where(eq(posts.id, postId));
  await audit(db, actor, "post.confirm_manual_publish", "post", postId, liveUrl);
}

async function scheduleRecurrence(db: Db, p: typeof posts.$inferSelect) {
  if (!p.recurrence || !p.scheduledAt) return;
  const next = new Date(p.scheduledAt);
  if (p.recurrence === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (p.recurrence === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else return;
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = p;
  void _i; void _c; void _u;
  // The recurring copy keeps the same approved content and design; any edit resets approval.
  await db.insert(posts).values({ ...rest, status: "scheduled", scheduledAt: next, publishedAt: null, liveUrl: null, externalId: null, publishAttempts: 0, lastError: null, idempotencyKey: `${p.id}:recur:${next.toISOString()}` });
}

/** Called every minute by the scheduler. */
export async function publishDue(db: Db) {
  const due = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, new Date())));
  const out = [];
  for (const d of due) out.push(await publishPost(db, d.id));
  return out;
}
