import Link from "next/link";
import { ilike, or } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, assets, interactions, posts, stories } from "@/db/schema";
import { Empty, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const term = q.trim();
  const db = await getDb();
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const [st, ps, ar, as, it] = term
    ? await Promise.all([
        db.select().from(stories).where(or(ilike(stories.headline, like), ilike(stories.overview, like))).limit(20),
        db.select().from(posts).where(or(ilike(posts.hook, like), ilike(posts.caption, like))).limit(30),
        db.select().from(articles).where(or(ilike(articles.title, like), ilike(articles.body, like))).limit(20),
        db.select().from(assets).where(or(ilike(assets.name, like), ilike(assets.content, like))).limit(20),
        db.select().from(interactions).where(or(ilike(interactions.text, like), ilike(interactions.author, like))).limit(20),
      ])
    : [[], [], [], [], []];
  const total = st.length + ps.length + ar.length + as.length + it.length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Search" title={term ? `Results for “${term}”.` : "Search everything."} />
      {term && total === 0 && <Empty title="Nothing matched." />}
      {st.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">Stories</h2>
          <ul className="card divide-y divide-rosemist">
            {st.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/news?tab=${s.status}#${s.id}`}>{s.headline}</Link>
                <StatusPill status={s.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {ps.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">Posts</h2>
          <ul className="card divide-y divide-rosemist">
            {ps.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={p.status === "published" ? `/archive?open=${p.id}` : `/content?post=${p.id}#${p.id}`}>
                  <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                  {p.hook}
                </Link>
                <StatusPill status={p.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {ar.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">Articles</h2>
          <ul className="card divide-y divide-rosemist">
            {ar.map((a) => (
              <li key={a.id} className="py-2">
                <Link href={`/website/articles/${a.id}`}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {as.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">Brand library</h2>
          <ul className="card divide-y divide-rosemist">
            {as.map((a) => (
              <li key={a.id} className="py-2">
                <Link href="/brand">{a.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {it.length > 0 && (
        <section>
          <h2 className="mb-2 text-2xl">Community</h2>
          <ul className="card divide-y divide-rosemist">
            {it.map((i) => (
              <li key={i.id} className="py-2">
                <Link href="/inbox">
                  {i.author}: {i.text.slice(0, 120)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
