import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, newsletterIssues, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { issueHash, renderIssue, subscriberCounts } from "@/lib/newsletter";
import { hasBlockingIssues } from "@/lib/brand/check";
import { emailReady } from "@/lib/email";
import { BrandIssues, ISSUE_STATUS, WebsiteTabs } from "../../tabs";
import { issueDecisionAction, saveIssueAction } from "../../actions";

export default async function IssueEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const me = await requireUser();
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i) notFound();
  const [live, counts, preview] = await Promise.all([
    db.select({ id: articles.id, title: articles.title, publishedAt: articles.publishedAt }).from(articles).where(eq(articles.status, "published")).orderBy(desc(articles.publishedAt)).limit(30),
    subscriberCounts(db),
    renderIssue(db, i),
  ]);
  const approver = i.approvedBy ? await db.query.users.findFirst({ where: eq(users.id, i.approvedBy), columns: { name: true } }) : null;
  const locked = ["sending", "sent", "sent_manually"].includes(i.status);
  const approvedOk = i.status === "approved" && i.approvedHash === issueHash(i);
  const owner = me.role === "owner";
  const confirmed = counts.confirmed ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Sunday note" title={i.subject}>
        <span className="pill">{ISSUE_STATUS[i.status] ?? i.status}</span>
      </PageHeader>
      <WebsiteTabs current="/website/newsletter" />

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <form action={saveIssueAction} className="card space-y-3">
            <input type="hidden" name="id" value={i.id} />
            <fieldset disabled={locked} className="space-y-3">
              <label className="block">
                <span className="label mb-1 block text-deepred">Subject line</span>
                <input name="subject" defaultValue={i.subject} required className="input" />
              </label>
              <label className="block">
                <span className="label mb-1 block text-deepred">Preview text (shown after the subject in the inbox)</span>
                <input name="preheader" defaultValue={i.preheader ?? ""} className="input" maxLength={140} />
              </label>
              <label className="block">
                <span className="label mb-1 block text-deepred">Introduction</span>
                <textarea name="intro" defaultValue={i.intro} className="textarea min-h-[200px]" placeholder="Start with something that happened this week. Oddly specific beats general." />
              </label>
              <fieldset>
                <legend className="label mb-2 text-deepred">Articles to include (live articles only)</legend>
                {live.length === 0 ? (
                  <p className="text-sm">No live articles yet. Publish one from the Articles tab.</p>
                ) : (
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {live.map((a) => (
                      <li key={a.id}>
                        <label className="flex items-start gap-2 text-[15px]">
                          <input type="checkbox" name="articleIds" value={a.id} defaultChecked={i.articleIds.includes(a.id)} className="mt-1 accent-deepred" />
                          {a.title}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
              <label className="block">
                <span className="label mb-1 block text-deepred">Sign-off</span>
                <textarea name="closing" defaultValue={i.closing ?? ""} className="textarea min-h-[80px]" />
              </label>
              {!locked && <button className="btn btn-primary">Save issue</button>}
            </fieldset>
          </form>

          <section className="card space-y-3" aria-label="Approval and sending">
            <p className="label text-deepred">Approval and sending</p>
            <BrandIssues issues={i.brandIssues} />
            {i.approvedAt && (
              <p className="text-sm">
                Approved by {approver?.name ?? "the owner"}, {formatBrisbane(i.approvedAt)}
              </p>
            )}
            {i.status === "sending" && <p className="text-[15px]">Sending now, in batches every few minutes. You&apos;ll get a notification when it&apos;s finished.</p>}
            {(i.status === "sent" || i.status === "sent_manually") && (
              <p className="text-[15px]">
                Sent {formatBrisbane(i.sentAt)} to {i.recipientCount} {i.recipientCount === 1 ? "person" : "people"}
                {i.failedCount ? ` (${i.failedCount} failed)` : ""}.
              </p>
            )}
            {owner && i.status === "draft" && (
              <form action={issueDecisionAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={i.id} />
                <button name="decision" value="approve" className="btn btn-primary btn-sm">
                  Approve this issue
                </button>
                {hasBlockingIssues(i.brandIssues) && (
                  <label className="flex w-full items-center gap-2 text-sm">
                    <input type="checkbox" name="override" value="1" className="accent-deepred" /> Approve despite the brand issues (recorded)
                  </label>
                )}
              </form>
            )}
            {owner && approvedOk && (
              <div className="space-y-3">
                <form action={issueDecisionAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <button name="decision" value="send" className="btn btn-primary btn-sm" disabled={!emailReady() || confirmed === 0}>
                    Send to {confirmed} confirmed {confirmed === 1 ? "subscriber" : "subscribers"}
                  </button>
                  {!emailReady() && <p className="mt-1 text-sm">Add a Resend key in Settings to send from here.</p>}
                </form>
                <form action={issueDecisionAction} className="flex flex-wrap items-end gap-2 border-t border-rosemist pt-3">
                  <input type="hidden" name="id" value={i.id} />
                  <a href={`/api/website/newsletter/${i.id}/html`} className="btn btn-sm">
                    Download email (HTML)
                  </a>
                  <label className="text-sm">
                    Sent from another tool to
                    <input name="recipients" type="number" min={0} defaultValue={confirmed} className="input mt-1 max-w-[120px]" />
                  </label>
                  <button name="decision" value="manual" className="btn btn-sm">
                    Mark as sent
                  </button>
                </form>
              </div>
            )}
            {!owner && i.status === "draft" && <p className="text-sm">The owner approves and sends each issue.</p>}
          </section>
        </div>

        <section aria-label="Email preview">
          <p className="label mb-2 text-deepred">Preview</p>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[900px] w-full rounded-[22px] border-0 bg-white" />
        </section>
      </div>
    </div>
  );
}
