import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, notifications, posts, researchRuns, stories } from "@/db/schema";
import { PageHeader, Stat, PLATFORM_LABEL, Empty } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { weeklyOverview } from "@/lib/analytics";
import { plannerWarnings } from "@/lib/planner";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { runResearchNow } from "./actions";

export default async function Overview() {
  const db = await getDb();
  const n = sql<number>`count(*)::int`;
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const now = new Date();
  const weekStart = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86400_000);
  weekStart.setUTCHours(-10, 0, 0, 0);

  const [pendingStories, awaitingContent, awaitingDesign, scheduled, needsAttention, lastRun, upcoming, attention, activity, week, warnings] = await Promise.all([
    c(db.select({ n }).from(stories).where(eq(stories.status, "pending"))),
    c(db.select({ n }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested"]))),
    c(db.select({ n }).from(posts).where(eq(posts.status, "awaiting_design"))),
    c(db.select({ n }).from(posts).where(eq(posts.status, "scheduled"))),
    c(db.select({ n }).from(posts).where(inArray(posts.status, ["failed", "manual_required"]))),
    db.query.researchRuns.findFirst({ orderBy: desc(researchRuns.startedAt) }),
    db.select().from(posts).where(and(eq(posts.status, "scheduled"), gte(posts.scheduledAt, now), lte(posts.scheduledAt, new Date(now.getTime() + 7 * 86400_000)))).orderBy(posts.scheduledAt).limit(8),
    db.select().from(notifications).where(and(eq(notifications.requiresAttention, true), eq(notifications.read, false))).orderBy(desc(notifications.createdAt)).limit(6),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(8),
    weeklyOverview(db, weekStart),
    plannerWarnings(db, new Date(), new Date(now.getTime() + 7 * 86400_000)),
  ]);
  const topStories = await db.select().from(stories).where(eq(stories.status, "pending")).orderBy(desc(stories.relevanceScore)).limit(3);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Overview" title="What needs you today." emphasis="needs you">
        <form action={runResearchNow.bind(null, "daily")}>
          <button className="btn btn-primary">Run research now</button>
        </form>
      </PageHeader>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" aria-label="Pipeline">
        <Stat label="Stories to review" value={pendingStories} href="/news" note={lastRun ? `Last research ${formatBrisbane(lastRun.startedAt)}` : "No research yet"} />
        <Stat label="Content to approve" value={awaitingContent} href="/content" />
        <Stat label="Designs to approve" value={awaitingDesign} href="/design" />
        <Stat label="Scheduled" value={scheduled} href="/planner" />
        <Stat label="Needs attention" value={needsAttention} href="/publishing" note="Failed or manual publishing" />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="space-y-4 xl:col-span-2">
          <h2>Top stories waiting.</h2>
          {topStories.length === 0 ? (
            <Empty title="Nothing waiting.">
              <p>New research arrives at 6:00 am Brisbane time.</p>
            </Empty>
          ) : (
            topStories.map((s) => (
              <Link key={s.id} href={`/news#${s.id}`} className="card block no-underline hover:bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label text-deepred">{CATEGORY_LABELS[s.category] ?? s.category}</p>
                    <h3 className="mt-1">{s.headline}</h3>
                    <p className="mt-1 text-charcoal">{s.suggestedAngle}</p>
                  </div>
                  <span className="kpi text-3xl" aria-label={`Relevance ${s.relevanceScore} out of 100`}>{s.relevanceScore}</span>
                </div>
              </Link>
            ))
          )}

          <h2 className="pt-4">Coming up this week.</h2>
          {upcoming.length === 0 ? (
            <Empty title="Nothing scheduled this week." />
          ) : (
            <ul className="card divide-y divide-rosemist">
              {upcoming.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                    {p.hook}
                  </span>
                  <span className="text-sm">{formatBrisbane(p.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <h2>Needs your attention.</h2>
          {attention.length === 0 ? (
            <div className="card-tint">✓ You&apos;re all caught up.</div>
          ) : (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.link ?? "/notifications"} className="card block py-3 no-underline">
                    <p className="font-bold text-ink">{a.title}</p>
                    {a.body && <p className="text-sm">{a.body}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="card">
            <p className="label text-deepred">This week</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt>Planned</dt>
              <dd className="text-right font-bold text-ink">{week.planned}</dd>
              <dt>Awaiting approval</dt>
              <dd className="text-right font-bold text-ink">{week.awaitingApproval}</dd>
              <dt>Scheduled</dt>
              <dd className="text-right font-bold text-ink">{week.scheduled}</dd>
              <dt>Published</dt>
              <dd className="text-right font-bold text-ink">{week.published}</dd>
            </dl>
            {Object.keys(week.byCategory).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {Object.entries(week.byCategory).map(([k, v]) => (
                  <span key={k} className="pill">
                    {CATEGORY_LABELS[k] ?? k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>

          {warnings.length > 0 && (
            <div className="card-tint text-sm">
              <p className="label mb-2 text-deepred">Planner warnings</p>
              <ul className="list-inside list-disc space-y-1">
                {warnings.slice(0, 4).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card text-sm">
            <p className="label mb-2 text-deepred">Automation activity</p>
            <ul className="space-y-1">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span className="truncate">
                    {a.status === "failed" ? "✕" : a.status === "ok" ? "✓" : "·"} {a.job}
                  </span>
                  <span className="shrink-0">{formatBrisbane(a.createdAt)}</span>
                </li>
              ))}
            </ul>
            <Link href="/settings#activity" className="mt-2 inline-block">
              See the full activity log
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
