import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { designs, posts } from "@/db/schema";
import { DemoBadge, Empty, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";
import { DESIGN_FORMATS } from "@/lib/design/render";
import { designDecision, editDesign, uploadDesign } from "../actions";
import { importFromCanvaAction, openInCanvaAction } from "../keys-actions";
import { canvaStatus } from "@/lib/canva";

export default async function DesignPage({ searchParams }: { searchParams: Promise<{ post?: string; show?: string }> }) {
  const { post: onlyPost, show } = await searchParams;
  const db = await getDb();
  const waiting = await db
    .select()
    .from(posts)
    .where(onlyPost ? eq(posts.id, onlyPost) : inArray(posts.status, show === "approved" ? ["approved_for_publishing", "scheduled"] : ["awaiting_design"]))
    .orderBy(desc(posts.updatedAt))
    .limit(40);
  const ds = waiting.length
    ? await db
        .select()
        .from(designs)
        .where(and(inArray(designs.postId, waiting.map((w) => w.id)), inArray(designs.status, ["proposed", "approved", "changes_requested"])))
        .orderBy(designs.format, designs.variant, desc(designs.createdAt))
    : [];
  const templates = await db.select().from(designs).where(eq(designs.isTemplate, true)).orderBy(desc(designs.createdAt)).limit(12);
  const canva = await canvaStatus(db);
  const inCanva = waiting.length
    ? await db
        .select()
        .from(designs)
        .where(and(inArray(designs.postId, waiting.map((w) => w.id)), eq(designs.status, "in_canva")))
        .orderBy(desc(designs.createdAt))
    : [];

  return (
    <div>
      <PageHeader eyebrow="Post design approval centre" title="Make it look like us." emphasis="like us">
        <Link href="/design" className={`btn btn-sm ${show !== "approved" ? "btn-primary" : ""}`}>
          Awaiting approval
        </Link>
        <Link href="/design?show=approved" className={`btn btn-sm ${show === "approved" ? "btn-primary" : ""}`}>
          Approved
        </Link>
      </PageHeader>

      {waiting.length === 0 ? (
        <Empty title="No designs waiting.">
          <p>When you approve a post&apos;s content, design options appear here.</p>
        </Empty>
      ) : (
        waiting.map((p) => {
          const mine = ds.filter((d) => d.postId === p.id);
          const mineInCanva = inCanva.filter((d) => d.postId === p.id);
          return (
            <section key={p.id} className="mb-12" aria-labelledby={`h-${p.id}`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="label text-deepred">
                    {PLATFORM_LABEL[p.platform]} · {p.format} · {p.treatment} {p.isDemo && <DemoBadge />}
                  </p>
                  <h2 id={`h-${p.id}`} className="text-2xl">
                    {p.hook}
                  </h2>
                  {p.designConcept && <p className="mt-1 text-[15px]">Concept: {p.designConcept}</p>}
                </div>
                <StatusPill status={p.status} />
              </div>

              {mineInCanva.length > 0 && p.status === "awaiting_design" && (
                <ul className="mb-4 space-y-2">
                  {mineInCanva.map((d) => (
                    <li key={d.id} className="card-tint flex flex-wrap items-center justify-between gap-3">
                      <span className="text-[15px]">
                        <strong className="text-ink">Being edited in Canva</strong> · {DESIGN_FORMATS[d.format]?.label ?? d.format}. When it&apos;s ready, bring it back here for approval.
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {d.canvaEditUrl && (
                          <a href={d.canvaEditUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                            Open in Canva ↗
                          </a>
                        )}
                        <form action={importFromCanvaAction}>
                          <input type="hidden" name="designId" value={d.id} />
                          <button className="btn btn-primary btn-sm">Bring it back for approval</button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
                {mine.map((d) => (
                  <article key={d.id} className="card flex flex-col">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="label text-deepred">
                        {DESIGN_FORMATS[d.format]?.label ?? d.format} · {d.width}×{d.height}
                      </span>
                      <StatusPill status={d.status} />
                    </div>
                    <div className="overflow-hidden rounded-[14px] bg-white" style={{ aspectRatio: `${d.width} / ${d.height}` }}>
                      {d.svg ? (
                        <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label={p.altText ?? p.hook} dangerouslySetInnerHTML={{ __html: d.svg }} />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/designs/${d.id}/image`} alt={p.altText ?? p.hook} className="h-full w-full object-cover" />
                      )}
                    </div>
                    {d.feedback && <p className="mt-2 text-sm">Feedback: “{d.feedback}”</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 text-sm">
                      <a href={`/api/designs/${d.id}/image?download=1`}>Download PNG</a>
                      {canva.connected && d.status !== "approved" && p.status === "awaiting_design" && (
                        <form action={openInCanvaAction} className="inline">
                          <input type="hidden" name="postId" value={p.id} />
                          <input type="hidden" name="designId" value={d.id} />
                          {d.source === "canva" && d.canvaEditUrl && <input type="hidden" name="reopen" value="1" />}
                          <button className="font-bold text-deepred underline">{d.source === "canva" ? "Back to Canva for changes" : "Edit a copy in Canva"}</button>
                        </form>
                      )}
                    </div>

                    {d.status !== "approved" && p.status === "awaiting_design" && (
                      <>
                        <form action={designDecision} className="mt-3 space-y-2">
                          <input type="hidden" name="id" value={d.id} />
                          <input name="feedback" className="input" placeholder="e.g. make the headline larger, more pink" aria-label="Design feedback" />
                          <div className="flex flex-wrap gap-2">
                            <button name="decision" value="approve" className="btn btn-primary btn-sm">
                              Approve
                            </button>
                            <button name="decision" value="feedback" className="btn btn-sm">
                              Revise with feedback
                            </button>
                            <button name="decision" value="changes" className="btn btn-sm">
                              Request changes
                            </button>
                            <button name="decision" value="regenerate" className="btn btn-sm">
                              Regenerate
                            </button>
                            <button name="decision" value="deny" className="btn btn-sm">
                              Deny
                            </button>
                          </div>
                        </form>
                        {d.params && (
                          <details className="mt-3">
                            <summary className="cursor-pointer font-bold text-deepred">Edit design</summary>
                            <form action={editDesign} className="mt-2 grid gap-2 text-sm">
                              <input type="hidden" name="id" value={d.id} />
                              <label>
                                Headline
                                <input name="headline" defaultValue={d.params.headline} className="input" />
                              </label>
                              <label>
                                Italic words (2–3)
                                <input name="emphasis" defaultValue={d.params.emphasis} className="input" />
                              </label>
                              <label>
                                Poster line (Anton, optional)
                                <input name="poster" defaultValue={d.params.poster ?? ""} className="input" />
                              </label>
                              <label>
                                Script word (one, optional)
                                <input name="script" defaultValue={d.params.script ?? ""} className="input" />
                              </label>
                              <div className="grid grid-cols-3 gap-2">
                                <label>
                                  Layout
                                  <select name="layout" defaultValue={d.params.layout} className="select">
                                    {["editorial", "poster", "arch", "quote", "stripe"].map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Lead colour
                                  <select name="lead" defaultValue={d.params.lead} className="select">
                                    <option value="signal">Signal Red</option>
                                    <option value="hot">Hot Pink</option>
                                    <option value="tangerine">Tangerine</option>
                                  </select>
                                </label>
                                <label>
                                  Canvas
                                  <select name="canvas" defaultValue={d.params.canvas} className="select">
                                    {["blush", "shell", "roseMist", "candy", "peach", "peachCream"].map((x) => (
                                      <option key={x}>{x}</option>
                                    ))}
                                  </select>
                                </label>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <label>
                                  Headline size
                                  <input name="headlineScale" type="number" step="0.05" min="0.6" max="1.8" defaultValue={d.params.headlineScale} className="input" />
                                </label>
                                <label>
                                  Logo size
                                  <input name="logoScale" type="number" step="0.05" min="0.6" max="2" defaultValue={d.params.logoScale} className="input" />
                                </label>
                                <label>
                                  Text amount
                                  <input name="textDensity" type="number" step="0.1" min="0.5" max="1.5" defaultValue={d.params.textDensity} className="input" />
                                </label>
                              </div>
                              <button className="btn btn-sm">Save design edits</button>
                            </form>
                          </details>
                        )}
                      </>
                    )}
                  </article>
                ))}

                {p.status === "awaiting_design" && (
                  <form action={uploadDesign} className="card-tint flex flex-col justify-center gap-3">
                    <p className="font-serif text-xl font-light text-signal">Upload my own design.</p>
                    <input type="hidden" name="postId" value={p.id} />
                    <select name="format" className="select" aria-label="Format">
                      {Object.entries(DESIGN_FORMATS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label} ({v.w}×{v.h})
                        </option>
                      ))}
                    </select>
                    <input type="file" name="file" accept="image/*,video/mp4,video/quicktime" required className="text-sm" />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="template" value="1" className="accent-deepred" /> Also save as a reusable template
                    </label>
                    <button className="btn btn-sm">Upload</button>
                    {canva.connected ? (
                      <div className="border-t border-rosemist pt-3">
                        <p className="mb-2 text-sm">Or start from scratch in Canva at the right size:</p>
                        <button formAction={openInCanvaAction} formNoValidate className="btn btn-sm">
                          New blank design in Canva
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm">
                        Prefer Canva? <a href="/integrations#canva">Connect Canva</a> to edit designs there and bring them back here.
                      </p>
                    )}
                  </form>
                )}
              </div>
            </section>
          );
        })
      )}

      {templates.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4">Your templates.</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {templates.map((t) => (
              <figure key={t.id} className="card p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/designs/${t.id}/image`} alt={t.templateName ?? "Template"} className="rounded-[14px]" />
                <figcaption className="mt-2 text-sm">{t.templateName}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
