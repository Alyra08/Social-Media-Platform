import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, postMetrics, posts, reports } from "@/db/schema";
import { adapterFor, credentialsFor } from "./integrations/registry";
import { aiEnabled, structured } from "./ai/client";
import { SBF_BRAND_BRIEF, CATEGORY_LABELS } from "./brand/brief";
import { logActivity, notify } from "./system";

/**
 * Analytics. Only real, API-sourced metrics count: sandbox metrics are flagged and excluded,
 * and every insight states the sample it is based on. No figures are generated without data.
 */

export async function syncMetrics(db: Db) {
  const published = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "published"), gte(posts.publishedAt, new Date(Date.now() - 60 * 86400_000))));
  let n = 0;
  for (const p of published) {
    if (!p.accountId || !p.externalId) continue;
    const acc = await db.query.accounts.findFirst({ where: eq(accounts.id, p.accountId) });
    if (!acc) continue;
    const adapter = adapterFor(acc.mode === "sandbox" ? "sandbox" : acc.platform);
    if (!adapter?.fetchMetrics) continue;
    try {
      const m = await adapter.fetchMetrics(credentialsFor(acc), p.externalId);
      await db.insert(postMetrics).values({ postId: p.id, platform: p.platform, isSandbox: acc.mode === "sandbox", ...m });
      n++;
    } catch (e) {
      await logActivity(db, "analytics:sync", "failed", `${p.platform} ${p.id}: ${(e as Error).message}`);
    }
  }
  await logActivity(db, "analytics:sync", "ok", `${n} posts updated`);
}

export type PostPerf = {
  postId: string;
  platform: string;
  category: string;
  format: string;
  hook: string;
  treatment: string;
  publishedAt: Date | null;
  liveUrl: string | null;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  engagementRate: number;
};

/** Latest snapshot per published post in a period (real data only unless includeSandbox). */
export async function postPerformance(db: Db, from: Date, to: Date, includeSandbox = false): Promise<PostPerf[]> {
  const rows = await db
    .select({ p: posts, m: postMetrics })
    .from(postMetrics)
    .innerJoin(posts, eq(posts.id, postMetrics.postId))
    .where(and(gte(posts.publishedAt, from), lte(posts.publishedAt, to), includeSandbox ? undefined : eq(postMetrics.isSandbox, false)))
    .orderBy(desc(postMetrics.capturedAt));
  const seen = new Map<string, PostPerf>();
  for (const { p, m } of rows) {
    if (seen.has(p.id)) continue;
    const denom = Math.max(1, m.reach || m.impressions);
    seen.set(p.id, {
      postId: p.id, platform: p.platform, category: p.category, format: p.format, hook: p.hook, treatment: p.treatment, publishedAt: p.publishedAt, liveUrl: p.liveUrl,
      impressions: m.impressions, reach: m.reach, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, clicks: m.clicks,
      engagementRate: (m.likes + m.comments + m.shares + m.saves) / denom,
    });
  }
  return [...seen.values()];
}

type Group = { key: string; n: number; avgEr: number; shares: number; saves: number; comments: number };
export function groupBy(perf: PostPerf[], key: (p: PostPerf) => string): Group[] {
  const g = new Map<string, Group>();
  for (const p of perf) {
    const k = key(p);
    const cur = g.get(k) ?? { key: k, n: 0, avgEr: 0, shares: 0, saves: 0, comments: 0 };
    cur.avgEr = (cur.avgEr * cur.n + p.engagementRate) / (cur.n + 1);
    cur.n++;
    cur.shares += p.shares;
    cur.saves += p.saves;
    cur.comments += p.comments;
    g.set(k, cur);
  }
  return [...g.values()].sort((a, b) => b.avgEr - a.avgEr);
}

/** Rule-based insights computed from the data (each one cites its sample size). */
export function computeInsights(perf: PostPerf[]): string[] {
  if (perf.length < 5) return [`Only ${perf.length} published post${perf.length === 1 ? "" : "s"} with analytics so far. Insights appear once there are at least 5.`];
  const out: string[] = [];
  const avgShares = perf.reduce((a, p) => a + p.shares, 0) / perf.length;
  for (const c of groupBy(perf, (p) => p.category).filter((c) => c.n >= 3)) {
    const catShares = c.shares / c.n;
    if (avgShares > 0 && catShares > avgShares * 1.2) {
      out.push(`Posts on ${CATEGORY_LABELS[c.key] ?? c.key} averaged ${Math.round((catShares / avgShares - 1) * 100)}% more shares than your average (${c.n} posts). Consider a recurring series.`);
    }
  }
  const byFormat = groupBy(perf, (p) => `${p.platform} ${p.format}`).filter((g) => g.n >= 3);
  if (byFormat.length >= 2) out.push(`Best format: ${byFormat[0].key} (${(byFormat[0].avgEr * 100).toFixed(1)}% engagement across ${byFormat[0].n} posts). Weakest: ${byFormat.at(-1)!.key}.`);
  const byTreatment = groupBy(perf, (p) => p.treatment).filter((g) => g.n >= 3);
  if (byTreatment.length >= 2) out.push(`${byTreatment[0].key} treatments are engaging best (${(byTreatment[0].avgEr * 100).toFixed(1)}%, ${byTreatment[0].n} posts).`);
  const topSaves = [...perf].sort((a, b) => b.saves - a.saves)[0];
  if (topSaves.saves > 0) out.push(`Most saved: "${topSaves.hook}" (${topSaves.saves} saves). Saves signal evergreen value: consider repurposing.`);
  return out;
}

const NarrativeSchema = z.object({ summary: z.string(), recommendations: z.array(z.string()) });

export async function generateReport(db: Db, kind: "daily" | "weekly" | "monthly" | "quarterly") {
  const days = { daily: 1, weekly: 7, monthly: 30, quarterly: 91 }[kind];
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const perf = await postPerformance(db, from, to);
  const totals = perf.reduce((a, p) => ({ impressions: a.impressions + p.impressions, reach: a.reach + p.reach, likes: a.likes + p.likes, comments: a.comments + p.comments, shares: a.shares + p.shares, saves: a.saves + p.saves }), { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0 });
  const insights = computeInsights(perf);
  const pipeline = await db.select({ status: posts.status, n: sql<number>`count(*)::int` }).from(posts).groupBy(posts.status);
  let narrative: z.infer<typeof NarrativeSchema> | null = null;
  if (aiEnabled() && perf.length >= 3) {
    narrative = await structured({
      schema: NarrativeSchema,
      system: SBF_BRAND_BRIEF,
      task: "Write a short performance summary and 3–5 practical recommendations for the SBF owner. Use ONLY the numbers provided. Do not invent or extrapolate statistics. British spelling.",
      input: JSON.stringify({ kind, totals, posts: perf.slice(0, 40), insights }),
      effort: "low",
      maxTokens: 4000,
    }).catch(() => null);
  }
  const [r] = await db
    .insert(reports)
    .values({
      kind,
      periodStart: from.toISOString().slice(0, 10),
      periodEnd: to.toISOString().slice(0, 10),
      title: `${kind[0].toUpperCase()}${kind.slice(1)} performance report`,
      data: { totals, postCount: perf.length, insights, narrative, top: [...perf].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5), bottom: [...perf].sort((a, b) => a.engagementRate - b.engagementRate).slice(0, 3), pipeline },
    })
    .returning();
  await notify(db, "report_ready", `${r.title} is ready`, undefined, `/analytics/reports/${r.id}`);
  await logActivity(db, `report:${kind}`, "ok", `${perf.length} posts analysed`);
  return r.id;
}

export async function weeklyOverview(db: Db, weekStart: Date) {
  const end = new Date(weekStart.getTime() + 7 * 86400_000);
  const rows = await db
    .select()
    .from(posts)
    .where(and(gte(posts.scheduledAt, weekStart), lte(posts.scheduledAt, end)));
  const awaiting = await db.select({ id: posts.id }).from(posts).where(inArray(posts.status, ["awaiting_content", "awaiting_design", "revision_requested"]));
  const count = (f: (p: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const dist = (k: "category" | "platform") => rows.reduce<Record<string, number>>((a, p) => ((a[p[k]] = (a[p[k]] ?? 0) + 1), a), {});
  return {
    planned: rows.length,
    awaitingApproval: awaiting.length,
    scheduled: count((p) => p.status === "scheduled"),
    published: count((p) => p.status === "published"),
    byCategory: dist("category"),
    byPlatform: dist("platform"),
  };
}
