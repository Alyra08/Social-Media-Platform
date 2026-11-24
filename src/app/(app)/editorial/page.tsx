import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, briefs, stories } from "@/db/schema";
import { DemoBadge, Empty, PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { ARTICLE_STATUSES } from "@/lib/constants";

export default async function EditorialPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const db = await getDb();
  const rows = await db
    .select({ a: articles, b: briefs, s: stories })
    .from(articles)
    .leftJoin(briefs, eq(briefs.id, articles.briefId))
    .leftJoin(stories, eq(stories.id, articles.storyId))
    .where(status ? eq(articles.status, status) : undefined)
    .orderBy(desc(articles.updatedAt));

  return (
    <div>
      <PageHeader eyebrow="Editorial opportunities and article briefing" title="Everything you need to write it." emphasis="write it" />
      <nav className="segmented mb-6" aria-label="Article status">
        <Link href="/editorial" className="seg" aria-current={!status ? "page" : undefined}>
          All
        </Link>
        {Object.entries(ARTICLE_STATUSES).map(([k, v]) => (
          <Link key={k} href={`/editorial?status=${k}`} className="seg" aria-current={status === k ? "page" : undefined}>
            {v}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty title="No briefs yet.">
          <p>Approve a story in Daily News and its brief is generated here automatically.</p>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ a, b, s }) => (
            <Link key={a.id} href={b ? `/editorial/${b.id}` : "#"} className="card block no-underline hover:bg-white">
              <div className="mb-2 flex flex-wrap gap-1.5">
                <span className="pill-ink pill">{ARTICLE_STATUSES[a.status] ?? a.status}</span>
                {b?.isDemo && <DemoBadge />}
              </div>
              <h3 className="font-serif text-2xl font-light text-deepred">{a.title}</h3>
              {s && <p className="mt-2 text-sm">From: {s.headline}</p>}
              <p className="mt-2 text-sm">Updated {formatBrisbane(a.updatedAt)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
