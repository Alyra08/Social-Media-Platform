import { and, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { posts } from "@/db/schema";
import { getSetting } from "./system";
import { CATEGORY_LABELS } from "./brand/brief";

/** Content gaps, repetition and editorial-balance warnings for a date range. */
export async function plannerWarnings(db: Db, from: Date, to: Date): Promise<string[]> {
  const rows = await db
    .select({ scheduledAt: posts.scheduledAt, storyId: posts.storyId, category: posts.category, platform: posts.platform })
    .from(posts)
    .where(and(inArray(posts.status, ["scheduled", "published", "approved_for_publishing"]), gte(posts.scheduledAt, from), lte(posts.scheduledAt, to)));
  const warnings: string[] = [];
  const days = Math.round((to.getTime() - from.getTime()) / 86400_000);
  for (let i = 0; i < days; i++) {
    const d0 = new Date(from.getTime() + i * 86400_000);
    const d1 = new Date(d0.getTime() + 86400_000);
    const n = rows.filter((r) => r.scheduledAt && r.scheduledAt >= d0 && r.scheduledAt < d1).length;
    if (n === 0 && d0 > new Date()) warnings.push(`Content gap: nothing planned on ${d0.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "short" })}.`);
  }
  const byStory = new Map<string, number>();
  for (const r of rows) if (r.storyId) byStory.set(r.storyId, (byStory.get(r.storyId) ?? 0) + 1);
  for (const [, n] of byStory) if (n > 6) warnings.push(`One topic appears ${n} times in this period. Consider spreading it out.`);

  const balance = await getSetting(db, "editorialBalance");
  if (rows.length >= 8) {
    for (const [cat, target] of Object.entries(balance)) {
      const share = (rows.filter((r) => r.category === cat).length / rows.length) * 100;
      if (share > target + 15) warnings.push(`${CATEGORY_LABELS[cat] ?? cat} is ${Math.round(share)}% of planned content (target ${target}%).`);
      if (share < target - 10) warnings.push(`${CATEGORY_LABELS[cat] ?? cat} is under-represented: ${Math.round(share)}% vs ${target}% target.`);
    }
  }
  return warnings.slice(0, 12);
}
