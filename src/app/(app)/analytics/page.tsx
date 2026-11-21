import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accountMetrics, accounts, reports } from "@/db/schema";
import { Empty, PageHeader, Stat, PLATFORM_LABEL } from "@/components/ui";
import { computeInsights, groupBy, postPerformance } from "@/lib/analytics";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { formatBrisbane } from "@/lib/scheduling";
import { generateReportAction } from "../actions";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Bars({ title, groups, label }: { title: string; groups: { key: string; n: number; avgEr: number }[]; label: (k: string) => string }) {
  if (!groups.length) return null;
  const max = Math.max(...groups.map((g) => g.avgEr), 0.0001);
  return (
    <figure className="card">
      <figcaption className="label mb-3 text-deepred">{title}</figcaption>
      <ul className="space-y-2">
        {groups.map((g) => (
          <li key={g.key} className="text-[15px]">
            <div className="flex justify-between gap-2">
              <span>{label(g.key)}</span>
              <span className="font-bold text-ink">
                {(g.avgEr * 100).toFixed(1)}% <span className="font-normal">({g.n})</span>
              </span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-rosemist" aria-hidden>
              <div className="h-3 rounded-full bg-signal" style={{ width: `${(g.avgEr / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">Average engagement rate (likes, comments, shares, saves ÷ reach). Number of posts in brackets.</p>
    </figure>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; sandbox?: string }> }) {
  const sp = await searchParams;
  const days = Number(sp.days ?? 30);
  const includeSandbox = sp.sandbox === "1";
  const db = await getDb();
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400_000);
  const prevFrom = new Date(from.getTime() - days * 86400_000);
  const [perf, prev, reps, followers] = await Promise.all([
    postPerformance(db, from, to, includeSandbox),
    postPerformance(db, prevFrom, from, includeSandbox),
    db.select().from(reports).orderBy(desc(reports.createdAt)).limit(12),
    db.select({ m: accountMetrics, a: accounts }).from(accountMetrics).innerJoin(accounts, eq(accounts.id, accountMetrics.accountId)).orderBy(desc(accountMetrics.date)).limit(200),
  ]);
  const sum = (arr: typeof perf, k: "impressions" | "reach" | "likes" | "comments" | "shares" | "saves" | "clicks") => arr.reduce((a, p) => a + p[k], 0);
  const delta = (k: "reach" | "shares" | "saves" | "comments") => {
    const a = sum(perf, k);
    const b = sum(prev, k);
    return b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs previous ${days} days` : undefined;
  };
  const insights = computeInsights(perf);
  const top = [...perf].sort((a, b) => b.engagementRate - a.engagementRate);
  const latestFollowers = new Map<string, { handle: string; platform: string; followers: number; newF: number; unf: number }>();
  for (const { m, a } of followers) if (!latestFollowers.has(a.id) && (includeSandbox || !m.isSandbox)) latestFollowers.set(a.id, { handle: a.handle, platform: a.platform, followers: m.followers, newF: m.newFollowers, unf: m.unfollows });

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Analytics and performance intelligence" title="What's working, and what's next." emphasis="what's next">
        {[7, 30, 90].map((d) => (
          <Link key={d} href={`/analytics?days=${d}${includeSandbox ? "&sandbox=1" : ""}`} className={`btn btn-sm ${days === d ? "btn-primary" : ""}`}>
            {d} days
          </Link>
        ))}
        <Link href={`/analytics?days=${days}${includeSandbox ? "" : "&sandbox=1"}`} className="btn btn-sm">
          {includeSandbox ? "Hide test data" : "Include test data"}
        </Link>
      </PageHeader>

      {includeSandbox && <div className="card-tint text-[15px]">Showing sandbox test data. These numbers are simulated and are never used for recommendations.</div>}

      {perf.length === 0 ? (
        <Empty title="No analytics yet.">
          <p>Numbers appear once posts are published through connected accounts. Nothing is estimated or invented.</p>
        </Empty>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" aria-label="Totals">
            <Stat label="Posts" value={perf.length} />
            <Stat label="Reach" value={sum(perf, "reach").toLocaleString("en-AU")} note={delta("reach")} />
            <Stat label="Comments" value={sum(perf, "comments").toLocaleString("en-AU")} note={delta("comments")} />
            <Stat label="Shares" value={sum(perf, "shares").toLocaleString("en-AU")} note={delta("shares")} />
            <Stat label="Saves" value={sum(perf, "saves").toLocaleString("en-AU")} note={delta("saves")} />
            <Stat label="Clicks" value={sum(perf, "clicks").toLocaleString("en-AU")} />
          </section>

          <section className="card-tint">
            <h2 className="mb-2">What the numbers say.</h2>
            <ul className="list-inside list-disc space-y-1">
              {insights.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>

          <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            <Bars title="By channel" groups={groupBy(perf, (p) => p.platform)} label={(k) => PLATFORM_LABEL[k] ?? k} />
            <Bars title="By content category" groups={groupBy(perf, (p) => p.category)} label={(k) => CATEGORY_LABELS[k] ?? k} />
            <Bars title="By format" groups={groupBy(perf, (p) => `${p.platform} ${p.format}`)} label={(k) => k} />
            <Bars title="By creative treatment" groups={groupBy(perf, (p) => p.treatment)} label={(k) => k} />
            <Bars title="By day of the week (Brisbane)" groups={groupBy(perf, (p) => String(new Date((p.publishedAt?.getTime() ?? 0) + 36e6).getUTCDay()))} label={(k) => DAYS[+k]} />
            <Bars title="By publishing hour (Brisbane)" groups={groupBy(perf, (p) => String(new Date((p.publishedAt?.getTime() ?? 0) + 36e6).getUTCHours()).padStart(2, "0"))} label={(k) => `${k}:00`} />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card">
              <p className="label mb-2 text-deepred">Highest performing posts</p>
              <ol className="list-inside list-decimal space-y-1 text-[15px]">
                {top.slice(0, 5).map((p) => (
                  <li key={p.postId}>
                    {p.liveUrl ? (
                      <a href={p.liveUrl} target="_blank" rel="noreferrer">
                        {p.hook}
                      </a>
                    ) : (
                      p.hook
                    )}{" "}
                    · {PLATFORM_LABEL[p.platform]} · {(p.engagementRate * 100).toFixed(1)}%
                  </li>
                ))}
              </ol>
            </div>
            <div className="card">
              <p className="label mb-2 text-deepred">Lowest performing posts</p>
              <ol className="list-inside list-decimal space-y-1 text-[15px]">
                {top
                  .slice(-5)
                  .reverse()
                  .map((p) => (
                    <li key={p.postId}>
                      {p.hook} · {PLATFORM_LABEL[p.platform]} · {(p.engagementRate * 100).toFixed(1)}%
                    </li>
                  ))}
              </ol>
            </div>
          </section>
        </>
      )}

      {latestFollowers.size > 0 && (
        <section className="card">
          <p className="label mb-2 text-deepred">Audience</p>
          <ul className="grid gap-2 md:grid-cols-3">
            {[...latestFollowers.values()].map((f) => (
              <li key={f.handle}>
                <strong className="text-ink">{f.handle}</strong> ({PLATFORM_LABEL[f.platform]}): {f.followers.toLocaleString("en-AU")} followers, +{f.newF} / −{f.unf}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2>Reports.</h2>
          <form action={generateReportAction} className="flex gap-2">
            <select name="kind" className="select" aria-label="Report type">
              <option value="daily">Daily summary</option>
              <option value="weekly">Weekly report</option>
              <option value="monthly">Monthly report</option>
              <option value="quarterly">Quarterly review</option>
            </select>
            <button className="btn btn-sm">Generate now</button>
          </form>
        </div>
        {reps.length === 0 ? (
          <Empty title="No reports yet." />
        ) : (
          <ul className="card divide-y divide-rosemist">
            {reps.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-3">
                <Link href={r.kind === "competitor" ? `/competitors?report=${r.id}` : `/analytics/reports/${r.id}`}>{r.title}</Link>
                <span className="text-sm">
                  {r.periodStart} to {r.periodEnd} · {formatBrisbane(r.createdAt)} · <a href={`/api/reports/${r.id}/export?format=csv`}>CSV</a> · <a href={`/api/reports/${r.id}/export?format=json`}>JSON</a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
