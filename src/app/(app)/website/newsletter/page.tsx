import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { newsletterIssues, subscribers } from "@/db/schema";
import { Empty, PageHeader, Stat } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { subscriberCounts } from "@/lib/newsletter";
import { emailReady } from "@/lib/email";
import { ISSUE_STATUS, WebsiteTabs } from "../tabs";
import { newIssueAction } from "../actions";

export default async function NewsletterAdmin() {
  const db = await getDb();
  const [counts, issues, recent] = await Promise.all([
    subscriberCounts(db),
    db.select().from(newsletterIssues).orderBy(desc(newsletterIssues.createdAt)).limit(60),
    db.select().from(subscribers).orderBy(desc(subscribers.createdAt)).limit(12),
  ]);
  const ready = emailReady();

  return (
    <div>
      <PageHeader eyebrow="Newsletter" title="The Sunday note." emphasis="Sunday note" />
      <WebsiteTabs current="/website/newsletter" />

      {!ready && (
        <div className="card-tint mb-6 text-[15px]">
          <strong className="text-ink">Email isn&apos;t set up yet.</strong> Sign-ups are still collected from the website. Their confirmation emails go out automatically once you add a Resend key in{" "}
          <Link href="/settings#keys">Settings → Keys and connections</Link>. Until then you can export confirmed subscribers, and download each issue to send from another tool.
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Confirmed subscribers" value={counts.confirmed ?? 0} />
        <Stat label="Waiting to confirm" value={counts.pending ?? 0} note={ready ? undefined : "Confirmation emails send once email is set up"} />
        <Stat label="Unsubscribed" value={counts.unsubscribed ?? 0} />
        <div className="card flex flex-col justify-center gap-2">
          <a href="/api/website/subscribers" className="btn btn-sm">
            Export confirmed (CSV)
          </a>
          <a href="/api/website/subscribers?all=1" className="btn btn-sm">
            Export everyone (CSV)
          </a>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2>Issues.</h2>
        <form action={newIssueAction}>
          <button className="btn btn-primary btn-sm">New issue</button>
        </form>
      </div>
      {issues.length === 0 ? (
        <Empty title="No issues yet.">
          <p>New issue starts a draft with your three latest live articles.</p>
        </Empty>
      ) : (
        <ul className="card divide-y divide-rosemist">
          {issues.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div>
                <Link href={`/website/newsletter/${i.id}`} className="font-serif text-xl font-light text-deepred no-underline hover:underline">
                  {i.subject}
                </Link>
                <p className="text-sm">
                  {i.sentAt ? `Sent ${formatBrisbane(i.sentAt)} to ${i.recipientCount}${i.failedCount ? ` (${i.failedCount} failed)` : ""}` : `Updated ${formatBrisbane(i.updatedAt)}`}
                </p>
              </div>
              <span className={i.status === "sent" || i.status === "sent_manually" ? "pill-ok pill" : i.status === "draft" ? "pill" : "pill-ink pill"}>{ISSUE_STATUS[i.status] ?? i.status}</span>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3">Latest sign-ups.</h2>
          <ul className="card divide-y divide-rosemist text-[15px]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <strong className="text-ink">{r.name ?? r.email}</strong>
                  {r.name ? ` · ${r.email}` : ""} · from {r.source}
                </span>
                <span className="text-sm">
                  {r.status} · {formatBrisbane(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
