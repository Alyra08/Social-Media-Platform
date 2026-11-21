import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, events, subscribers } from "@/db/schema";
import { DemoBadge, Empty, PageHeader, Stat } from "@/components/ui";
import { ARTICLE_STATUSES } from "@/lib/constants";
import { formatBrisbane } from "@/lib/scheduling";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { WebsiteTabs } from "./tabs";
import { newArticleAction } from "./actions";

export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const db = await getDb();
  const n = sql<number>`count(*)::int`;
  const [rows, [live], [ready], [subs], [upcoming]] = await Promise.all([
    db.select().from(articles).where(status ? eq(articles.status, status) : undefined).orderBy(desc(articles.updatedAt)).limit(200),
    db.select({ n }).from(articles).where(eq(articles.status, "published")),
    db.select({ n }).from(articles).where(eq(articles.status, "ready")),
    db.select({ n }).from(subscribers).where(eq(subscribers.status, "confirmed")),
    db.select({ n }).from(events).where(sql`${events.status} = 'published' and ${events.startsAt} > now()`),
  ]);

  return (
    <div>
      <PageHeader eyebrow="Public website" title="Your stories, in public." emphasis="in public" />
      <WebsiteTabs current="/website" />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live articles" value={live.n} />
        <Stat label="Waiting for approval" value={ready.n} href="/website?status=ready" />
        <Stat label="Sunday note subscribers" value={subs.n} href="/website/newsletter" />
        <Stat label="Upcoming events" value={upcoming.n} href="/website/events" />
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap gap-2" aria-label="Article status">
          <Link href="/website" className={`btn btn-sm ${!status ? "btn-primary" : ""}`}>
            All
          </Link>
          {["drafting", "editing", "ready", "approved", "published"].map((k) => (
            <Link key={k} href={`/website?status=${k}`} className={`btn btn-sm ${status === k ? "btn-primary" : ""}`}>
              {ARTICLE_STATUSES[k]}
            </Link>
          ))}
        </nav>
        <form action={newArticleAction} className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="new-title">
            New article title
          </label>
          <input id="new-title" name="title" className="input max-w-xs" placeholder="Working title" />
          <button className="btn btn-sm">New article</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty title="No articles here yet.">
          <p>Approve a story in Daily News and its article appears here, or start one with New article.</p>
        </Empty>
      ) : (
        <ul className="card divide-y divide-rosemist">
          {rows.map((a) => {
            const blocks = a.brandIssues.filter((i) => i.severity === "block").length;
            return (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link href={`/website/articles/${a.id}`} className="font-serif text-xl font-light text-signal no-underline hover:underline">
                    {a.title}
                  </Link>
                  <p className="text-sm">
                    {a.category ? `${CATEGORY_LABELS[a.category] ?? a.category} · ` : ""}
                    {a.status === "published" && a.publishedAt ? `Live since ${formatBrisbane(a.publishedAt)}` : `Updated ${formatBrisbane(a.updatedAt)}`}
                    {blocks ? ` · ${blocks} brand ${blocks === 1 ? "issue" : "issues"}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {a.isDemo && <DemoBadge />}
                  <span className={a.status === "published" ? "pill-ok pill" : a.status === "ready" ? "pill-red pill" : "pill"}>{ARTICLE_STATUSES[a.status] ?? a.status}</span>
                  {a.status === "published" && (
                    <a href={`/site/articles/${a.slug}`} target="_blank" rel="noopener" className="btn btn-sm">
                      View live ↗
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
