import Link from "next/link";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, designs, posts } from "@/db/schema";

const SHOWN = ["published", "scheduled", "approved_for_publishing", "awaiting_design", "awaiting_content", "saved"] as const;
const LABEL: Record<string, string> = {
  published: "Live",
  scheduled: "Scheduled",
  approved_for_publishing: "Approved",
  awaiting_design: "In approval",
  awaiting_content: "In approval",
  saved: "Draft",
};

/**
 * Instagram grid preview (as Planoly and Later do): how the next posts will sit on the profile,
 * newest first, using each post's approved design (or its latest design while in approval).
 */
export async function InstagramGrid({ db }: { db: Db }) {
  const rows = await db
    .select()
    .from(posts)
    .where(and(eq(posts.platform, "instagram"), inArray(posts.status, [...SHOWN])))
    .orderBy(desc(posts.updatedAt))
    .limit(60);
  const sortKey = (p: (typeof rows)[number]) => (p.publishedAt ?? p.scheduledAt ?? p.updatedAt).getTime();
  const list = rows.sort((a, b) => sortKey(b) - sortKey(a)).slice(0, 24);
  const ids = list.map((p) => p.id);
  const ds = ids.length
    ? await db
        .select({ id: designs.id, postId: designs.postId, format: designs.format, status: designs.status })
        .from(designs)
        .where(and(inArray(designs.postId, ids), notInArray(designs.status, ["superseded", "denied"])))
        .orderBy(desc(designs.createdAt))
    : [];
  const designFor = (p: (typeof list)[number]) => (p.approvedDesignId ? p.approvedDesignId : ds.find((d) => d.postId === p.id)?.id);
  const account = await db.query.accounts.findFirst({ where: and(eq(accounts.platform, "instagram"), eq(accounts.status, "connected")) });
  const live = list.filter((p) => p.status === "published").length;
  const upcoming = list.length - live;

  return (
    <section aria-labelledby="grid-title" className="mx-auto max-w-[560px]">
      {/* Profile header, Instagram-style */}
      <div className="mb-5 flex items-center gap-5">
        <span aria-hidden className="flex h-20 w-20 shrink-0 items-end justify-center rounded-full bg-blush ring-2 ring-signal ring-offset-2">
          <span className="mb-3 flex h-12 w-10 items-end justify-center rounded-t-full bg-signal pb-1 font-serif text-xl text-white">S</span>
        </span>
        <div className="min-w-0">
          <h2 id="grid-title" className="font-sans text-[17px] font-bold leading-tight text-ink">
            {account ? account.handle : "Your Instagram"}
          </h2>
          <p className="mt-1 text-[13.5px]">
            <strong className="text-ink">{upcoming}</strong> upcoming · <strong className="text-ink">{live}</strong> live
          </p>
          <p className="mt-1 text-[12.5px]">Preview only. Newest first, as your profile will show it.</p>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-[18px] bg-shell p-8 text-center ring-1 ring-inset ring-[rgb(200_0_20/0.08)]">
          <p className="font-serif text-2xl font-medium text-deepred">Nothing on the grid yet.</p>
          <p className="mt-2 text-[14.5px]">
            <Link href="/create">Create an Instagram post</Link> and it appears here as you plan.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-[10px] bg-white ring-1 ring-rosemist">
          {list.map((p) => {
            const d = designFor(p);
            const pending = p.status !== "published";
            return (
              <li key={p.id} className="relative">
                <Link href={d ? `/create/${d}` : "/content"} className="group block aspect-[4/5] overflow-hidden bg-blush" title={p.hook}>
                  {d ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/designs/${d}/image`} alt={p.altText ?? p.hook} className={`h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${pending && p.status !== "scheduled" && p.status !== "approved_for_publishing" ? "opacity-70" : ""}`} loading="lazy" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-3 text-center font-serif text-[15px] leading-tight text-deepred">{p.hook}</span>
                  )}
                  <span className={`absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${p.status === "published" ? "bg-ink text-white" : "bg-white/95 text-ink"}`}>
                    {LABEL[p.status] ?? p.status}
                    {p.status === "scheduled" && p.scheduledAt ? ` · ${p.scheduledAt.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short" })}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-center text-[12.5px]">Tip: alternate a bright poster with a softer tint so the grid reads as one feed.</p>
    </section>
  );
}
