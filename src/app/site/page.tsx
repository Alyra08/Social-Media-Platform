import Link from "next/link";
import { getDb } from "@/db";
import { publishedArticles } from "@/lib/website";
import { upcomingEvents } from "@/lib/events";
import { ArticleCard, SignupForm, eventWhen } from "@/components/site";

export const dynamic = "force-dynamic";

export default async function SiteHome({ searchParams }: { searchParams: Promise<{ signup?: string }> }) {
  const { signup } = await searchParams;
  const db = await getDb();
  const [latest, upcoming] = await Promise.all([publishedArticles(db, { limit: 7 }), upcomingEvents(db, 3)]);
  const [lead, ...rest] = latest;

  return (
    <div className="space-y-16">
      <section className="grid items-end gap-8 pt-4 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="poster text-[clamp(3rem,9vw,6.5rem)]">Take up</p>
          <p className="poster poster-outline text-[clamp(3rem,9vw,6.5rem)]">space.</p>
        </div>
        <div>
          <h1 className="text-[clamp(2rem,4vw,3rem)]">
            Honest conversations about being a woman, <em>without the judgement</em>.
          </h1>
          <p className="mt-4">Stories, research and real talk on equality, relationships, the mental load, confidence and the good bits too. Written for women who are done shrinking.</p>
        </div>
      </section>

      <section aria-labelledby="latest">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <h2 id="latest" className="text-3xl">
            The latest.
          </h2>
          {latest.length > 0 && (
            <Link href="/site/articles" className="btn btn-sm">
              All stories
            </Link>
          )}
        </div>
        {lead ? (
          <div className="grid gap-5 md:grid-cols-3">
            <div className="md:col-span-2 md:row-span-2">
              <ArticleCard a={lead} large />
            </div>
            {rest.map((a) => (
              <ArticleCard key={a.id} a={a} />
            ))}
          </div>
        ) : (
          <div className="card text-center">
            <p className="font-serif text-2xl font-light text-deepred">The first stories are on their way.</p>
            <p className="mt-2">Get the Sunday note and you&apos;ll hear the moment they land.</p>
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="events">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <h2 id="events" className="text-3xl">
              Come and <em>meet us</em>.
            </h2>
            <Link href="/site/events" className="btn btn-sm">
              All events
            </Link>
          </div>
          <ul className="grid gap-5 md:grid-cols-3">
            {upcoming.map((e) => (
              <li key={e.id} className="card-tint">
                <p className="label text-deepred">{eventWhen(e.startsAt)}</p>
                <h3 className="mt-2 font-serif text-2xl font-light text-deepred">
                  <Link href={`/site/events/${e.slug}`} className="text-deepred no-underline hover:underline">
                    {e.title}
                  </Link>
                </h3>
                <p className="mt-2 text-[15px]">{e.summary}</p>
                {e.location && <p className="mt-2 text-sm">{e.location}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card grid gap-6 md:grid-cols-2 md:p-10" aria-labelledby="sunday">
        <div>
          <p className="script text-5xl">Sundays</p>
          <h2 id="sunday" className="mt-2 text-3xl">
            One email a week. <em>No fluff.</em>
          </h2>
          <p className="mt-3">The week&apos;s stories worth your time, the conversations we&apos;re having, and what&apos;s coming up. Unsubscribe whenever you like.</p>
        </div>
        <SignupForm status={signup} back="/site" source="home" />
      </section>
    </div>
  );
}
