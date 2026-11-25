import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, postVersions, posts, stories } from "@/db/schema";
import { DemoBadge, Empty, PageHeader, StatusPill, PLATFORM_LABEL } from "@/components/ui";
import { AvaAvatar } from "@/components/ava";
import { getAvaConfig, labelFor } from "@/lib/ava";
import { formatBrisbane } from "@/lib/scheduling";
import { bulkApprove, duplicatePostAction, postDecision, restorePostVersion, updatePost } from "../actions";

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: "awaiting", label: "Awaiting approval", statuses: ["awaiting_content", "revision_requested"] },
  { key: "saved", label: "Saved for later", statuses: ["saved"] },
  { key: "approved", label: "Approved", statuses: ["awaiting_design", "approved_for_publishing", "scheduled", "published"] },
  { key: "denied", label: "Denied", statuses: ["denied"] },
];

export default async function ContentPage({ searchParams }: { searchParams: Promise<{ tab?: string; platform?: string }> }) {
  const { tab = "awaiting", platform } = await searchParams;
  const statuses = TABS.find((t) => t.key === tab)?.statuses ?? TABS[0].statuses;
  const db = await getDb();
  const ava = await getAvaConfig(db);
  const allRows = await db.select().from(posts).where(inArray(posts.status, statuses)).orderBy(desc(posts.createdAt)).limit(150);
  const platforms = [...new Set(allRows.map((r) => r.platform))];
  const rows = platform ? allRows.filter((r) => r.platform === platform) : allRows;
  const storyIds = [...new Set(rows.map((r) => r.storyId).filter(Boolean))] as string[];
  const storyRows = storyIds.length ? await db.select().from(stories).where(inArray(stories.id, storyIds)) : [];
  const storyMap = new Map(storyRows.map((s) => [s.id, s]));
  const versions = rows.length ? await db.select().from(postVersions).where(inArray(postVersions.postId, rows.map((r) => r.id))).orderBy(desc(postVersions.version)) : [];
  const camps = await db.select().from(campaigns);

  // Group by story so one topic's suite reads together.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.storyId ?? "none", [...(groups.get(r.storyId ?? "none") ?? []), r]);

  return (
    <div>
      <PageHeader eyebrow="Social media content approval centre" title="One topic. Every platform, in your voice." emphasis="in your voice" />
      <nav className="segmented mb-4" aria-label="Status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/content?tab=${t.key}`} className="seg" aria-current={tab === t.key ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="label text-deepred">Platform</span>
        <Link href={`/content?tab=${tab}`} className={`pill ${!platform ? "pill-red" : ""}`}>
          All
        </Link>
        {platforms.map((p) => (
          <Link key={p} href={`/content?tab=${tab}&platform=${p}`} className={`pill ${platform === p ? "pill-red" : ""}`}>
            {PLATFORM_LABEL[p] ?? p}
          </Link>
        ))}
      </div>

      {tab === "awaiting" && rows.length > 0 && (
        <form id="bulk" action={bulkApprove} className="card-tint mb-6 flex flex-wrap items-center justify-between gap-3">
          <p>Tick posts below, then approve them together. Posts with brand issues stay put until they&apos;re fixed.</p>
          <button className="btn">Approve selected</button>
        </form>
      )}

      {rows.length === 0 ? (
        <Empty title="Nothing here.">
          <p>Approve a story in Daily News and its social suite appears here.</p>
        </Empty>
      ) : (
        [...groups.entries()].map(([storyId, ps]) => {
          const story = storyMap.get(storyId);
          return (
            <section key={storyId} className="mb-10">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-2xl">{story?.headline ?? "Standalone posts"}</h2>
                {story && <Link href={`/news?tab=approved#${story.id}`}>Original research</Link>}
              </div>
              <div className="grid gap-5 2xl:grid-cols-2">
                {ps.map((p) => {
                  const blocking = p.brandIssues.filter((i) => i.severity === "block");
                  const warnings = p.brandIssues.filter((i) => i.severity === "warn");
                  const editable = !["published", "publishing"].includes(p.status);
                  return (
                    <article key={p.id} id={p.id} className="card scroll-mt-6">
                      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {tab === "awaiting" && (
                            <input type="checkbox" name="ids" value={p.id} form="bulk" className="h-5 w-5 accent-deepred" aria-label={`Select ${PLATFORM_LABEL[p.platform]} ${p.format}`} />
                          )}
                          <span className="label text-deepred">
                            {PLATFORM_LABEL[p.platform] ?? p.platform} · {p.format}
                          </span>
                          <span className="pill">{p.treatment}</span>
                          {p.author === "ava" && (
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink" title="Drafted by Ava, your caption specialist">
                              <AvaAvatar size="sm" /> Ava
                            </span>
                          )}
                          {labelFor(p.pillar, ava.pillars) && <span className="pill-ok pill">{labelFor(p.pillar, ava.pillars)}</span>}
                          {labelFor(p.contentType, ava.types) && <span className="pill">{labelFor(p.contentType, ava.types)}</span>}
                          {p.isDemo && <DemoBadge />}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm">v{p.version}</span>
                          <StatusPill status={p.status} />
                        </div>
                      </header>

                      {(blocking.length > 0 || warnings.length > 0) && (
                        <div className="mb-3 rounded-[18px] bg-rosemist p-3 text-[15px]" role="alert">
                          <p className="font-bold text-ink">Brand check</p>
                          <ul className="list-inside list-disc">
                            {blocking.map((i, k) => (
                              <li key={k} className="text-deepred">
                                {i.detail}
                              </li>
                            ))}
                            {warnings.map((i, k) => (
                              <li key={`w${k}`}>{i.detail}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {p.feedback && p.status === "revision_requested" && <p className="mb-3 text-sm">Revision note: “{p.feedback}”</p>}

                      <form action={updatePost} className="space-y-3">
                        <input type="hidden" name="id" value={p.id} />
                        <Field label="Headline or opening hook" name="hook" value={p.hook} disabled={!editable} pid={p.id} />
                        <Field label="Caption" name="caption" value={p.caption} area rows={6} disabled={!editable} pid={p.id} />
                        {(p.supportingCopy || p.format === "carousel") && <Field label="Supporting copy" name="supportingCopy" value={p.supportingCopy ?? ""} area disabled={!editable} pid={p.id} />}
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="Call to action" name="callToAction" value={p.callToAction} disabled={!editable} pid={p.id} />
                          <Field label="Hashtags" name="hashtags" value={p.hashtags.join(" ")} disabled={!editable} pid={p.id} />
                        </div>
                        <Field label="Alt text" name="altText" value={p.altText ?? ""} disabled={!editable} pid={p.id} />
                        <div className="grid gap-3 md:grid-cols-3">
                          <Field label="Suggested date" name="suggestedDate" value={p.suggestedDate ?? ""} disabled={!editable} pid={p.id} />
                          <Field label="Suggested time" name="suggestedTime" value={p.suggestedTime ?? ""} disabled={!editable} pid={p.id} />
                          <div>
                            <label className="label mb-1 block text-deepred" htmlFor={`camp-${p.id}`}>
                              Campaign
                            </label>
                            <select id={`camp-${p.id}`} name="campaignId" defaultValue={p.campaignId ?? ""} className="select" disabled={!editable}>
                              <option value="">None</option>
                              {camps.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {editable && <button className="btn btn-sm">Save edits</button>}
                      </form>

                      <details className="mt-4 text-[15px]">
                        <summary className="cursor-pointer font-bold text-deepred">Taglines, SEO, design concept and script</summary>
                        <div className="mt-2 space-y-2">
                          <div>
                            <p className="label text-deepred">Alternative hooks</p>
                            <ul className="list-inside list-disc">
                              {p.taglines.map((t, i) => (
                                <li key={i}>{t}</li>
                              ))}
                            </ul>
                          </div>
                          <p>
                            <strong className="text-ink">Keywords:</strong> {p.keywords.join(", ")}
                          </p>
                          <p>
                            <strong className="text-ink">SEO notes:</strong> {p.seoNotes}
                          </p>
                          <p>
                            <strong className="text-ink">Design concept:</strong> {p.designConcept}
                          </p>
                          {p.script && (
                            <p className="whitespace-pre-line">
                              <strong className="text-ink">Script:</strong> {p.script}
                            </p>
                          )}
                          <p>
                            <strong className="text-ink">Audience:</strong> {p.audience} · <strong className="text-ink">Goal:</strong> {p.engagementGoal}
                          </p>
                          {p.briefId && <Link href={`/editorial/${p.briefId}`}>Open the editorial brief</Link>}
                        </div>
                      </details>

                      {versions.filter((v) => v.postId === p.id).length > 1 && (
                        <details className="mt-3 text-[15px]">
                          <summary className="cursor-pointer font-bold text-deepred">Version history</summary>
                          <ul className="mt-2 space-y-2">
                            {versions
                              .filter((v) => v.postId === p.id)
                              .map((v) => (
                                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                                  <span>
                                    v{v.version} · {v.note} · {formatBrisbane(v.createdAt)}
                                  </span>
                                  {v.version !== p.version && editable && (
                                    <form action={restorePostVersion}>
                                      <input type="hidden" name="id" value={p.id} />
                                      <input type="hidden" name="versionId" value={v.id} />
                                      <button className="btn btn-sm">Restore</button>
                                    </form>
                                  )}
                                </li>
                              ))}
                          </ul>
                        </details>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {["awaiting_content", "revision_requested", "saved"].includes(p.status) && (
                          <form action={postDecision} className="flex w-full flex-wrap gap-2">
                            <input type="hidden" name="id" value={p.id} />
                            <input name="feedback" className="input min-w-[200px] flex-1" placeholder="Feedback or revision request" aria-label="Feedback" />
                            <button name="decision" value="approve" className="btn btn-primary" disabled={blocking.length > 0}>
                              Approve
                            </button>
                            <button name="decision" value="revise" className="btn">
                              Request revisions
                            </button>
                            <button name="decision" value="deny" className="btn">
                              Deny
                            </button>
                            {p.status !== "saved" && (
                              <button name="decision" value="save" className="btn">
                                Save for later
                              </button>
                            )}
                          </form>
                        )}
                        {blocking.length > 0 && ["awaiting_content", "revision_requested", "saved"].includes(p.status) && (
                          <form action={postDecision}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="decision" value="approve" />
                            <input type="hidden" name="override" value="1" />
                            <button className="btn btn-sm" title="Owner override: approve despite brand issues (recorded in the audit log)">
                              Approve anyway
                            </button>
                          </form>
                        )}
                        <form action={duplicatePostAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="btn btn-sm">Duplicate</button>
                        </form>
                        {p.status === "awaiting_design" && (
                          <Link href={`/design?post=${p.id}`} className="btn btn-sm">
                            Go to design
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function Field({ label, name, value, area, rows, disabled, pid }: { label: string; name: string; value: string; area?: boolean; rows?: number; disabled?: boolean; pid: string }) {
  const id = `${name}-${pid}`;
  return (
    <div>
      <label className="label mb-1 block text-deepred" htmlFor={id}>
        {label}
      </label>
      {area ? (
        <textarea id={id} name={name} defaultValue={value} rows={rows ?? 3} className="textarea" disabled={disabled} />
      ) : (
        <input id={id} name={name} defaultValue={value} className="input" disabled={disabled} />
      )}
    </div>
  );
}
