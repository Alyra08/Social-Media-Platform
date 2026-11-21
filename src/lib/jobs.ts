import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobLocks, posts, stories } from "@/db/schema";
import { runResearch } from "./research";
import { publishDue } from "./publishing";
import { syncInteractions } from "./community";
import { generateReport, syncMetrics } from "./analytics";
import { runCompetitorReport } from "./competitors";
import { refreshExpiringTokens } from "./integrations/registry";
import { getSetting, logActivity, notify } from "./system";

/**
 * Automation engine: named jobs with schedules (Brisbane time), a DB lock so a job never
 * runs twice concurrently (even across multiple app instances), and an activity log entry
 * for every run. Event-triggered steps (approval → brief → content → design) live in workflow.ts.
 */
export type JobName =
  | "research:daily"
  | "research:breaking"
  | "publish:due"
  | "community:sync"
  | "analytics:sync"
  | "tokens:refresh"
  | "review:daily"
  | "report:weekly"
  | "report:monthly"
  | "report:quarterly"
  | "competitors:weekly";

export const JOBS: Record<JobName, { cron: string; description: string; run: (db: Db) => Promise<unknown> }> = {
  "research:daily": { cron: "0 6 * * *", description: "Daily research sweep at 6:00 am Brisbane", run: (db) => runResearch(db, "daily") },
  "research:breaking": { cron: "0 9,12,15,18 * * *", description: "Breaking-news and viral-conversation check", run: (db) => runResearch(db, "breaking") },
  "publish:due": { cron: "* * * * *", description: "Publish approved posts that are due", run: publishDue },
  "community:sync": { cron: "*/15 * * * *", description: "Pull comments, mentions and messages", run: syncInteractions },
  "analytics:sync": { cron: "30 */6 * * *", description: "Refresh post analytics", run: syncMetrics },
  "tokens:refresh": { cron: "0 */4 * * *", description: "Refresh expiring account tokens", run: refreshExpiringTokens },
  "review:daily": { cron: "0 8 * * *", description: "Outstanding approvals, upcoming posts and failures", run: dailyReview },
  "report:weekly": { cron: "0 7 * * 1", description: "Weekly performance report (Mondays)", run: (db) => generateReport(db, "weekly") },
  "report:monthly": { cron: "0 7 1 * *", description: "Monthly analytics report", run: (db) => generateReport(db, "monthly") },
  "report:quarterly": { cron: "0 7 1 1,4,7,10 *", description: "Quarterly performance review", run: (db) => generateReport(db, "quarterly") },
  "competitors:weekly": { cron: "0 7 * * 1", description: "Weekly competitor intelligence", run: runCompetitorReport },
};

export async function runJob(db: Db, name: JobName, opts: { force?: boolean } = {}) {
  if (!opts.force && !(await getSetting(db, "automationEnabled"))) return { skipped: true };
  const lockMs = name === "publish:due" ? 55_000 : 30 * 60_000;
  const now = new Date();
  // Acquire lock atomically.
  const acquired = await db
    .insert(jobLocks)
    .values({ name, lockedUntil: new Date(now.getTime() + lockMs) })
    .onConflictDoUpdate({ target: jobLocks.name, set: { lockedUntil: new Date(now.getTime() + lockMs) }, setWhere: lt(jobLocks.lockedUntil, now) })
    .returning();
  if (!acquired.length) return { skipped: true, reason: "already running" };
  try {
    const result = await JOBS[name].run(db);
    await db.update(jobLocks).set({ lockedUntil: new Date(0), lastRunAt: new Date() }).where(eq(jobLocks.name, name));
    return { ok: true, result };
  } catch (e) {
    await db.update(jobLocks).set({ lockedUntil: new Date(0), lastRunAt: new Date() }).where(eq(jobLocks.name, name));
    await logActivity(db, name, "failed", e instanceof Error ? e.message : String(e));
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function dailyReview(db: Db) {
  const count = async (statuses: string[]) => (await db.select({ n: sql<number>`count(*)::int` }).from(posts).where(inArray(posts.status, statuses)))[0].n;
  const pendingStories = (await db.select({ n: sql<number>`count(*)::int` }).from(stories).where(eq(stories.status, "pending")))[0].n;
  const awaitingContent = await count(["awaiting_content", "revision_requested"]);
  const awaitingDesign = await count(["awaiting_design"]);
  const failed = await count(["failed"]);
  const manual = await count(["manual_required"]);
  const upcoming = (
    await db
      .select({ n: sql<number>`count(*)::int` })
      .from(posts)
      .where(and(eq(posts.status, "scheduled"), lt(posts.scheduledAt, new Date(Date.now() + 86400_000))))
  )[0].n;
  const lines = [
    pendingStories && `${pendingStories} stories to review`,
    awaitingContent && `${awaitingContent} posts awaiting content approval`,
    awaitingDesign && `${awaitingDesign} posts awaiting design approval`,
    upcoming && `${upcoming} posts going out in the next 24 hours`,
    manual && `${manual} posts ready to publish manually`,
    failed && `${failed} publishing failures to look at`,
  ].filter(Boolean);
  if (lines.length) await notify(db, failed ? "publish_failed" : "system", "Your morning summary", lines.join(". ") + ".", "/");
  await logActivity(db, "review:daily", "ok", lines.join("; ") || "Nothing outstanding");
}
