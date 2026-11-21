import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { eventRsvps, events, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { eventHash } from "@/lib/events";
import { hasBlockingIssues } from "@/lib/brand/check";
import { emailReady } from "@/lib/email";
import { BrandIssues, EVENT_STATUS, WebsiteTabs } from "../../tabs";
import { eventDecisionAction, saveEventAction } from "../../actions";
import { EventFields } from "../event-form";

export default async function EventAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const me = await requireUser();
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) notFound();
  const people = await db.select().from(eventRsvps).where(eq(eventRsvps.eventId, id)).orderBy(asc(eventRsvps.createdAt));
  const approver = e.approvedBy ? await db.query.users.findFirst({ where: eq(users.id, e.approvedBy), columns: { name: true } }) : null;
  const owner = me.role === "owner";
  const approvedOk = e.status === "approved" && e.approvedHash === eventHash(e);
  const going = people.filter((p) => p.status === "going").length;
  const waitlist = people.filter((p) => p.status === "waitlist").length;

  return (
    <div>
      <PageHeader eyebrow="Event" title={e.title}>
        <span className={e.status === "published" ? "pill-ok pill" : "pill"}>{EVENT_STATUS[e.status] ?? e.status}</span>
      </PageHeader>
      <WebsiteTabs current="/website/events" />

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form action={saveEventAction} className="card space-y-4">
          <input type="hidden" name="id" value={e.id} />
          <fieldset disabled={e.status === "cancelled"} className="space-y-4">
            <EventFields e={e} />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary">Save event</button>
              {e.status === "published" && (
                <a href={`/site/events/${e.slug}`} target="_blank" rel="noopener" className="btn">
                  View live ↗
                </a>
              )}
            </div>
          </fieldset>
        </form>

        <aside className="space-y-5">
          <section className="card space-y-3" aria-label="Approval">
            <p className="label text-deepred">Approval and publishing</p>
            <BrandIssues issues={e.brandIssues} />
            {e.approvedAt && (
              <p className="text-sm">
                Approved by {approver?.name ?? "the owner"}, {formatBrisbane(e.approvedAt)}
              </p>
            )}
            {owner && e.status !== "cancelled" && (
              <form action={eventDecisionAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={e.id} />
                {e.status === "draft" && (
                  <>
                    <button name="decision" value="approve" className="btn btn-sm">
                      Approve
                    </button>
                    <button name="decision" value="approve_publish" className="btn btn-primary btn-sm">
                      Approve and publish
                    </button>
                    {hasBlockingIssues(e.brandIssues) && (
                      <label className="flex w-full items-center gap-2 text-sm">
                        <input type="checkbox" name="override" value="1" className="accent-deepred" /> Approve despite the brand issues (recorded)
                      </label>
                    )}
                  </>
                )}
                {approvedOk && (
                  <button name="decision" value="publish" className="btn btn-primary btn-sm">
                    Publish and open RSVPs
                  </button>
                )}
                {e.status === "published" && (
                  <button name="decision" value="unpublish" className="btn btn-sm">
                    Take off the website
                  </button>
                )}
              </form>
            )}
            {!owner && <p className="text-sm">The owner approves and publishes events.</p>}
          </section>

          <section className="card space-y-2" aria-label="RSVPs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="label text-deepred">
                RSVPs · {going} going{e.capacity ? ` of ${e.capacity}` : ""}
                {waitlist ? ` · ${waitlist} waitlist` : ""}
              </p>
              {people.length > 0 && (
                <a href={`/api/website/events/${e.id}/rsvps`} className="btn btn-sm">
                  Export CSV
                </a>
              )}
            </div>
            {people.length === 0 ? (
              <p className="text-sm">No RSVPs yet.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-rosemist overflow-y-auto text-[15px]">
                {people.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2 py-2">
                    <span>
                      <strong className="text-ink">{p.name}</strong> · {p.email}
                    </span>
                    <span className="text-sm">{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {!emailReady() && <p className="text-sm">Email isn&apos;t set up, so people don&apos;t get a confirmation yet. Add a Resend key in Settings.</p>}
          </section>

          {owner && e.status !== "cancelled" && (
            <details className="card-tint">
              <summary className="cursor-pointer font-bold text-deepred">Cancel this event</summary>
              <form action={eventDecisionAction} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={e.id} />
                <textarea name="message" className="textarea min-h-[90px]" placeholder="A short note to everyone who RSVP'd." />
                <button name="decision" value="cancel" className="btn btn-sm">
                  Cancel the event{emailReady() && people.length ? " and email everyone" : ""}
                </button>
              </form>
            </details>
          )}
        </aside>
      </div>
    </div>
  );
}
