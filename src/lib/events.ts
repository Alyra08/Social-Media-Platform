import crypto from "node:crypto";
import { and, asc, desc, eq, gte, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { eventRsvps, events, type BrandIssue } from "@/db/schema";
import { checkBrandCopy, hasBlockingIssues } from "./brand/check";
import { emailReady, emailShell, esc, sendEmail, siteUrl } from "./email";
import { randomToken } from "./crypto";
import { normaliseEmail, toCsv, validEmail } from "./newsletter";
import { slugify } from "./website";
import { formatBrisbane } from "./scheduling";
import { audit, notify, type Actor } from "./system";

/** Events and meetups: owner-approved listings, RSVPs with capacity and a waitlist. */
export class EventError extends Error {}

type EventRow = typeof events.$inferSelect;
export type EventEdit = {
  title: string;
  summary: string;
  body: string;
  startsAt: Date;
  endsAt?: Date | null;
  location?: string | null;
  onlineUrl?: string | null;
  capacity?: number | null;
  priceNote?: string | null;
  slug?: string | null;
};

export function eventHash(e: Pick<EventRow, "title" | "summary" | "body" | "startsAt" | "endsAt" | "location" | "onlineUrl" | "capacity" | "priceNote" | "slug">) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([e.title.trim(), e.summary.trim(), e.body.trim(), e.startsAt.toISOString(), e.endsAt?.toISOString() ?? "", e.location ?? "", e.onlineUrl ?? "", e.capacity ?? null, e.priceNote ?? "", e.slug]))
    .digest("hex");
}

export function checkEvent(e: Pick<EventEdit, "title" | "summary" | "body">): BrandIssue[] {
  return [
    ...checkBrandCopy({ hook: e.title }).map((x) => ({ ...x, detail: x.detail.replace(/\bhook\b/, "title") })),
    ...checkBrandCopy({ caption: e.summary }).map((x) => ({ ...x, detail: x.detail.replace(/\bcaption\b/, "summary") })),
    ...checkBrandCopy({ supportingCopy: e.body }).map((x) => ({ ...x, detail: x.detail.replace(/supporting copy/, "description") })),
  ].filter((x) => x.rule !== "sentence-case");
}

async function uniqueEventSlug(db: Db, base: string, exceptId?: string) {
  const root = slugify(base);
  for (let i = 0; i < 50; i++) {
    const c = i === 0 ? root : `${root}-${i + 1}`;
    const clash = await db.query.events.findFirst({ where: exceptId ? and(eq(events.slug, c), ne(events.id, exceptId)) : eq(events.slug, c) });
    if (!clash) return c;
  }
  return `${root}-${crypto.randomUUID().slice(0, 6)}`;
}

function validate(e: EventEdit) {
  if (!e.title.trim()) throw new EventError("The event needs a title.");
  if (Number.isNaN(e.startsAt.getTime())) throw new EventError("Choose a start date and time.");
  if (e.endsAt && e.endsAt < e.startsAt) throw new EventError("The event can't end before it starts.");
  if (e.capacity != null && (e.capacity < 1 || e.capacity > 100000)) throw new EventError("Capacity must be at least 1, or left empty for no limit.");
  if (e.onlineUrl) {
    try {
      if (new URL(e.onlineUrl).protocol !== "https:") throw new Error();
    } catch {
      throw new EventError("The online link must start with https://");
    }
  }
}

export async function createEvent(db: Db, actor: Actor, e: EventEdit): Promise<string> {
  validate(e);
  const [row] = await db
    .insert(events)
    .values({
      title: e.title.trim(),
      summary: e.summary.trim(),
      body: e.body.trim(),
      startsAt: e.startsAt,
      endsAt: e.endsAt ?? null,
      location: e.location?.trim() || null,
      onlineUrl: e.onlineUrl?.trim() || null,
      capacity: e.capacity ?? null,
      priceNote: e.priceNote?.trim() || null,
      slug: await uniqueEventSlug(db, e.slug || e.title),
      brandIssues: checkEvent(e),
    })
    .returning();
  await audit(db, actor, "event.create", "event", row.id, row.title);
  return row.id;
}

export async function updateEvent(db: Db, actor: Actor, id: string, e: EventEdit): Promise<{ reset: boolean }> {
  validate(e);
  const cur = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!cur) throw new EventError("Event not found.");
  if (cur.status === "cancelled") throw new EventError("This event was cancelled.");
  const next = {
    title: e.title.trim(),
    summary: e.summary.trim(),
    body: e.body.trim(),
    startsAt: e.startsAt,
    endsAt: e.endsAt ?? null,
    location: e.location?.trim() || null,
    onlineUrl: e.onlineUrl?.trim() || null,
    capacity: e.capacity ?? null,
    priceNote: e.priceNote?.trim() || null,
    slug: e.slug?.trim() ? await uniqueEventSlug(db, e.slug, id) : cur.slug,
  };
  const reset = Boolean(cur.approvedHash && eventHash(next) !== cur.approvedHash);
  await db
    .update(events)
    .set({ ...next, brandIssues: checkEvent(next), ...(reset ? { status: "draft", approvedHash: null, approvedAt: null, approvedBy: null } : {}), updatedAt: new Date() })
    .where(eq(events.id, id));
  await audit(db, actor, reset ? "event.edit_reset_approval" : "event.save", "event", id, next.title);
  if (reset && cur.status === "published") await notify(db, "system", `Event taken off the website for re-approval: ${next.title}`, undefined, `/website/events/${id}`);
  return { reset };
}

export async function approveEvent(db: Db, actor: Actor, id: string, opts: { override?: boolean } = {}) {
  if (actor.role !== "owner") throw new EventError("Only the owner can approve events.");
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) throw new EventError("Event not found.");
  if (e.status !== "draft") throw new EventError("Only a draft event can be approved.");
  const issues = checkEvent(e);
  if (hasBlockingIssues(issues) && !opts.override) throw new EventError(`Fix the brand issues first: ${issues.filter((i) => i.severity === "block").map((i) => i.detail).join(" ")}`);
  await db.update(events).set({ status: "approved", approvedHash: eventHash(e), approvedBy: actor.id ?? null, approvedAt: new Date(), brandIssues: issues }).where(eq(events.id, id));
  await audit(db, actor, opts.override && hasBlockingIssues(issues) ? "event.approve_override" : "event.approve", "event", id, e.title);
}

export async function publishEvent(db: Db, actor: Actor, id: string) {
  if (actor.role !== "owner") throw new EventError("Only the owner can publish events.");
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) throw new EventError("Event not found.");
  if (!e.approvedHash || e.status !== "approved") throw new EventError("Approve the event before publishing it.");
  if (eventHash(e) !== e.approvedHash) throw new EventError("The event changed after approval. Approve it again.");
  await db.update(events).set({ status: "published", publishedAt: new Date() }).where(eq(events.id, id));
  await audit(db, actor, "event.publish", "event", id, e.title);
}

export async function unpublishEvent(db: Db, actor: Actor, id: string) {
  if (actor.role !== "owner") throw new EventError("Only the owner can take events off the website.");
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e || e.status !== "published") throw new EventError("This event isn't live.");
  await db.update(events).set({ status: "approved" }).where(eq(events.id, id));
  await audit(db, actor, "event.unpublish", "event", id, e.title);
}

/** Cancel an event and email everyone who RSVP'd (when email is set up). */
export async function cancelEvent(db: Db, actor: Actor, id: string, message: string) {
  if (actor.role !== "owner") throw new EventError("Only the owner can cancel events.");
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e || e.status === "cancelled") throw new EventError("Event not found or already cancelled.");
  await db.update(events).set({ status: "cancelled" }).where(eq(events.id, id));
  await audit(db, actor, "event.cancel", "event", id, message);
  if (!emailReady()) return { emailed: 0 };
  const people = await db.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, id), ne(eventRsvps.status, "cancelled")));
  let emailed = 0;
  for (const p of people) {
    const r = await sendEmail({
      to: p.email,
      subject: `Cancelled: ${e.title}`,
      text: `Hi ${p.name},\n\n${e.title} on ${formatBrisbane(e.startsAt)} has been cancelled.\n\n${message}`,
      html: emailShell({ bodyHtml: `<h1 style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:28px;margin:0 0 12px">${esc(e.title)} is cancelled.</h1><p>Hi ${esc(p.name)},</p><p>${esc(message).replace(/\n/g, "<br>")}</p>` }),
      idempotencyKey: `event-cancel:${p.id}`,
    });
    if (r.ok) emailed++;
  }
  return { emailed };
}

/* ───────────── RSVPs ───────────── */

export async function rsvpCounts(db: Db, eventId: string) {
  const rows = await db.select({ status: eventRsvps.status, n: sql<number>`count(*)::int` }).from(eventRsvps).where(eq(eventRsvps.eventId, eventId)).groupBy(eventRsvps.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  return { going: n("going"), waitlist: n("waitlist"), cancelled: n("cancelled") };
}

/** RSVP from the public site. Full events put people on the waitlist; the same email can't RSVP twice. */
export async function rsvp(db: Db, input: { slug: string; name: string; email: string }): Promise<{ status: "going" | "waitlist"; already: boolean }> {
  const e = await db.query.events.findFirst({ where: and(eq(events.slug, input.slug), eq(events.status, "published")) });
  if (!e) throw new EventError("This event isn't taking RSVPs.");
  if (e.startsAt.getTime() < Date.now()) throw new EventError("This event has already started.");
  const email = normaliseEmail(input.email);
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new EventError("Add your name so we know who's coming.");
  if (!validEmail(email)) throw new EventError("That email address doesn't look right.");
  const existing = await db.query.eventRsvps.findFirst({ where: and(eq(eventRsvps.eventId, e.id), eq(eventRsvps.email, email)) });
  if (existing && existing.status !== "cancelled") return { status: existing.status as "going" | "waitlist", already: true };
  const { going } = await rsvpCounts(db, e.id);
  const status: "going" | "waitlist" = e.capacity != null && going >= e.capacity ? "waitlist" : "going";
  let row: typeof eventRsvps.$inferSelect;
  if (existing) {
    [row] = await db.update(eventRsvps).set({ status, name }).where(eq(eventRsvps.id, existing.id)).returning();
  } else {
    const inserted = await db.insert(eventRsvps).values({ eventId: e.id, name, email, status, token: randomToken(24) }).onConflictDoNothing().returning();
    if (!inserted.length) return { status, already: true };
    row = inserted[0];
  }
  await notify(db, "system", `New RSVP: ${e.title}`, `${name} (${status === "going" ? "going" : "waitlist"})`, `/website/events/${e.id}`);
  await sendRsvpEmail(db, e, row);
  return { status, already: false };
}

async function sendRsvpEmail(db: Db, e: EventRow, r: typeof eventRsvps.$inferSelect) {
  if (!emailReady()) return;
  const cancelUrl = siteUrl(`/events/cancel?token=${encodeURIComponent(r.token)}`);
  const going = r.status === "going";
  const where = [e.location, going && e.onlineUrl ? `Join online: ${e.onlineUrl}` : null].filter(Boolean).join("\n");
  await sendEmail({
    to: r.email,
    subject: going ? `You're in: ${e.title}` : `You're on the waitlist: ${e.title}`,
    text: `Hi ${r.name},\n\n${going ? "You're coming to" : "You're on the waitlist for"} ${e.title}, ${formatBrisbane(e.startsAt)} (Brisbane time).\n${where}\n\nCan't make it? Cancel here: ${cancelUrl}`,
    html: emailShell({
      bodyHtml: `<h1 style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:28px;margin:0 0 12px">${going ? "You're <em style=\"color:#D9087F\">in</em>." : "You're on the waitlist."}</h1>
<p>Hi ${esc(r.name)}, ${going ? "see you at" : "we'll let you know if a spot opens up for"} <strong>${esc(e.title)}</strong>.</p>
<p><strong>When:</strong> ${esc(formatBrisbane(e.startsAt))} (Brisbane time)${e.location ? `<br><strong>Where:</strong> ${esc(e.location)}` : ""}${going && e.onlineUrl ? `<br><strong>Join online:</strong> <a href="${esc(e.onlineUrl)}" style="color:#9E0962">${esc(e.onlineUrl)}</a>` : ""}</p>
<p style="font-size:14px">Can't make it? <a href="${esc(cancelUrl)}" style="color:#9E0962">Cancel my RSVP</a> so someone else can have the spot.</p>`,
    }),
    idempotencyKey: `rsvp:${r.id}:${r.status}`,
  });
}

/** Cancel an RSVP by its private link. If a spot opens, the first person on the waitlist is moved up. */
export async function cancelRsvp(db: Db, token: string): Promise<{ title: string } | null> {
  if (!token) return null;
  const r = await db.query.eventRsvps.findFirst({ where: eq(eventRsvps.token, token) });
  if (!r) return null;
  const e = await db.query.events.findFirst({ where: eq(events.id, r.eventId) });
  if (r.status !== "cancelled") {
    await db.update(eventRsvps).set({ status: "cancelled" }).where(eq(eventRsvps.id, r.id));
    if (r.status === "going" && e?.status === "published") await promoteFromWaitlist(db, e);
  }
  return e ? { title: e.title } : null;
}

async function promoteFromWaitlist(db: Db, e: EventRow) {
  if (e.capacity == null) return;
  const { going } = await rsvpCounts(db, e.id);
  if (going >= e.capacity) return;
  const [next] = await db.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, e.id), eq(eventRsvps.status, "waitlist"))).orderBy(asc(eventRsvps.createdAt)).limit(1);
  if (!next) return;
  const [row] = await db.update(eventRsvps).set({ status: "going" }).where(and(eq(eventRsvps.id, next.id), eq(eventRsvps.status, "waitlist"))).returning();
  if (row) await sendRsvpEmail(db, e, row);
}

export async function rsvpsCsv(db: Db, eventId: string) {
  const rows = await db.select().from(eventRsvps).where(eq(eventRsvps.eventId, eventId)).orderBy(asc(eventRsvps.createdAt));
  return toCsv(["name", "email", "status", "rsvp_at"], rows.map((r) => [r.name, r.email, r.status, r.createdAt]));
}

/* ───────────── Public queries ───────────── */

export async function upcomingEvents(db: Db, limit = 20) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.status, "published"), gte(events.startsAt, new Date(Date.now() - 6 * 3600_000))))
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

export async function pastEvents(db: Db, limit = 12) {
  return db
    .select()
    .from(events)
    .where(and(eq(events.status, "published"), sql`${events.startsAt} < now() - interval '6 hours'`))
    .orderBy(desc(events.startsAt))
    .limit(limit);
}

export async function publishedEventBySlug(db: Db, slug: string) {
  return db.query.events.findFirst({ where: and(eq(events.slug, slug), eq(events.status, "published")) });
}
