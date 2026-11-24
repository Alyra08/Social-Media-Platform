import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db";
import { pastEvents, upcomingEvents } from "@/lib/events";
import { eventWhen } from "@/components/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events and meetups", description: "Circles, workshops and meetups from Simply Being Female." };

export default async function EventsPage() {
  const db = await getDb();
  const [upcoming, past] = await Promise.all([upcomingEvents(db), pastEvents(db)]);
  return (
    <div>
      <header className="mb-8 pt-4">
        <p className="label text-deepred">Events and meetups</p>
        <h1 className="mt-2">
          Pull up a chair. <em>Bring a friend.</em>
        </h1>
      </header>
      {upcoming.length === 0 ? (
        <div className="card text-center">
          <p className="font-serif text-2xl font-light text-deepred">Nothing on the calendar just yet.</p>
          <p className="mt-2">
            New events go out first in <Link href="/site/newsletter">the Sunday note</Link>.
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {upcoming.map((e) => (
            <li key={e.id} className="card flex flex-col">
              <p className="label text-deepred">{eventWhen(e.startsAt)}</p>
              <h2 className="mt-2 text-3xl">
                <Link href={`/site/events/${e.slug}`} className="text-deepred no-underline hover:underline">
                  {e.title}
                </Link>
              </h2>
              <p className="mt-2 flex-1">{e.summary}</p>
              <p className="mt-3 text-sm">
                {[e.location, e.onlineUrl ? "Online" : null, e.priceNote].filter(Boolean).join(" · ")}
              </p>
              <Link href={`/site/events/${e.slug}#rsvp`} className="btn btn-sm mt-4 self-start">
                RSVP for {e.title.replace(/\.$/, "")}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {past.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-4 text-2xl">Past events.</h2>
          <ul className="card divide-y divide-rosemist">
            {past.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-3 text-[15px]">
                <span className="font-bold text-ink">{e.title}</span>
                <span>{eventWhen(e.startsAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
