import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, briefs, posts, stories } from "@/db/schema";
import { DemoBadge, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1">{title}</h3>
      <ul className="list-inside list-disc space-y-1">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const brief = await db.query.briefs.findFirst({ where: eq(briefs.id, id) });
  if (!brief) notFound();
  const story = await db.query.stories.findFirst({ where: eq(stories.id, brief.storyId) });
  const article = await db.query.articles.findFirst({ where: eq(articles.briefId, brief.id) });
  const related = await db.select().from(posts).where(eq(posts.briefId, brief.id));
  const d = brief.data;

  return (
    <div>
      <PageHeader eyebrow="Editorial brief" title={d.proposedTitle}>
        {brief.isDemo && <DemoBadge />}
        <Link href="/editorial" className="btn btn-sm">
          All briefs
        </Link>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-5">
        <section className="card space-y-5 xl:col-span-3" aria-label="Brief">
          <List title="Alternative headlines" items={d.alternativeHeadlines} />
          <div>
            <h3 className="mb-1">Overview</h3>
            <p>{d.topicOverview}</p>
          </div>
          <div>
            <h3 className="mb-1">Background and context</h3>
            <p className="whitespace-pre-line">{d.background}</p>
          </div>
          <div>
            <h3 className="mb-1">Why it matters</h3>
            <p>{d.whyItMatters}</p>
          </div>
          <List title="Key arguments" items={d.keyArguments} />
          {d.statistics.length > 0 && (
            <div>
              <h3 className="mb-1">Statistics and research</h3>
              <ul className="list-inside list-disc">
                {d.statistics.map((s, i) => (
                  <li key={i}>
                    {s.statement}{" "}
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                      source
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <List title="Supporting evidence" items={d.supportingEvidence} />
          <List title="Different perspectives" items={d.perspectives} />
          <List title="Counterarguments" items={d.counterarguments} />
          <List title="Questions worth exploring" items={d.questionsToExplore} />
          <div>
            <h3 className="mb-1">Suggested structure</h3>
            <ol className="list-inside list-decimal space-y-1">
              {d.outline.map((o, i) => (
                <li key={i}>
                  <strong className="text-ink">{o.heading}</strong>
                  {o.subheadings.length > 0 && (
                    <ul className="ml-6 list-inside list-disc">
                      {o.subheadings.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="mb-1">Suggested introduction</h3>
            <p className="whitespace-pre-line">{d.suggestedIntroduction}</p>
          </div>
          <div>
            <h3 className="mb-1">Suggested conclusion</h3>
            <p className="whitespace-pre-line">{d.suggestedConclusion}</p>
          </div>
          <div>
            <h3 className="mb-1">Sources and citations</h3>
            <ul className="list-inside list-disc">
              {d.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <aside className="space-y-5 xl:col-span-2">
          <div className="card space-y-2 text-[15px]">
            <p className="label text-deepred">SEO</p>
            <p>
              <strong className="text-ink">SEO title:</strong> {d.seoTitle}
            </p>
            <p>
              <strong className="text-ink">Meta description:</strong> {d.metaDescription}
            </p>
            <p>
              <strong className="text-ink">Slug:</strong> /{d.urlSlug}
            </p>
            <p>
              <strong className="text-ink">Search intent:</strong> {d.searchIntent}
            </p>
            <p>
              <strong className="text-ink">Keywords:</strong> {d.keywords.join(", ")}
            </p>
            <p>
              <strong className="text-ink">Long-tail phrases:</strong> {d.longTailPhrases.join(", ")}
            </p>
            <p>
              <strong className="text-ink">Internal links:</strong> {d.internalLinks.join(", ")}
            </p>
            <p>
              <strong className="text-ink">Related articles:</strong> {d.relatedArticles.join(", ") || "none yet"}
            </p>
            <p>
              <strong className="text-ink">Social promotion:</strong> {d.socialPromotion.join(", ")}
            </p>
          </div>

          {story && (
            <div className="card-tint text-[15px]">
              <p className="label text-deepred">Original story</p>
              <p className="mt-1 font-bold text-ink">{story.headline}</p>
              <a href={story.sourceUrl} target="_blank" rel="noreferrer">
                {story.sourceOrganisation}
              </a>
            </div>
          )}

          <div className="card">
            <p className="label mb-2 text-deepred">Social content from this brief</p>
            <ul className="space-y-2">
              {related.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/content?post=${p.id}#${p.id}`}>
                    {PLATFORM_LABEL[p.platform]} {p.format}
                  </Link>
                  <StatusPill status={p.status} />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {article && (
        <section className="card-tint mt-8 flex flex-wrap items-center justify-between gap-3" aria-label="Writing area">
          <div>
            <h2>Write the article.</h2>
            <p className="mt-1 text-[15px]">
              {article.body.trim() ? `${article.body.split(/s+/).filter(Boolean).length} words so far. ` : ""}Write, brand-check, preview and publish it to the website in one place.
            </p>
          </div>
          <Link href={`/website/articles/${article.id}`} className="btn btn-primary">
            {article.body.trim() ? "Continue writing" : "Start writing"}
          </Link>
        </section>
      )}
    </div>
  );
}
