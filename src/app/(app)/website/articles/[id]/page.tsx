import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { DemoBadge, PageHeader } from "@/components/ui";
import { ARTICLE_STATUSES } from "@/lib/constants";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { formatBrisbane } from "@/lib/scheduling";
import { articleHash, ensureArticleWebFields, readingMinutes } from "@/lib/website";
import { hasBlockingIssues } from "@/lib/brand/check";
import { aiEnabled } from "@/lib/ai/client";
import { BrandIssues, WebsiteTabs } from "../../tabs";
import { articleDecisionAction, draftArticleAction, saveArticleAction } from "../../actions";

export default async function ArticleEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const me = await requireUser();
  await ensureArticleWebFields(db, id);
  const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
  if (!a) notFound();
  const approver = a.approvedBy ? await db.query.users.findFirst({ where: eq(users.id, a.approvedBy), columns: { name: true } }) : null;
  const blocking = hasBlockingIssues(a.brandIssues);
  const approvedAndUnchanged = Boolean(a.approvedHash && a.approvedHash === articleHash(a));
  const owner = me.role === "owner";
  const words = a.body.split(/\s+/).filter(Boolean).length;

  return (
    <div>
      <PageHeader eyebrow="Article for the website" title={a.title}>
        {a.isDemo && <DemoBadge />}
        <span className={a.status === "published" ? "pill-ok pill" : "pill"}>{ARTICLE_STATUSES[a.status] ?? a.status}</span>
      </PageHeader>
      <WebsiteTabs current="/website" />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <form action={saveArticleAction} className="card space-y-4">
          <input type="hidden" name="id" value={a.id} />
          <label className="block">
            <span className="label mb-1 block text-deepred">Title</span>
            <input name="title" defaultValue={a.title} required className="input" />
          </label>
          <label className="block">
            <span className="label mb-1 block text-deepred">Summary for the website card (one or two sentences)</span>
            <textarea name="excerpt" defaultValue={a.excerpt ?? ""} className="textarea min-h-[80px]" maxLength={400} />
          </label>
          <label className="block">
            <span className="label mb-1 block text-deepred">
              Article · {words} words · {readingMinutes(a.body)} min read
            </span>
            <textarea name="body" defaultValue={a.body} className="textarea min-h-[560px] font-[inherit]" placeholder="Start with the oddly specific detail. Confess first." />
            <span className="mt-1 block text-sm">
              Blank line between paragraphs. <code>## </code> for a heading, <code>- </code> for a list, <code>&gt; </code> for a pull quote, <code>[words](https://link)</code> for a link, <code>**bold**</code>, <code>*italic*</code>.
            </span>
          </label>

          <details className="card-tint" open={!a.slug || !a.metaDescription}>
            <summary className="cursor-pointer font-semibold text-deepred">Web address, topic and SEO</summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block text-[15px]">
                Web address
                <span className="flex items-center gap-1">
                  <span className="text-sm">/articles/</span>
                  <input name="slug" defaultValue={a.slug ?? ""} className="input" pattern="[a-z0-9\-]*" title="Lowercase letters, numbers and hyphens" />
                </span>
              </label>
              <label className="block text-[15px]">
                Topic
                <select name="category" defaultValue={a.category ?? ""} className="select">
                  <option value="">No topic</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[15px] md:col-span-2">
                SEO title (60 characters or fewer)
                <input name="seoTitle" defaultValue={a.seoTitle ?? ""} className="input" maxLength={120} />
              </label>
              <label className="block text-[15px] md:col-span-2">
                Meta description (155 characters or fewer)
                <textarea name="metaDescription" defaultValue={a.metaDescription ?? ""} className="textarea min-h-[70px]" maxLength={300} />
              </label>
              <label className="block text-[15px] md:col-span-2">
                Sources, one per line: Title | https://link | Organisation
                <textarea name="sources" defaultValue={a.sources.map((x) => [x.title, x.url, x.organisation].filter(Boolean).join(" | ")).join("\n")} className="textarea min-h-[90px] text-sm" />
              </label>
            </div>
          </details>

          <div className="flex flex-wrap items-end gap-3">
            {!["approved", "published"].includes(a.status) && (
              <label className="text-[15px]">
                Stage
                <select name="status" defaultValue={a.status} className="select">
                  {["idea", "brief_approved", "drafting", "editing", "ready"].map((k) => (
                    <option key={k} value={k}>
                      {ARTICLE_STATUSES[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="btn btn-primary">Save article</button>
            {a.slug && (
              <a href={`/site/articles/${a.slug}?preview=1`} target="_blank" rel="noopener" className="btn">
                Preview on the website ↗
              </a>
            )}
          </div>
        </form>

        <aside className="space-y-5">
          <section className="card space-y-3" aria-label="Approval">
            <p className="label text-deepred">Approval and publishing</p>
            {a.status === "published" ? (
              <p className="text-[15px]">
                Live since {formatBrisbane(a.publishedAt)}.{" "}
                <a href={`/site/articles/${a.slug}`} target="_blank" rel="noopener">
                  View it ↗
                </a>
              </p>
            ) : approvedAndUnchanged ? (
              <p className="text-[15px]">Approved, not yet live.</p>
            ) : (
              <p className="text-[15px]">Needs the owner&apos;s approval before it can go on the website. Any substantive edit after approval needs approving again.</p>
            )}
            {a.approvedAt && (
              <p className="text-sm">
                Approved by {approver?.name ?? "the owner"}, {formatBrisbane(a.approvedAt)}
              </p>
            )}
            {a.isDemo && <p className="text-sm font-bold text-deepred">Built on sample research from demo mode, so it can&apos;t be published. You can still preview it.</p>}

            {owner ? (
              <form action={articleDecisionAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={a.id} />
                {a.status === "published" ? (
                  <button name="decision" value="unpublish" className="btn btn-sm">
                    Take off the website
                  </button>
                ) : approvedAndUnchanged ? (
                  <button name="decision" value="publish" className="btn btn-primary btn-sm" disabled={a.isDemo}>
                    Publish now
                  </button>
                ) : (
                  <>
                    <button name="decision" value="approve" className="btn btn-sm" disabled={!a.body.trim()}>
                      Approve
                    </button>
                    {!a.isDemo && (
                      <button name="decision" value="approve_publish" className="btn btn-primary btn-sm" disabled={!a.body.trim()}>
                        Approve and publish
                      </button>
                    )}
                    {blocking && (
                      <label className="flex w-full items-center gap-2 text-sm">
                        <input type="checkbox" name="override" value="1" className="accent-deepred" /> Approve despite the brand issues (recorded in the audit log)
                      </label>
                    )}
                  </>
                )}
              </form>
            ) : (
              <p className="text-sm">Only the owner can approve and publish. Set the stage to &ldquo;Ready for approval&rdquo; when it&apos;s done.</p>
            )}
          </section>

          <section className="card space-y-2" aria-label="Brand check">
            <p className="label text-deepred">Brand check</p>
            <BrandIssues issues={a.brandIssues} />
            <p className="text-sm">Runs every time you save.</p>
          </section>

          {a.briefId && (
            <section className="card-tint space-y-3 text-[15px]">
              <p className="label text-deepred">From research</p>
              <Link href={`/editorial/${a.briefId}`}>Open the editorial brief</Link>
              {!a.body.trim() && (
                <form action={draftArticleAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-sm">{aiEnabled() && !a.isDemo ? "Write a first draft from the brief" : "Add a section scaffold from the brief"}</button>
                </form>
              )}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
