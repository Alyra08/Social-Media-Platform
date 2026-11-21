import type { MetadataRoute } from "next";
import { getDb } from "@/db";
import { publishedArticles } from "@/lib/website";
import { upcomingEvents } from "@/lib/events";
import { siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Public website only. The studio is never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = await getDb();
  const [arts, evs] = await Promise.all([publishedArticles(db, { limit: 5000 }), upcomingEvents(db, 500)]);
  return [
    { url: siteUrl(""), changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/articles"), changeFrequency: "daily", priority: 0.8 },
    { url: siteUrl("/events"), changeFrequency: "weekly", priority: 0.6 },
    { url: siteUrl("/newsletter"), changeFrequency: "monthly", priority: 0.5 },
    ...arts.map((a) => ({ url: siteUrl(`/articles/${a.slug}`), lastModified: a.updatedAt, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...evs.map((e) => ({ url: siteUrl(`/events/${e.slug}`), lastModified: e.updatedAt, changeFrequency: "weekly" as const, priority: 0.5 })),
  ];
}
