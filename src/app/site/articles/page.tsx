import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { publishedArticles, publishedCategories } from "@/lib/website";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { ArticleCard } from "@/components/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Stories and knowledge hub",
  description: "Search every Simply Being Female story on equality, relationships, motherhood, confidence and more.",
};

export default async function ArticlesHub({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q = "", category } = await searchParams;
  const db = await getDb();
  const cat = category && CATEGORY_LABELS[category] ? category : undefined;
  const [list, cats] = await Promise.all([publishedArticles(db, { q: q.slice(0, 100), category: cat, limit: 60 }), publishedCategories(db)]);

  return (
    <div>
      <header className="mb-8 pt-4">
        <p className="label text-deepred">Stories and knowledge hub</p>
        <h1 className="mt-2">
          Everything we&apos;ve <em>talked about</em>.
        </h1>
      </header>

      <form role="search" className="mb-4 flex flex-wrap gap-2" action="/site/articles">
        <label htmlFor="hub-q" className="sr-only">
          Search stories
        </label>
        <input id="hub-q" name="q" defaultValue={q} className="input min-w-0 flex-1" placeholder="Search: pay gap, mental load, dating, menopause…" />
        {cat && <input type="hidden" name="category" value={cat} />}
        <button className="btn btn-primary">Search</button>
      </form>

      {cats.length > 0 && (
        <nav className="mb-8 flex flex-wrap gap-2" aria-label="Topics">
          <Link href={q ? `/site/articles?q=${encodeURIComponent(q)}` : "/site/articles"} className={`btn btn-sm ${!cat ? "btn-primary" : ""}`}>
            All topics
          </Link>
          {cats.map((c) => (
            <Link
              key={c.category}
              href={`/site/articles?category=${c.category}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`btn btn-sm ${cat === c.category ? "btn-primary" : ""}`}
              aria-current={cat === c.category ? "page" : undefined}
            >
              {CATEGORY_LABELS[c.category] ?? c.category} ({c.n})
            </Link>
          ))}
        </nav>
      )}

      {list.length === 0 ? (
        <div className="card text-center">
          <p className="font-serif text-2xl font-light text-signal">{q || cat ? "Nothing matches that yet." : "The first stories are on their way."}</p>
          {(q || cat) && (
            <p className="mt-2">
              <Link href="/site/articles">See every story</Link>
            </p>
          )}
        </div>
      ) : (
        <>
          {(q || cat) && (
            <p className="mb-4 text-[15px]" role="status">
              {list.length} {list.length === 1 ? "story" : "stories"}
              {q ? ` for “${q}”` : ""}
              {cat ? ` in ${CATEGORY_LABELS[cat]}` : ""}.
            </p>
          )}
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {list.map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
