import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { eventRsvps, events } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { EVENT_STATUS, WebsiteTabs } from "../tabs";
import { createEventAction } from "../actions";
import { EventFields } from "./event-form";

export default async function EventsAdmin() {
  const db = await getDb();
  const rows = await db
    .select({ e: events, going: sql<number>`count(${eventRsvps.id}) filter (where ${eventRsvps.status} = 'going')::int` })
    .from(events)
    .leftJoin(eventRsvps, eq(eventRsvps.eventId, events.id))
    .groupBy(events.id)
    .orderBy(desc(events.startsAt))
    .limit(100);

  return (
    <div>
      <PageHeader eyebrow="Events and meetups" title="Bring people together." emphasis="together" />
      <WebsiteTabs current="/website/events" />

      {rows.length === 0 ? (
        <Empty title="No events yet.">
          <p>Create one below. It goes on the website once you approve and publish it.</p>
        </Empty>
      ) : (
        <ul className="card mb-10 divide-y divide-rosemist">
          {rows.map(({ e, going }) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/website/events/${e.id}`} className="font-serif text-xl font-light text-signal no-underline hover:underline">
                  {e.title}
                </Link>
                <p className="text-sm">
                  {formatBrisbane(e.startsAt)} · {going}
                  {e.capacity ? ` of ${e.capacity}` : ""} going
                </p>
              </div>
              <span className={e.status === "published" ? "pill-ok pill" : e.status === "cancelled" ? "pill-red pill" : "pill"}>{EVENT_STATUS[e.status] ?? e.status}</span>
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="new-event">
        <h2 id="new-event" className="mb-3">
          New event.
        </h2>
        <form action={createEventAction} className="card space-y-4">
          <EventFields />
          <button className="btn btn-primary">Create the draft</button>
        </form>
      </section>
    </div>
  );
}
