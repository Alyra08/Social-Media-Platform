import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { researchRuns, stories } from "@/db/schema";
import { DemoBadge, Empty, PageHeader, StatusPill } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { formatBrisbane } from "@/lib/scheduling";
import { runResearchNow, storyDecision } from "../actions";

const TABS = [
  { key: "pending", label: "To review" },
  { key: "saved", label: "Saved for later" },
  { key: "more_research", label: "More research" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
];

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tab?: string; category?: string; region?: string }> }) {
  const { tab = "pending", category, region } = await searchParams;
  const db = await getDb();
  let rows = await db.select().from(stories).where(inArray(stories.status, [tab])).orderBy(desc(stories.relevanceScore), desc(stories.createdAt)).limit(100);
  if (category) rows = rows.filter((r) => r.category === category);
  if (region) rows = rows.filter((r) => r.region === region);
  const lastRun = await db.query.researchRuns.findFirst({ orderBy: desc(researchRuns.startedAt) });

  return (
    <div>
      <PageHeader eyebrow="Daily news and women's issues intelligence" title="What women are talking about today." emphasis="talking about">
        <form action={runResearchNow.bind(null, "breaking")}>
          <button className="btn">Check breaking news</button>
        </form>
        <form action={runResearchNow.bind(null, "daily")}>
          <button className="btn btn-primary">Run full research</button>
        </form>
      </PageHeader>

      {lastRun && (
        <p className="mb-4 text-sm">
          Last run {formatBrisbane(lastRun.startedAt)} · {lastRun.mode === "demo" ? "demo mode" : "live web research"} · {lastRun.status === "running" ? "running now…" : `${lastRun.storiesFound} new, ${lastRun.duplicatesRemoved} duplicates removed`}
          {lastRun.status === "failed" && <span className="ml-2 font-bold text-deepred">Failed: {lastRun.notes}</span>}
        </p>
      )}

      <nav className="segmented mb-4" aria-label="Story status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/news?tab=${t.key}`} className="seg" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <form className="mb-6 flex flex-wrap gap-2" aria-label="Filter">
        <input type="hidden" name="tab" value={tab} />
        <select name="category" defaultValue={category ?? ""} className="select max-w-xs">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="region" defaultValue={region ?? ""} className="select max-w-[200px]">
          <option value="">All regions</option>
          <option value="australian">Australian</option>
          <option value="international">International</option>
          <option value="global">Global</option>
        </select>
        <button className="btn btn-sm">Filter</button>
      </form>

      {rows.length === 0 ? (
        <Empty title="No stories here.">
          <p>Research runs every morning at 6:00 am Brisbane, with breaking-news checks through the day.</p>
        </Empty>
      ) : (
        <div className="grid gap-5 2xl:grid-cols-2">
          {rows.map((s) => (
            <article key={s.id} id={s.id} className="card scroll-mt-6">
              <header className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <span className="pill">{CATEGORY_LABELS[s.category] ?? s.category}</span>
                    <span className="pill">{s.region === "australian" ? "Australian" : s.region === "global" ? "Global" : "International"}</span>
                    {s.trending && <span className="pill-red pill">Trending</span>}
                    <span className="pill">Momentum: {s.momentum}</span>
                    {s.verification !== "confirmed" && <span className="pill-ink pill">{s.verification === "developing" ? "Developing story" : "Unverified"}</span>}
                    {s.isDemo && <DemoBadge />}
                    {tab !== "pending" && <StatusPill status={s.status} />}
                  </div>
                  <h2 className="text-2xl">{s.headline}</h2>
                </div>
                <div className="shrink-0 text-center" title={s.scoreExplanation}>
                  <p className="kpi">{s.relevanceScore}</p>
                  <p className="label text-deepred">Relevance</p>
                </div>
              </header>

              <p className="mt-3">{s.overview}</p>

              <dl className="mt-4 grid gap-3 text-[15px] md:grid-cols-2">
                <div>
                  <dt className="label text-deepred">Why this matters to women</dt>
                  <dd>{s.whyItMatters}</dd>
                </div>
                <div>
                  <dt className="label text-deepred">Why it&apos;s relevant to SBF</dt>
                  <dd>{s.whyRelevantToSbf}</dd>
                </div>
                <div>
                  <dt className="label text-deepred">Suggested angle</dt>
                  <dd>{s.suggestedAngle}</dd>
                </div>
                <div>
                  <dt className="label text-deepred">Suggested article headline</dt>
                  <dd className="font-serif text-lg text-ink">{s.suggestedArticleHeadline}</dd>
                </div>
                {s.keyStats.length > 0 && (
                  <div className="md:col-span-2">
                    <dt className="label text-deepred">Key figures (from cited sources)</dt>
                    <dd>
                      <ul className="list-inside list-disc">
                        {s.keyStats.map((k, i) => (
                          <li key={i}>
                            {k.statement}{" "}
                            <a href={k.sourceUrl} target="_blank" rel="noreferrer">
                              source
                            </a>
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="label text-deepred">Social opportunities</dt>
                  <dd>{s.socialOpportunities.join(" · ")}</dd>
                </div>
                <div>
                  <dt className="label text-deepred">Audience interest</dt>
                  <dd className="capitalize">{s.audienceInterest}</dd>
                </div>
              </dl>

              <details className="mt-4">
                <summary className="cursor-pointer font-semibold text-deepred">Sources, dates and verification</summary>
                <div className="mt-3 space-y-2 text-[15px]">
                  <p>
                    <strong className="text-ink">Original source:</strong>{" "}
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                      {s.sourceOrganisation}
                    </a>{" "}
                    {s.sourcesVerified ? <span className="pill-ok pill">✓ Link confirmed by search</span> : <span className="pill">Link not confirmed</span>}
                  </p>
                  <p>
                    <strong className="text-ink">Published:</strong> {s.publishedAt ?? "unknown"} · <strong className="text-ink">Event occurred:</strong> {s.eventDate ?? "unknown"}
                  </p>
                  {s.supportingSources.length > 0 && (
                    <ul className="list-inside list-disc">
                      {s.supportingSources.map((x) => (
                        <li key={x.url}>
                          <a href={x.url} target="_blank" rel="noreferrer">
                            {x.title}
                          </a>{" "}
                          {x.organisation && `(${x.organisation})`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.factsVsOpinion && (
                    <p>
                      <strong className="text-ink">Fact vs opinion:</strong> {s.factsVsOpinion}
                    </p>
                  )}
                  {s.conflictingReports && (
                    <p>
                      <strong className="text-ink">Conflicting reports:</strong> {s.conflictingReports}
                    </p>
                  )}
                  {s.regionalDifferences && (
                    <p>
                      <strong className="text-ink">Australia vs elsewhere:</strong> {s.regionalDifferences}
                    </p>
                  )}
                  <p>
                    <strong className="text-ink">Score explanation:</strong> {s.scoreExplanation}
                  </p>
                  {s.scoreBreakdown && (
                    <p className="text-sm">
                      {Object.entries(s.scoreBreakdown)
                        .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()} ${v}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </details>

              {["pending", "saved", "more_research"].includes(s.status) && (
                <form action={storyDecision} className="mt-5 space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <label className="sr-only" htmlFor={`fb-${s.id}`}>
                    Feedback (optional)
                  </label>
                  <input id={`fb-${s.id}`} name="feedback" className="input" placeholder="Why? (optional, helps the research learn)" />
                  <div className="flex flex-wrap gap-2">
                    <button name="decision" value="approve" className="btn btn-primary">
                      Approve
                    </button>
                    <button name="decision" value="deny" className="btn">
                      Deny
                    </button>
                    <button name="decision" value="save" className="btn">
                      Save for later
                    </button>
                    <button name="decision" value="more_research" className="btn">
                      Request more research
                    </button>
                  </div>
                </form>
              )}
              {s.decisionFeedback && <p className="mt-3 text-sm">Feedback: “{s.decisionFeedback}”</p>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
