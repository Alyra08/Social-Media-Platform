import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, posts } from "@/db/schema";
import { DemoBadge, Empty, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { finalText, technicalCheck } from "@/lib/publishing";
import { acceptRecommendation, confirmManual, publishNow, retryFailed, schedulePostAction, unscheduleAction } from "../actions";

const toLocalInput = (d: Date | null) => (d ? new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 16) : "");

export default async function PublishingPage() {
  const db = await getDb();
  const rows = await db.select().from(posts).where(inArray(posts.status, ["approved_for_publishing", "scheduled", "manual_required", "failed", "publishing"])).orderBy(posts.scheduledAt);
  const recent = await db.select().from(posts).where(eq(posts.status, "published")).orderBy(desc(posts.publishedAt)).limit(10);
  const accs = await db.select().from(accounts).where(eq(accounts.status, "connected"));
  const group = (s: string[]) => rows.filter((r) => s.includes(r.status));

  const Thumb = ({ id }: { id: string | null }) =>
    id ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/api/designs/${id}/image`} alt="" className="h-24 w-24 shrink-0 rounded-[14px] object-cover" loading="lazy" />
    ) : null;

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Publishing and scheduling" title="Approved, timed, out the door." emphasis="out the door" />

      <section>
        <h2 className="mb-3">Ready to schedule.</h2>
        {group(["approved_for_publishing"]).length === 0 ? (
          <Empty title="Nothing waiting to be scheduled." />
        ) : (
          <div className="space-y-4">
            {group(["approved_for_publishing"]).map((p) => {
              const myAccounts = accs.filter((a) => a.platform === p.platform);
              const tech = technicalCheck(p);
              return (
                <article key={p.id} className="card flex flex-col gap-4 md:flex-row">
                  <Thumb id={p.approvedDesignId} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="label text-deepred">
                      {PLATFORM_LABEL[p.platform]} · {p.format} {p.isDemo && <DemoBadge />}
                    </p>
                    <p className="font-bold text-ink">{p.hook}</p>
                    {p.scheduleReason && (
                      <p className="text-[15px]">
                        <strong className="text-ink">Recommended:</strong> {p.scheduleReason}
                      </p>
                    )}
                    {tech.length > 0 && <p className="font-bold text-deepred">{tech.join(" ")}</p>}
                    <form action={acceptRecommendation} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <AccountSelect accounts={myAccounts} />
                      <button className="btn btn-primary btn-sm">Accept recommended time</button>
                    </form>
                    <form action={schedulePostAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <AccountSelect accounts={myAccounts} />
                      <label className="sr-only" htmlFor={`when-${p.id}`}>
                        Date and time (Brisbane)
                      </label>
                      <input id={`when-${p.id}`} type="datetime-local" name="when" defaultValue={toLocalInput(p.scheduledAt)} className="input max-w-[240px]" />
                      <select name="recurrence" className="select max-w-[160px]" aria-label="Repeat">
                        <option value="">No repeat</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                      <button className="btn btn-sm">Schedule at this time</button>
                    </form>
                    <form action={publishNow}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="btn btn-sm">Publish now</button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3">Needs you: publish manually.</h2>
        {group(["manual_required"]).length === 0 ? (
          <Empty title="Nothing to publish by hand." />
        ) : (
          group(["manual_required"]).map((p) => (
            <article key={p.id} className="card mb-4 flex flex-col gap-4 md:flex-row">
              <Thumb id={p.approvedDesignId} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="label text-deepred">{PLATFORM_LABEL[p.platform]}</p>
                <p>{p.manualInstructions}</p>
                <details>
                  <summary className="cursor-pointer font-bold text-deepred">Final caption to paste</summary>
                  <textarea readOnly defaultValue={finalText(p)} className="textarea mt-2" rows={6} aria-label="Final caption" />
                </details>
                {p.approvedDesignId && <a href={`/api/designs/${p.approvedDesignId}/image?download=1`}>Download the approved design</a>}
                <form action={confirmManual} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <input name="liveUrl" type="url" required className="input max-w-md" placeholder="Paste the live post URL" aria-label="Live post URL" />
                  <button className="btn btn-sm">Confirm published</button>
                </form>
              </div>
            </article>
          ))
        )}
      </section>

      <section>
        <h2 className="mb-3">Publishing failures.</h2>
        {group(["failed"]).length === 0 ? (
          <div className="card-tint">✓ No failures.</div>
        ) : (
          group(["failed"]).map((p) => (
            <article key={p.id} className="card mb-3">
              <p className="label text-deepred">{PLATFORM_LABEL[p.platform]} · {p.publishAttempts} attempts</p>
              <p className="font-bold text-ink">{p.hook}</p>
              <p className="mt-1 text-deepred">{p.lastError}</p>
              <form action={retryFailed} className="mt-2">
                <input type="hidden" name="id" value={p.id} />
                <button className="btn btn-sm">Retry now</button>
              </form>
            </article>
          ))
        )}
      </section>

      <section>
        <h2 className="mb-3">Scheduled queue.</h2>
        {group(["scheduled", "publishing"]).length === 0 ? (
          <Empty title="Nothing scheduled." />
        ) : (
          <ul className="card divide-y divide-rosemist">
            {group(["scheduled", "publishing"]).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                  {p.hook}
                  {p.recurrence && <span className="pill ml-2">Repeats {p.recurrence}</span>}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{formatBrisbane(p.scheduledAt)}</span>
                  <StatusPill status={p.status} />
                  {p.status === "scheduled" && (
                    <>
                      <form action={publishNow}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn btn-sm">Publish now</button>
                      </form>
                      <form action={unscheduleAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn btn-sm">Unschedule</button>
                      </form>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3">Recently published.</h2>
        {recent.length === 0 ? (
          <Empty title="Nothing published yet." />
        ) : (
          <ul className="card divide-y divide-rosemist">
            {recent.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-3">
                <span>
                  <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                  {p.hook}
                </span>
                <span className="text-sm">
                  {formatBrisbane(p.publishedAt)} ·{" "}
                  {p.liveUrl && (
                    <a href={p.liveUrl} target="_blank" rel="noreferrer">
                      View live post
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/archive" className="mt-3 inline-block">
          Open the full archive
        </Link>
      </section>
    </div>
  );
}

function AccountSelect({ accounts }: { accounts: (typeof import("@/db/schema").accounts.$inferSelect)[] }) {
  if (!accounts.length) return <span className="text-sm">No connected account: you&apos;ll be asked to publish manually.</span>;
  return (
    <select name="accountId" className="select max-w-[240px]" aria-label="Account">
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.handle}
          {a.mode === "sandbox" ? " (sandbox)" : ""}
        </option>
      ))}
    </select>
  );
}
