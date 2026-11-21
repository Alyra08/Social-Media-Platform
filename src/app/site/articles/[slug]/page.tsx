import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { articles } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { publishedArticleBySlug, readingMinutes } from "@/lib/website";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { ArticleBody, plainText } from "@/components/article-body";
import { ArticleCard, SignupForm } from "@/components/site";
import { siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string; signup?: string }> };

/** Published article, or any article when a signed-in studio user previews it. */
async function load(slug: string, preview: boolean) {
  const db = await getDb();
  const live = await publishedArticleBySlug(db, slug);
  if (live) return { a: live, previewing: false };
  if (preview && (await getCurrentUser())) {
    const draft = await db.query.articles.findFirst({ where: eq(articles.slug, slug) });
    if (draft) return { a: draft, previewing: true };
  }
  return null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const r = await load(slug, preview === "1");
  if (!r) return { title: "Not found" };
  const { a } = r;
  const description = a.metaDescription || a.excerpt || plainText(a.body).slice(0, 155);
  return {
    title: a.seoTitle || a.title,
    description,
    alternates: { canonical: siteUrl(`/articles/${a.slug}`) },
    openGraph: { type: "article", title: a.seoTitle || a.title, description, publishedTime: a.publishedAt?.toISOString(), url: siteUrl(`/articles/${a.slug}`) },
    robots: r.previewing ? { index: false, follow: false } : undefined,
  };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { preview, signup } = await searchParams;
  const r = await load(slug, preview === "1");
  if (!r) notFound();
  const { a, previewing } = r;
  const db = await getDb();
  const related = await db
    .select()
    .from(articles)
    .where(and(eq(articles.status, "published"), ne(articles.id, a.id), a.category ? eq(articles.category, a.category) : undefined))
    .orderBy(desc(articles.publishedAt))
    .limit(3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.metaDescription || a.excerpt || undefined,
    datePublished: a.publishedAt?.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    publisher: { "@type": "Organization", name: "Simply Being Female" },
    mainEntityOfPage: siteUrl(`/articles/${a.slug}`),
  };

  return (
    <article className="pt-4">
      {previewing && (
        <p role="status" className="mb-6 rounded-[18px] bg-ink px-4 py-3 text-[15px] text-white">
          Preview only. This article isn&apos;t on the public website{a.isDemo ? " and is built on sample research, so it can't be published" : ""}.{" "}
          <Link href={`/website/articles/${a.id}`} className="font-bold text-white underline">
            Back to the editor
          </Link>
        </p>
      )}
      {!previewing && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />}

      <header className="mx-auto max-w-3xl">
        {a.category && (
          <Link href={`/site/articles?category=${a.category}`} className="label text-deepred no-underline">
            {CATEGORY_LABELS[a.category] ?? a.category}
          </Link>
        )}
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">{a.title}</h1>
        {a.excerpt && <p className="mt-4 text-xl">{a.excerpt}</p>}
        <p className="mt-4 text-sm">
          {a.publishedAt ? a.publishedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : "Not yet published"} · {readingMinutes(a.body)} min read
        </p>
      </header>

      <div className="mx-auto mt-10 max-w-3xl">
        <ArticleBody body={a.body} />

        {a.sources.length > 0 && (
          <section className="card-tint mt-12 text-[15px]" aria-labelledby="sources">
            <h2 id="sources" className="text-2xl">
              Sources.
            </h2>
            <ul className="mt-3 list-disc space-y-1 pl-5">
              {a.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                    {s.title}
                  </a>
                  {s.organisation ? `, ${s.organisation}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="card mt-12" aria-labelledby="article-signup">
          <h2 id="article-signup" className="text-2xl">
            Get stories like this <em>every Sunday</em>.
          </h2>
          <SignupForm status={signup} back={`/site/articles/${a.slug}`} source="article" compact />
        </section>
      </div>

      {related.length > 0 && (
        <section className="mt-16" aria-labelledby="related">
          <h2 id="related" className="mb-5 text-3xl">
            Keep reading.
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {related.map((r) => (
              <ArticleCard key={r.id} a={r} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
