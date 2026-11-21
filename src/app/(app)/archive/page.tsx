import Link from "next/link";
import { desc, eq, ilike, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, campaigns, designs, interactions, postMetrics, posts, stories } from "@/db/schema";
import { Empty, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { formatBrisbane } from "@/lib/scheduling";
import { duplicatePostAction } from "../actions";
import { daysSince } from "@/lib/time";

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ q?: string; platform?: string; category?: string; campaign?: string; status?: string; from?: string; to?: string; sort?: string; open?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const statuses = sp.status ? [sp.status] : ["published", "archived"];
  let rows = await db
    .select()
    .from(posts)
    .where(sp.q ? or(ilike(posts.hook, `%${sp.q}%`), ilike(posts.caption, `%${sp.q}%`)) : inArray(posts.status, statuses))
    .orderBy(desc(posts.publishedAt))
    .limit(300);
  if (sp.q) rows = rows.filter((r) => statuses.includes(r.status));
  if (sp.platform) rows = rows.filter((r) => r.platform === sp.platform);
  if (sp.category) rows = rows.filter((r) => r.category === sp.category);
  if (sp.campaign) rows = rows.filter((r) => r.campaignId === sp.campaign);
  if (sp.from) rows = rows.filter((r) => r.publishedAt && r.publishedAt >= new Date(sp.from!));
  if (sp.to) rows = rows.filter((r) => r.publishedAt && r.publishedAt <= new Date(`${sp.to}T23:59:59+10:00`));

  const metrics = rows.length ? await db.select().from(postMetrics).where(inArray(postMetrics.postId, rows.map((r) => r.id))).orderBy(desc(postMetrics.capturedAt)) : [];
  const latest = new Map<string, (typeof metrics)[number]>();
  for (const m of metrics) if (!latest.has(m.postId)) latest.set(m.postId, m);
  const er = (id: string) => {
    const m = latest.get(id);
    return m ? (m.likes + m.comments + m.shares + m.saves) / Math.max(1, m.reach || m.impressions) : -1;
  };
  if (sp.sort === "performance") rows.sort((a, b) => er(b.id) - er(a.id));
  const camps = await db.select().from(campaigns);

  // Detail view: everything retained for one post.
  const open = sp.open ? rows.find((r) => r.id === sp.open) ?? (await db.query.posts.findFirst({ where: eq(posts.id, sp.open) })) : null;
  const detail = open
    ? {
        story: open.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, open.storyId) }) : null,
        designs: await db.select().from(designs).where(eq(designs.postId, open.id)),
        audit: await db.select().from(auditLog).where(eq(auditLog.subjectId, open.id)).orderBy(auditLog.createdAt),
        interactions: await db.select().from(interactions).where(eq(interactions.postId, open.id)),
      }
    : null;
  const ageDays = daysSince;

  return (
    <div>
      <PageHeader eyebrow="Content archive and knowledge library" title="Everything we've said out loud." emphasis="out loud" />
      <form className="card mb-6 grid gap-2 md:grid-cols-4" aria-label="Filter archive">
        <input name="q" defaultValue={sp.q} className="input md:col-span-2" placeholder="Search captions and headlines" aria-label="Search" />
        <select name="platform" defaultValue={sp.platform ?? ""} className="select" aria-label="Platform">
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="select" aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="select" aria-label="Campaign">
          <option value="">All campaigns</option>
          {camps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status ?? ""} className="select" aria-label="Status">
          <option value="">Published and archived</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from} className="input" aria-label="From date" />
        <input type="date" name="to" defaultValue={sp.to} className="input" aria-label="To date" />
        <select name="sort" defaultValue={sp.sort ?? ""} className="select" aria-label="Sort">
          <option value="">Newest first</option>
          <option value="performance">Best performing first</option>
        </select>
        <button className="btn btn-sm md:col-start-4">Filter</button>
      </form>

      {open && detail && (
        <section className="card mb-8 space-y-3" aria-label="Post record">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl">{open.hook}</h2>
            <Link href="/archive" className="btn btn-sm">
              Close
            </Link>
          </div>
          {ageDays(open.publishedAt) > 180 && (
            <p className="rounded-[18px] bg-rosemist p-3 text-[15px]">
              Published {ageDays(open.publishedAt)} days ago. Before repurposing, check the facts and figures are still accurate and the sources still stand. Duplicating sends it back through approval.
            </p>
          )}
          <p className="whitespace-pre-line text-[15px]">{open.caption}</p>
          <p className="text-[15px]">
            {open.liveUrl && (
              <a href={open.liveUrl} target="_blank" rel="noreferrer">
                Live post
              </a>
            )}{" "}
            · Published {formatBrisbane(open.publishedAt)}
          </p>
          {detail.story && (
            <p className="text-[15px]">
              Research:{" "}
              <a href={detail.story.sourceUrl} target="_blank" rel="noreferrer">
                {detail.story.headline}
              </a>{" "}
              {open.briefId && (
                <>
                  · <Link href={`/editorial/${open.briefId}`}>Editorial brief</Link>
                </>
              )}
            </p>
          )}
          {latest.get(open.id) && (
            <p className="text-[15px]">
              Performance: reach {latest.get(open.id)!.reach}, likes {latest.get(open.id)!.likes}, comments {latest.get(open.id)!.comments}, shares {latest.get(open.id)!.shares}, saves {latest.get(open.id)!.saves}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {detail.designs
              .filter((d) => d.status === "approved")
              .map((d) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={d.id} src={`/api/designs/${d.id}/image`} alt={open.altText ?? ""} className="h-40 rounded-[14px]" />
              ))}
          </div>
          <details>
            <summary className="cursor-pointer font-bold text-deepred">Approval history and design feedback</summary>
            <ul className="mt-2 list-inside list-disc text-[15px]">
              {detail.audit.map((a) => (
                <li key={a.id}>
                  {formatBrisbane(a.createdAt)}: {a.action.replace(/\./g, " ").replace(/_/g, " ")} by {a.actor}
                  {a.detail ? ` (${a.detail})` : ""}
                </li>
              ))}
              {detail.designs
                .filter((d) => d.feedback)
                .map((d) => (
                  <li key={d.id}>Design feedback: {d.feedback}</li>
                ))}
            </ul>
          </details>
          {detail.interactions.length > 0 && <p className="text-[15px]">{detail.interactions.length} audience interactions recorded.</p>}
          <form action={duplicatePostAction}>
            <input type="hidden" name="id" value={open.id} />
            <button className="btn btn-sm">Repurpose (duplicate for approval)</button>
          </form>
        </section>
      )}

      {rows.length === 0 ? (
        <Empty title="Nothing in the archive yet.">
          <p>Every published post lands here automatically with its research, brief, designs, approvals and performance.</p>
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`/archive?open=${p.id}`} className="card block h-full no-underline hover:bg-white">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="label text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                  <StatusPill status={p.status} />
                </div>
                <p className="font-bold text-ink">{p.hook}</p>
                <p className="mt-1 text-sm">
                  {formatBrisbane(p.publishedAt)} · {CATEGORY_LABELS[p.category] ?? p.category}
                  {er(p.id) >= 0 && ` · ${(er(p.id) * 100).toFixed(1)}% engagement`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
