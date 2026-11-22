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
  views: number;
  profileVisits: number;
  watchTimeSeconds: number;
  completionRate: number | null;
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
      views: m.views, profileVisits: m.profileVisits, watchTimeSeconds: m.watchTimeSeconds, completionRate: m.completionRate,
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

/* ───────────── Algorithm signals and decisions (Overview) ───────────── */

export type Signal = { key: string; label: string; value: number | null; prev: number | null; unit: "pct" | "sec"; why: string; act: string };

const perReach = (perf: PostPerf[], k: (p: PostPerf) => number) => {
  const reach = perf.reduce((a, p) => a + (p.reach || p.impressions), 0);
  return reach ? perf.reduce((a, p) => a + k(p), 0) / reach : null;
};
const avgCompletion = (perf: PostPerf[]) => {
  const v = perf.filter((p) => p.completionRate != null);
  return v.length ? v.reduce((a, p) => a + (p.completionRate ?? 0), 0) / v.length : null;
};
const watchPerView = (perf: PostPerf[]) => {
  const views = perf.reduce((a, p) => a + p.views, 0);
  return views ? perf.reduce((a, p) => a + p.watchTimeSeconds, 0) / views : null;
};

/**
 * The ranking signals platforms reward, each as a rate (so a quiet week and a big week compare fairly),
 * with what it means and what to do. Instagram has said publicly that watch time, likes and sends
 * (shares) are its biggest ranking signals; TikTok and YouTube lean heavily on watch time and completion.
 */
export function algorithmSignals(perf: PostPerf[], prev: PostPerf[]): Signal[] {
  return [
    { key: "share", label: "Share rate", value: perReach(perf, (p) => p.shares), prev: perReach(prev, (p) => p.shares), unit: "pct", why: "Shares and sends are the strongest signal for reaching people who don't follow you yet.", act: "Make posts people send to a friend: specific, quotable, a little brave." },
    { key: "save", label: "Save rate", value: perReach(perf, (p) => p.saves), prev: perReach(prev, (p) => p.saves), unit: "pct", why: "Saves tell the platform the post is worth coming back to.", act: "Carousels with scripts, lists and how-tos earn saves." },
    { key: "comment", label: "Comment rate", value: perReach(perf, (p) => p.comments), prev: perReach(prev, (p) => p.comments), unit: "pct", why: "Conversation keeps a post in circulation for longer.", act: "End with a real question and reply within a day." },
    { key: "completion", label: "Video completion", value: avgCompletion(perf), prev: avgCompletion(prev), unit: "pct", why: "Watch time and finishing the video are top signals for Reels, TikTok and YouTube.", act: "Put the hook in the first two seconds and cut anything that doesn't earn its place." },
    { key: "watch", label: "Watch time per view", value: watchPerView(perf), prev: watchPerView(prev), unit: "sec", why: "Longer average watch time tells the platform people stayed.", act: "Open on the twist, not the intro." },
    { key: "profile", label: "Profile visit rate", value: perReach(perf, (p) => p.profileVisits), prev: perReach(prev, (p) => p.profileVisits), unit: "pct", why: "Curiosity about the brand: the step before a follow.", act: "Keep the bio and pinned posts pointing to the circle and the Sunday note." },
    { key: "click", label: "Link click rate", value: perReach(perf, (p) => p.clicks), prev: perReach(prev, (p) => p.clicks), unit: "pct", why: "Moves people off the platform to things you own: the Sunday note and the website.", act: "Say exactly what happens: \"Get the Sunday note\"." },
  ];
}

const PLATFORM_NAMES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", pinterest: "Pinterest", threads: "Threads", x: "X", bluesky: "Bluesky", youtube: "YouTube", sandbox: "Sandbox" };
const BRISBANE_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const brisbane = (d: Date) => new Date(d.getTime() + 10 * 3600_000);
/** "Strong signal" score: weights shares and saves above likes, matching what platforms reward. */
const signalScore = (p: PostPerf) => (p.shares * 3 + p.saves * 2 + p.comments * 1.5 + p.likes) / Math.max(1, p.reach || p.impressions);

/** Plain-English decisions from the data. Each states its sample size; nothing appears without enough posts. */
export function dataDecisions(perf: PostPerf[]): string[] {
  if (perf.length < 5) return [`Decisions appear once at least 5 posts have results (${perf.length} so far). Keep posting consistently: the data needs volume before it can guide you.`];
  const out: string[] = [];
  const best = (key: (p: PostPerf) => string, min = 2) => {
    const g = new Map<string, { n: number; s: number }>();
    for (const p of perf) {
      const k = key(p);
      const c = g.get(k) ?? { n: 0, s: 0 };
      c.n++;
      c.s += signalScore(p);
      g.set(k, c);
    }
    return [...g.entries()].filter(([, v]) => v.n >= min).map(([k, v]) => ({ k, n: v.n, avg: v.s / v.n })).sort((a, b) => b.avg - a.avg);
  };
  const lift = (a: number, b: number) => (b > 0 ? Math.round((a / b - 1) * 100) : 0);
  const overall = perf.reduce((a, p) => a + signalScore(p), 0) / perf.length;

  const plat = best((p) => PLATFORM_NAMES[p.platform] ?? p.platform);
  if (plat.length >= 2) out.push(`Lean into ${plat[0].k}: its posts earn ${lift(plat[0].avg, overall)}% more shares, saves and comments per person reached than your average (${plat[0].n} posts). ${plat.at(-1)!.k} is weakest (${plat.at(-1)!.n} posts): adapt the format there rather than cross-posting.`);
  const fmt = best((p) => p.format.replace(/_/g, " "));
  if (fmt.length >= 2) out.push(`Make more ${fmt[0].k} posts: the strongest format for algorithm signals (${fmt[0].n} posts). Fewer ${fmt.at(-1)!.k} posts, or give them a stronger hook.`);
  const cat = best((p) => CATEGORY_LABELS[p.category] ?? p.category);
  if (cat.length >= 2) out.push(`"${cat[0].k}" is the content pillar your audience pushes furthest (${cat[0].n} posts). Consider a recurring weekly series on it.`);
  const day = best((p) => (p.publishedAt ? BRISBANE_DAYS[brisbane(p.publishedAt).getUTCDay()] : "unknown"));
  if (day.length >= 2 && day[0].k !== "unknown") out.push(`${day[0].k} posts perform best (${day[0].n} posts, Brisbane time). Schedule your strongest piece of the week then.`);
  const hour = best((p) => {
    if (!p.publishedAt) return "unknown";
    const h = brisbane(p.publishedAt).getUTCHours();
    return h < 9 ? "early morning (before 9am)" : h < 12 ? "mid-morning (9am to noon)" : h < 17 ? "afternoon (noon to 5pm)" : "evening (after 5pm)";
  });
  if (hour.length >= 2 && hour[0].k !== "unknown") out.push(`Best time window: ${hour[0].k} (${hour[0].n} posts).`);
  for (const i of computeInsights(perf)) if (!out.some((o) => o.startsWith(i.slice(0, 20)))) out.push(i);
  return out.slice(0, 6);
}
