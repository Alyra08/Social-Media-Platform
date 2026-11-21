import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { publishedEventBySlug, rsvpCounts } from "@/lib/events";
import { rsvpAction } from "../../actions";
import { ArticleBody } from "@/components/article-body";
import { eventWhen } from "@/components/site";
import { emailReady } from "@/lib/email";
import { nowMs } from "@/lib/time";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ rsvp?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await publishedEventBySlug(await getDb(), (await params).slug);
  return e ? { title: e.title, description: e.summary } : { title: "Not found" };
}

export default async function EventPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { rsvp } = await searchParams;
  const db = await getDb();
  const e = await publishedEventBySlug(db, slug);
  if (!e) notFound();
  const { going } = await rsvpCounts(db, e.id);
  const full = e.capacity != null && going >= e.capacity;
  const started = e.startsAt.getTime() < nowMs();
  const left = e.capacity != null ? Math.max(0, e.capacity - going) : null;
  const emails = emailReady();

  const MESSAGES: Record<string, { ok: boolean; text: string }> = {
    going: { ok: true, text: emails ? "You're in. A confirmation is on its way to your inbox." : "You're in. We'll be in touch with the details." },
    waitlist: { ok: true, text: "It's full, so you're on the waitlist. If a spot opens up, it's yours." },
    "already-going": { ok: true, text: "You've already RSVP'd. See you there." },
    "already-waitlist": { ok: true, text: "You're already on the waitlist. We'll let you know if a spot opens up." },
    invalid: { ok: false, text: "Check your name and email and try again." },
    closed: { ok: false, text: "RSVPs for this event have closed." },
    slow: { ok: false, text: "Lots of RSVPs from here just now. Try again in a few minutes." },
  };
  const msg = rsvp ? MESSAGES[rsvp] : undefined;

  return (
    <div className="grid gap-10 pt-4 lg:grid-cols-[1.5fr_1fr]">
      <article>
        <Link href="/site/events" className="label text-deepred no-underline">
          Events and meetups
        </Link>
        <h1 className="mt-3 text-[clamp(2.2rem,5vw,3.4rem)]">{e.title}</h1>
        <p className="mt-4 text-xl">{e.summary}</p>
        <div className="mt-8">
          <ArticleBody body={e.body} />
        </div>
      </article>

      <aside className="space-y-5">
        <div className="card-tint space-y-2 text-[15px]">
          <p>
            <strong className="text-ink">When:</strong> {eventWhen(e.startsAt)}
            {e.endsAt ? ` to ${e.endsAt.toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" })}` : ""} (Brisbane time)
          </p>
          {e.location && (
            <p>
              <strong className="text-ink">Where:</strong> {e.location}
            </p>
          )}
          {e.onlineUrl && (
            <p>
              <strong className="text-ink">Online:</strong> the link is sent to you when you RSVP.
            </p>
          )}
          {e.priceNote && (
            <p>
              <strong className="text-ink">Cost:</strong> {e.priceNote}
            </p>
          )}
          {left !== null && !started && <p className="font-bold text-deepred">{full ? "Full. Join the waitlist." : `${left} ${left === 1 ? "spot" : "spots"} left.`}</p>}
        </div>

        <div id="rsvp" className="card">
          <h2 className="text-2xl">{started ? "This event has started." : full ? "Join the waitlist." : "Save your spot."}</h2>
          {msg && (
            <p role="status" className={`mt-3 rounded-[18px] px-4 py-3 text-[15px] ${msg.ok ? "bg-peach text-ink" : "bg-deepred text-white"}`}>
              {msg.text}
            </p>
          )}
          {!started && !msg?.ok && (
            <form action={rsvpAction} className="mt-3 space-y-2">
              <input type="hidden" name="slug" value={e.slug} />
              <label className="hp" aria-hidden>
                Leave this empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
              <label className="block text-[15px]">
                Your name
                <input name="name" required maxLength={80} className="input mt-1" autoComplete="name" />
              </label>
              <label className="block text-[15px]">
                Email
                <input name="email" type="email" required className="input mt-1" autoComplete="email" />
              </label>
              <button className="btn btn-primary w-full">{full ? "Join the waitlist" : "RSVP"}</button>
              <p className="text-sm">We only use your email for this event. Each confirmation has a link to cancel.</p>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
