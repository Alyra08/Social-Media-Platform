import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { interactions } from "@/db/schema";
import { Empty, PageHeader, PLATFORM_LABEL } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { addInteraction, interactionStatus, replyAction } from "../actions";

const CATEGORY: Record<string, string> = {
  positive: "Positive feedback",
  question: "Question",
  general: "General comment",
  experience: "Personal experience",
  advice: "Request for advice",
  complaint: "Complaint",
  negative: "Negative feedback",
  sensitive: "Sensitive conversation",
  collaboration: "Potential collaboration",
  spam: "Spam",
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ show?: string; category?: string }> }) {
  const { show = "open", category } = await searchParams;
  const db = await getDb();
  let rows = await db
    .select()
    .from(interactions)
    .where(inArray(interactions.status, show === "open" ? ["new", "drafted"] : ["replied", "dismissed", "approved"]))
    .orderBy(desc(interactions.priority), desc(interactions.receivedAt))
    .limit(200);
  if (category) rows = rows.filter((r) => r.category === category);

  return (
    <div>
      <PageHeader eyebrow="Community engagement centre" title="The conversations that need you." emphasis="need you">
        <Link href="/inbox" className={`btn btn-sm ${show === "open" ? "btn-primary" : ""}`}>
          Open
        </Link>
        <Link href="/inbox?show=done" className={`btn btn-sm ${show !== "open" ? "btn-primary" : ""}`}>
          Done
        </Link>
      </PageHeader>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/inbox?show=${show}`} className={`pill ${!category ? "pill-red" : ""}`}>
          All
        </Link>
        {Object.entries(CATEGORY).map(([k, v]) => (
          <Link key={k} href={`/inbox?show=${show}&category=${k}`} className={`pill ${category === k ? "pill-red" : ""}`}>
            {v}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="Inbox clear.">
          <p>Comments, mentions and messages from connected accounts arrive here every 15 minutes, sorted by urgency.</p>
        </Empty>
      ) : (
        <div className="space-y-4">
          {rows.map((i) => (
            <article key={i.id} className={`card ${i.sensitive ? "outline-2 outline-deepred" : ""}`}>
              <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="label text-deepred">
                  {PLATFORM_LABEL[i.platform] ?? i.platform} · {i.kind} · {i.author}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <span className={i.sensitive ? "pill-red pill" : "pill"}>{CATEGORY[i.category] ?? i.category}</span>
                  {i.priority >= 2 && <span className="pill-ink pill">{i.priority === 3 ? "Urgent" : "Priority"}</span>}
                  {i.isSandbox && <span className="pill">Test</span>}
                  <span className="text-sm">{formatBrisbane(i.receivedAt)}</span>
                </div>
              </header>
              <p className="text-ink">{i.text}</p>

              {i.sensitive && (
                <div className="mt-3 rounded-[18px] bg-rosemist p-3 text-[15px]" role="note">
                  <strong className="text-ink">This needs your personal response.</strong> {i.sensitiveReason}. Nothing will be sent automatically.
                  {i.suggestPrivate && " Consider moving this to private messages and sharing appropriate support services (for example 1800RESPECT on 1800 737 732, or 000 in an emergency)."}
                </div>
              )}
              {!i.sensitive && i.needsPersonalResponse && <p className="mt-2 text-[15px]">This one deserves a personal reply from you.</p>}
              {i.suggestPrivate && !i.sensitive && <p className="mt-2 text-[15px]">Suggestion: continue this in private messages.</p>}

              {i.status === "replied" ? (
                <p className="mt-3 text-[15px]">
                  <strong className="text-ink">{i.autoReplied ? "Auto-replied" : "Replied"}:</strong> {i.replyText}
                </p>
              ) : (
                show === "open" && (
                  <div className="mt-3 space-y-2">
                    <form action={replyAction} className="space-y-2">
                      <input type="hidden" name="id" value={i.id} />
                      <label className="label block text-deepred" htmlFor={`r-${i.id}`}>
                        {i.suggestedReply ? "Suggested reply (edit before sending)" : "Your reply"}
                      </label>
                      <textarea id={`r-${i.id}`} name="text" defaultValue={i.suggestedReply ?? ""} className="textarea" rows={3} required />
                      <button className="btn btn-primary btn-sm">Approve and send reply</button>
                    </form>
                    <div className="flex flex-wrap gap-2">
                      <form action={interactionStatus}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value="replied" />
                        <button className="btn btn-sm">I replied in the app</button>
                      </form>
                      <form action={interactionStatus}>
                        <input type="hidden" name="id" value={i.id} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button className="btn btn-sm">Dismiss</button>
                      </form>
                    </div>
                  </div>
                )
              )}
            </article>
          ))}
        </div>
      )}

      <details className="mt-10">
        <summary className="cursor-pointer font-bold text-deepred">Add an interaction by hand (or a test one)</summary>
        <form action={addInteraction} className="card mt-3 grid gap-2 md:grid-cols-2">
          <select name="platform" className="select" aria-label="Platform">
            {Object.entries(PLATFORM_LABEL)
              .filter(([k]) => !["newsletter", "community", "sandbox"].includes(k))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
          <select name="kind" className="select" aria-label="Kind">
            <option value="comment">Comment</option>
            <option value="mention">Mention</option>
            <option value="dm">Direct message</option>
          </select>
          <input name="author" className="input" placeholder="Author handle" aria-label="Author" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="sandbox" value="1" defaultChecked className="accent-deepred" /> Test only
          </label>
          <textarea name="text" required className="textarea md:col-span-2" placeholder="What they said" aria-label="Text" />
          <button className="btn btn-sm md:col-span-2 md:justify-self-start">Add and triage</button>
        </form>
      </details>
    </div>
  );
}
