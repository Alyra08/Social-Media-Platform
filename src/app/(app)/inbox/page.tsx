import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { interactions } from "@/db/schema";
import { Empty, PageHeader, PLATFORM_LABEL } from "@/components/ui";
import { addInteraction, interactionStatus, replyAction } from "../actions";

/**
 * Community inbox, laid out like a messaging app: conversations on the left (one per person per platform,
 * newest first, red count of unanswered messages), the thread and reply box on the right.
 * Messages are pulled from connected accounts every 15 minutes; replies go back through the platform's API
 * where it allows it (otherwise the reply is saved and the owner posts it in the app).
 */

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

const KIND: Record<string, string> = { comment: "Comment", mention: "Mention", dm: "Message" };

const PLATFORM_SHORT: Record<string, string> = { instagram: "IG", facebook: "f", tiktok: "TT", linkedin: "in", pinterest: "P", threads: "@", x: "X", bluesky: "B", youtube: "YT" };

/** Soft avatar tints from the confetti palette (text is always Deep Ink or Berry, so contrast holds). */
const TINTS = ["bg-blush text-deepred", "bg-peach text-ink", "bg-rosemist text-deepred", "bg-candy text-deepred", "bg-peachcream text-ink"];

type Row = typeof interactions.$inferSelect;
type Conversation = { key: string; platform: string; author: string; items: Row[]; last: Row; open: number; sensitive: boolean; priority: number };

const OPEN = ["new", "drafted"];

function initials(name: string) {
  const clean = name.replace(/^@/, "").replace(/[._-]+/g, " ").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function tintFor(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

const TZ = "Australia/Brisbane";
function when(d: Date) {
  const now = new Date();
  const day = (x: Date) => x.toLocaleDateString("en-AU", { timeZone: TZ });
  if (day(d) === day(now)) return d.toLocaleTimeString("en-AU", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
  if (now.getTime() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString("en-AU", { timeZone: TZ, weekday: "short" });
  return d.toLocaleDateString("en-AU", { timeZone: TZ, day: "numeric", month: "short" });
}

function Avatar({ c, size = "md" }: { c: Pick<Conversation, "key" | "author" | "platform">; size?: "md" | "lg" }) {
  const dim = size === "lg" ? "h-12 w-12 text-[15px]" : "h-11 w-11 text-[14px]";
  return (
    <span className="relative shrink-0" aria-hidden>
      <span className={`flex items-center justify-center rounded-full font-bold ${dim} ${tintFor(c.key)}`}>{initials(c.author)}</span>
      <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink px-1 text-[9px] font-bold text-white ring-2 ring-white">
        {PLATFORM_SHORT[c.platform] ?? c.platform[0]?.toUpperCase()}
      </span>
    </span>
  );
}

function href(params: { show?: string; category?: string; c?: string }) {
  const q = new URLSearchParams();
  if (params.show && params.show !== "open") q.set("show", params.show);
  if (params.category) q.set("category", params.category);
  if (params.c) q.set("c", params.c);
  const s = q.toString();
  return s ? `/inbox?${s}` : "/inbox";
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ show?: string; category?: string; c?: string }> }) {
  const { show = "open", category, c: selectedKey } = await searchParams;
  const db = await getDb();
  const rows = await db.select().from(interactions).orderBy(desc(interactions.receivedAt)).limit(500);

  // Group into conversations: one per person per platform.
  const map = new Map<string, Conversation>();
  for (const r of rows) {
    const key = `${r.platform}:${r.author}`;
    const conv = map.get(key) ?? { key, platform: r.platform, author: r.author, items: [], last: r, open: 0, sensitive: false, priority: 0 };
    conv.items.push(r);
    if (OPEN.includes(r.status)) {
      conv.open++;
      conv.priority = Math.max(conv.priority, r.priority);
      if (r.sensitive) conv.sensitive = true;
    }
    map.set(key, conv);
  }
  let conversations = [...map.values()];
  if (show === "open") conversations = conversations.filter((c) => c.open > 0);
  if (category) conversations = conversations.filter((c) => c.items.some((i) => i.category === category));
  // Unanswered and urgent first, then newest.
  conversations.sort((a, b) => Number(b.open > 0) - Number(a.open > 0) || b.priority - a.priority || b.last.receivedAt.getTime() - a.last.receivedAt.getTime());

  const selected = selectedKey ? map.get(selectedKey) : undefined;
  const thread = selected ? [...selected.items].reverse() : [];
  const target = selected ? [...selected.items].find((i) => OPEN.includes(i.status)) : undefined; // newest open message
  const totalOpen = [...map.values()].reduce((n, c) => n + c.open, 0);

  return (
    <div>
      <PageHeader eyebrow="Community inbox" title="The conversations that need you." emphasis="need you">
        <nav aria-label="Show" className="segmented">
          <Link href={href({ category })} className="seg" aria-current={show === "open" ? "page" : undefined}>
            Unanswered{totalOpen ? ` (${totalOpen})` : ""}
          </Link>
          <Link href={href({ show: "all", category })} className="seg" aria-current={show !== "open" ? "page" : undefined}>
            All
          </Link>
        </nav>
      </PageHeader>

      <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1">
        <Link href={href({ show })} className={`pill shrink-0 ${!category ? "pill-red" : ""}`}>
          All types
        </Link>
        {Object.entries(CATEGORY).map(([k, v]) => (
          <Link key={k} href={href({ show, category: k })} className={`pill shrink-0 ${category === k ? "pill-red" : ""}`}>
            {v}
          </Link>
        ))}
      </div>

      {map.size === 0 ? (
        <Empty title="Inbox clear.">
          <p>Comments, mentions and messages from your connected accounts arrive here every 15 minutes, sorted by urgency.</p>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* Conversation list */}
          <section aria-label="Conversations" className={`overflow-hidden rounded-[28px] bg-linear-to-b from-blush via-candy to-peachcream p-3 ${selected ? "hidden lg:block" : ""}`}>
            {conversations.length === 0 ? (
              <p className="p-6 text-center text-[15px] text-charcoal">Nothing unanswered here. You&rsquo;re all caught up.</p>
            ) : (
              <ul className="space-y-2.5">
                {conversations.map((c) => {
                  const active = c.key === selected?.key;
                  return (
                    <li key={c.key}>
                      <Link
                        href={href({ show, category, c: c.key })}
                        aria-current={active ? "true" : undefined}
                        className={`flex items-center gap-3 rounded-[20px] bg-white px-3.5 py-3.5 no-underline shadow-[0_6px_18px_-14px_rgb(42_26_29/0.4)] transition-all hover:-translate-y-px ${active ? "ring-2 ring-signal" : "ring-1 ring-[rgb(42_26_29/0.06)]"}`}
                      >
                        <Avatar c={c} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold text-ink">{c.author}</span>
                            <span className="shrink-0 text-[12px] text-charcoal">{when(c.last.receivedAt)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className={`truncate text-[13.5px] ${c.open ? "text-ink" : "text-charcoal"}`}>
                              {c.last.status === "replied" && c.last.replyText ? `You: ${c.last.replyText}` : c.last.text}
                            </span>
                            {c.open > 0 ? (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-signal px-1.5 text-[11px] font-bold text-white" aria-label={`${c.open} unanswered`}>
                                {c.open}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-charcoal">
                            <span className={`h-1.5 w-1.5 rounded-full ${c.sensitive ? "bg-deepred" : c.open ? "bg-signal" : "bg-teal"}`} aria-hidden />
                            {c.sensitive ? "Needs you personally" : c.open ? `${PLATFORM_LABEL[c.platform] ?? c.platform} · ${KIND[c.last.kind] ?? c.last.kind}` : "Answered"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Thread */}
          <section aria-label="Conversation" className={`flex min-h-[28rem] flex-col rounded-[28px] bg-white ring-1 ring-inset ring-[rgb(42_26_29/0.1)] ${selected ? "" : "hidden lg:flex"}`}>
            {!selected ? (
              <div className="m-auto max-w-xs p-8 text-center">
                <p className="font-serif text-[1.6rem] italic text-deepred">Pick a conversation.</p>
                <p className="mt-2 text-[14.5px] text-charcoal">Read the thread, edit Ava&rsquo;s suggested reply and send it straight back to the platform.</p>
              </div>
            ) : (
              <>
                <header className="flex items-center gap-3 border-b border-[rgb(42_26_29/0.08)] px-4 py-3.5 sm:px-5">
                  <Link href={href({ show, category })} className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-shell lg:hidden" aria-label="Back to conversations">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M15 5l-7 7 7 7" />
                    </svg>
                  </Link>
                  <Avatar c={selected} size="lg" />
                  <div className="min-w-0">
                    <h2 className="truncate font-sans text-[17px] font-semibold text-ink">{selected.author}</h2>
                    <p className="text-[13px] text-charcoal">
                      {PLATFORM_LABEL[selected.platform] ?? selected.platform} · {selected.items.length} message{selected.items.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </header>

                <ol className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-5">
                  {thread.map((i) => (
                    <li key={i.id} className="space-y-2">
                      <div className="max-w-[85%]">
                        <div className={`rounded-[20px] rounded-bl-md px-4 py-2.5 text-[15px] text-ink ${i.sensitive ? "bg-rosemist" : "bg-shell"}`}>{i.text}</div>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 pl-1 text-[12px] text-charcoal">
                          {KIND[i.kind] ?? i.kind} · {when(i.receivedAt)}
                          <span className="pill text-[0.66rem]">{CATEGORY[i.category] ?? i.category}</span>
                          {i.priority >= 2 && OPEN.includes(i.status) && <span className="pill-ink pill text-[0.66rem]">{i.priority === 3 ? "Urgent" : "Priority"}</span>}
                          {i.isSandbox && <span className="pill text-[0.66rem]">Test</span>}
                          {i.status === "dismissed" && <span className="text-[12px]">Dismissed</span>}
                        </p>
                      </div>
                      {i.status === "replied" && i.replyText && (
                        <div className="ml-auto max-w-[85%] text-right">
                          <div className="inline-block rounded-[20px] rounded-br-md bg-signal px-4 py-2.5 text-left text-[15px] text-white">{i.replyText}</div>
                          <p className="mt-1 pr-1 text-[12px] text-charcoal">
                            {i.autoReplied ? "Auto-replied" : "You"}
                            {i.repliedAt ? ` · ${when(i.repliedAt)}` : ""}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>

                {target ? (
                  <div className="border-t border-[rgb(42_26_29/0.08)] p-3 sm:p-4">
                    {target.sensitive && (
                      <div className="mb-3 rounded-[18px] bg-rosemist p-3 text-[14px] text-ink" role="note">
                        <strong>This needs your personal response.</strong> {target.sensitiveReason}. Nothing is sent automatically.
                        {target.suggestPrivate && " Consider moving to private messages and sharing support services (1800RESPECT on 1800 737 732, or 000 in an emergency)."}
                      </div>
                    )}
                    {!target.sensitive && target.suggestPrivate && <p className="mb-2 text-[13.5px] text-charcoal">Suggestion: continue this one in private messages.</p>}
                    <form action={replyAction}>
                      <input type="hidden" name="id" value={target.id} />
                      <label htmlFor="reply" className="sr-only">
                        Reply to {selected.author}
                      </label>
                      <div className="flex items-end gap-2 rounded-[24px] border border-[rgb(42_26_29/0.14)] bg-white p-2 pl-4 focus-within:border-ink">
                        <textarea
                          key={target.id}
                          id="reply"
                          name="text"
                          rows={2}
                          required
                          defaultValue={target.suggestedReply ?? ""}
                          placeholder={`Reply on ${PLATFORM_LABEL[target.platform] ?? target.platform}…`}
                          className="max-h-40 min-h-[44px] flex-1 resize-y bg-transparent py-2 text-[15px] leading-normal text-ink outline-none placeholder:text-charcoal/80"
                        />
                        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-white transition-colors hover:bg-deepred" aria-label="Send reply">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
                          </svg>
                        </button>
                      </div>
                      {target.suggestedReply && <p className="mt-1.5 pl-4 text-[12.5px] text-charcoal">Ava drafted this reply. Edit it before sending.</p>}
                    </form>
                    <div className="mt-2 flex flex-wrap gap-2 pl-2">
                      <form action={interactionStatus}>
                        <input type="hidden" name="id" value={target.id} />
                        <input type="hidden" name="status" value="replied" />
                        <button className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-shell">I replied in the app</button>
                      </form>
                      <form action={interactionStatus}>
                        <input type="hidden" name="id" value={target.id} />
                        <input type="hidden" name="status" value="dismissed" />
                        <button className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-shell">Dismiss</button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <p className="border-t border-[rgb(42_26_29/0.08)] p-4 text-center text-[14px] text-charcoal">All answered. New messages from {selected.author} will appear here.</p>
                )}
              </>
            )}
          </section>
        </div>
      )}

      <details className="mt-10">
        <summary className="cursor-pointer font-semibold text-deepred">Add a message by hand (or a test one)</summary>
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
