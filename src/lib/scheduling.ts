import { and, eq, gte, lte, ne, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { postMetrics, posts } from "@/db/schema";
import { getSetting } from "./system";

/**
 * Posting-time optimisation. Brisbane has no daylight saving: UTC+10 all year.
 * With ≥ MIN_SAMPLES real (non-sandbox) published posts on a platform, recommendations come
 * from SBF's own engagement by weekday and hour. Below that, a conservative starting baseline
 * is used and the explanation says so.
 */
const TZ_OFFSET_H = 10;
const MIN_SAMPLES = 12;

const BASELINE: Record<string, { hours: number[]; days: number[] }> = {
  instagram: { hours: [7, 12, 19, 20], days: [1, 2, 3, 4, 6] },
  facebook: { hours: [8, 12, 19], days: [1, 2, 3, 4] },
  tiktok: { hours: [18, 19, 20, 21], days: [2, 3, 4, 5, 6] },
  linkedin: { hours: [8, 9, 12], days: [2, 3, 4] },
  pinterest: { hours: [20, 21], days: [0, 5, 6] },
  threads: { hours: [7, 12, 20], days: [1, 2, 3, 4, 5] },
  x: { hours: [8, 12, 17], days: [1, 2, 3, 4] },
  bluesky: { hours: [8, 12, 19], days: [1, 2, 3, 4] },
  youtube: { hours: [17, 18, 19], days: [4, 5, 6] },
  newsletter: { hours: [7], days: [0] }, // the Sunday note
  community: { hours: [19, 20], days: [1, 3] },
  sandbox: { hours: [9, 12, 18], days: [0, 1, 2, 3, 4, 5, 6] },
};

const toLocal = (d: Date) => new Date(d.getTime() + TZ_OFFSET_H * 3600_000);
const fromLocal = (y: number, m: number, day: number, h: number) => new Date(Date.UTC(y, m, day, h - TZ_OFFSET_H, 0, 0));
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

async function learnedSlots(db: Db, platform: string) {
  const rows = await db
    .select({ publishedAt: posts.publishedAt, reach: postMetrics.reach, impressions: postMetrics.impressions, likes: postMetrics.likes, comments: postMetrics.comments, shares: postMetrics.shares, saves: postMetrics.saves })
    .from(postMetrics)
    .innerJoin(posts, eq(posts.id, postMetrics.postId))
    .where(and(eq(posts.platform, platform), eq(postMetrics.isSandbox, false)));
  if (rows.length < MIN_SAMPLES) return null;
  const slot = new Map<string, { sum: number; n: number }>();
  let total = 0;
  for (const r of rows) {
    if (!r.publishedAt) continue;
    const l = toLocal(r.publishedAt);
    const er = (r.likes + r.comments * 2 + r.shares * 3 + r.saves * 3) / Math.max(1, r.reach || r.impressions);
    total += er;
    const k = `${l.getUTCDay()}-${l.getUTCHours()}`;
    const s = slot.get(k) ?? { sum: 0, n: 0 };
    s.sum += er;
    s.n++;
    slot.set(k, s);
  }
  const avg = total / rows.length;
  return [...slot.entries()]
    .filter(([, s]) => s.n >= 2)
    .map(([k, s]) => ({ day: +k.split("-")[0], hour: +k.split("-")[1], lift: s.sum / s.n / avg - 1, n: s.n }))
    .sort((a, b) => b.lift - a.lift);
}

export async function recommendTime(
  db: Db,
  opts: { platform: string; category: string; storyId?: string | null; postId?: string; after?: Date },
): Promise<{ at: Date; reason: string }> {
  const maxPerDay = await getSetting(db, "maxPostsPerDayPerPlatform");
  const gapH = await getSetting(db, "minHoursBetweenSimilarTopics");
  const start = opts.after ?? new Date(Date.now() + 30 * 60_000);
  const horizon = new Date(start.getTime() + 21 * 86400_000);

  const booked = await db
    .select({ id: posts.id, scheduledAt: posts.scheduledAt, platform: posts.platform, category: posts.category, storyId: posts.storyId })
    .from(posts)
    .where(
      and(
        notInArray(posts.status, ["denied", "archived", "saved"]),
        gte(posts.scheduledAt, new Date(start.getTime() - 7 * 86400_000)),
        lte(posts.scheduledAt, horizon),
        opts.postId ? ne(posts.id, opts.postId) : undefined,
      ),
    );

  const learned = await learnedSlots(db, opts.platform);
  const base = BASELINE[opts.platform] ?? BASELINE.instagram;
  const candidates: { day: number; hour: number; why: string }[] = learned?.length
    ? learned.slice(0, 6).map((s) => ({ day: s.day, hour: s.hour, why: `${DAY_NAMES[s.day]} ${s.hour}:00 has earned ${Math.round(s.lift * 100)}% ${s.lift >= 0 ? "more" : "less"} engagement than your ${opts.platform} average across ${s.n} posts` }))
    : base.days.flatMap((d) => base.hours.map((h) => ({ day: d, hour: h, why: `starting baseline for ${opts.platform} (Brisbane time). Personalised windows switch on after ${MIN_SAMPLES} published posts with analytics` })));

  for (let offset = 0; offset < 21; offset++) {
    const l = toLocal(new Date(start.getTime() + offset * 86400_000));
    const [y, m, d, dow] = [l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), l.getUTCDay()];
    const sameDayPlatform = booked.filter((b) => b.platform === opts.platform && b.scheduledAt && toLocal(b.scheduledAt).toISOString().slice(0, 10) === l.toISOString().slice(0, 10)).length;
    if (sameDayPlatform >= maxPerDay) continue;
    for (const c of candidates.filter((c) => c.day === dow)) {
      const at = fromLocal(y, m, d, c.hour);
      if (at < start) continue;
      const clash = booked.some(
        (b) =>
          b.scheduledAt &&
          Math.abs(b.scheduledAt.getTime() - at.getTime()) < gapH * 3600_000 &&
          ((opts.storyId && b.storyId === opts.storyId && b.platform === opts.platform) || (b.category === opts.category && b.platform === opts.platform)),
      );
      if (clash) continue;
      const tooClose = booked.some((b) => b.platform === opts.platform && b.scheduledAt && Math.abs(b.scheduledAt.getTime() - at.getTime()) < 3 * 3600_000);
      if (tooClose) continue;
      return { at, reason: `${DAY_NAMES[dow]} ${String(c.hour).padStart(2, "0")}:00 Brisbane: ${c.why}. Keeps ≤${maxPerDay} ${opts.platform} posts that day and ${gapH}h between similar topics.` };
    }
  }
  return { at: new Date(start.getTime() + 86400_000), reason: "No free optimal slot in the next three weeks; placed tomorrow. Consider spreading content." };
}

export function formatBrisbane(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
