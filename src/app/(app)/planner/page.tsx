import Link from "next/link";
import { and, gte, isNotNull, lt, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, posts } from "@/db/schema";
import { PageHeader, PLATFORM_LABEL } from "@/components/ui";
import { Calendar, type CalItem } from "@/components/calendar";
import { plannerWarnings } from "@/lib/planner";
import { weeklyOverview } from "@/lib/analytics";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { createCampaign } from "../actions";

const STATUS_LABEL: Record<string, string> = {
  awaiting_content: "Awaiting content approval",
  revision_requested: "Revision requested",
  awaiting_design: "Awaiting design approval",
  approved_for_publishing: "Approved for publishing",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Publishing failed",
  manual_required: "Manual publish needed",
  archived: "Archived",
};

const OFFSET = 10 * 3600_000; // Brisbane
const isoLocal = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
const startOfLocalDay = (iso: string) => new Date(`${iso}T00:00:00+10:00`);

function range(view: string, anchorIso: string) {
  const a = startOfLocalDay(anchorIso);
  const dow = (new Date(a.getTime() + OFFSET).getUTCDay() + 6) % 7; // Monday = 0
  if (view === "day") return { from: a, to: new Date(a.getTime() + 86400_000) };
  if (view === "week") {
    const from = new Date(a.getTime() - dow * 86400_000);
    return { from, to: new Date(from.getTime() + 7 * 86400_000) };
  }
  const local = new Date(a.getTime() + OFFSET);
  const months = view === "quarter" ? 3 : 1;
  const mStart = view === "quarter" ? Math.floor(local.getUTCMonth() / 3) * 3 : local.getUTCMonth();
  const first = startOfLocalDay(new Date(Date.UTC(local.getUTCFullYear(), mStart, 1)).toISOString().slice(0, 10));
  const last = startOfLocalDay(new Date(Date.UTC(local.getUTCFullYear(), mStart + months, 1)).toISOString().slice(0, 10));
  const firstDow = (new Date(first.getTime() + OFFSET).getUTCDay() + 6) % 7;
  const from = new Date(first.getTime() - firstDow * 86400_000);
  const lastDow = (new Date(last.getTime() + OFFSET).getUTCDay() + 6) % 7;
  const to = new Date(last.getTime() + ((7 - lastDow) % 7) * 86400_000);
  return { from, to, monthStart: first, monthEnd: last };
}

export default async function PlannerPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string; platform?: string; category?: string; campaign?: string }> }) {
  const sp = await searchParams;
  const view = ["day", "week", "month", "quarter", "campaign"].includes(sp.view ?? "") ? sp.view! : "month";
  const todayIso = isoLocal(new Date());
  const anchor = sp.date ?? todayIso;
  const r = range(view === "campaign" ? "month" : view, anchor);
  const db = await getDb();

  let rows = await db
    .select()
    .from(posts)
    .where(and(isNotNull(posts.scheduledAt), gte(posts.scheduledAt, r.from), lt(posts.scheduledAt, r.to), notInArray(posts.status, ["denied"])));
  if (sp.platform) rows = rows.filter((p) => p.platform === sp.platform);
  if (sp.category) rows = rows.filter((p) => p.category === sp.category);
  if (sp.campaign) rows = rows.filter((p) => p.campaignId === sp.campaign);
  const camps = await db.select().from(campaigns);

  const items: CalItem[] = rows.map((p) => ({
    id: p.id,
    date: isoLocal(p.scheduledAt!),
    time: p.scheduledAt!.toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" }),
    platform: p.platform,
    platformLabel: PLATFORM_LABEL[p.platform] ?? p.platform,
    status: p.status,
    statusLabel: STATUS_LABEL[p.status] ?? p.status,
    hook: p.hook,
    caption: p.caption.slice(0, 200),
    category: p.category,
    thumbId: p.approvedDesignId,
  }));

  const days: { iso: string; label: string; inMonth: boolean }[] = [];
  for (let t = r.from.getTime(); t < r.to.getTime(); t += 86400_000) {
    const iso = isoLocal(new Date(t));
    const d = new Date(t);
    const inMonth = !("monthStart" in r) || !r.monthStart || (d >= r.monthStart && d < r.monthEnd!);
    days.push({ iso, label: d.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: view === "day" || view === "week" ? "short" : undefined, weekday: view === "day" ? "long" : undefined }), inMonth });
  }

  const step = (dir: 1 | -1) => {
    const a = startOfLocalDay(anchor);
    const local = new Date(a.getTime() + OFFSET);
    if (view === "day") return isoLocal(new Date(a.getTime() + dir * 86400_000));
    if (view === "week") return isoLocal(new Date(a.getTime() + dir * 7 * 86400_000));
    const m = view === "quarter" ? 3 : 1;
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + dir * m, 1)).toISOString().slice(0, 10);
  };
  const q = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { view, date: anchor, platform: sp.platform, category: sp.category, campaign: sp.campaign, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    return `/planner?${p}`;
  };

  const [warnings, overview] = await Promise.all([plannerWarnings(db, new Date(Math.max(Date.now(), r.from.getTime())), r.to), weeklyOverview(db, range("week", todayIso).from)]);
  const title = startOfLocalDay(anchor).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", month: "long", year: "numeric", day: view === "day" || view === "week" ? "numeric" : undefined });

  return (
    <div>
      <PageHeader eyebrow="Content planner and calendar" title="The month, at a glance." emphasis="at a glance" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {["day", "week", "month", "quarter", "campaign"].map((v) => (
          <Link key={v} href={q({ view: v })} className={`btn btn-sm ${view === v ? "btn-primary" : ""}`}>
            {v[0].toUpperCase() + v.slice(1)}
          </Link>
        ))}
        <span className="mx-2 font-serif text-2xl font-light text-signal">{title}</span>
        <Link href={q({ date: step(-1) })} className="btn btn-sm" aria-label="Previous">
          ‹ Previous
        </Link>
        <Link href={q({ date: todayIso })} className="btn btn-sm">
          Today
        </Link>
        <Link href={q({ date: step(1) })} className="btn btn-sm" aria-label="Next">
          Next ›
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap gap-2" aria-label="Calendar filters">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="date" value={anchor} />
        <select name="platform" defaultValue={sp.platform ?? ""} className="select max-w-[200px]" aria-label="Platform">
          <option value="">All platforms</option>
          {Object.entries(PLATFORM_LABEL)
            .filter(([k]) => k !== "sandbox")
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <select name="category" defaultValue={sp.category ?? ""} className="select max-w-[260px]" aria-label="Category">
          <option value="">All categories</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="select max-w-[220px]" aria-label="Campaign">
          <option value="">All campaigns</option>
          {camps.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn btn-sm">Apply</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-4">
        <div className="xl:col-span-3">
          {view === "campaign" ? (
            <div className="space-y-4">
              {[...camps, { id: "", name: "No campaign" }].map((c) => {
                const list = rows.filter((p) => (p.campaignId ?? "") === c.id);
                if (!list.length) return null;
                return (
                  <section key={c.id || "none"} className="card">
                    <h3>{c.name}</h3>
                    <ul className="mt-2 divide-y divide-rosemist">
                      {list.map((p) => (
                        <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2 text-[15px]">
                          <span>
                            <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                            {p.hook}
                          </span>
                          <span>{STATUS_LABEL[p.status]}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <Calendar days={days} items={items} view={view} todayIso={todayIso} />
          )}
        </div>
        <aside className="space-y-4">
          <div className="card text-[15px]">
            <p className="label mb-2 text-deepred">This week</p>
            <p>
              {overview.planned} planned · {overview.awaitingApproval} awaiting approval · {overview.scheduled} scheduled · {overview.published} published
            </p>
            <p className="label mb-1 mt-3 text-deepred">By channel</p>
            <p>{Object.entries(overview.byPlatform).map(([k, v]) => `${PLATFORM_LABEL[k] ?? k} ${v}`).join(" · ") || "None yet"}</p>
            <p className="label mb-1 mt-3 text-deepred">By category</p>
            <p>{Object.entries(overview.byCategory).map(([k, v]) => `${CATEGORY_LABELS[k] ?? k} ${v}`).join(" · ") || "None yet"}</p>
          </div>
          {warnings.length > 0 && (
            <div className="card-tint text-[15px]">
              <p className="label mb-2 text-deepred">Warnings</p>
              <ul className="list-inside list-disc space-y-1">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <form action={createCampaign} className="card space-y-2">
            <p className="label text-deepred">New campaign</p>
            <input name="name" required className="input" placeholder="Campaign name" aria-label="Campaign name" />
            <input name="description" className="input" placeholder="Short description" aria-label="Description" />
            <div className="grid grid-cols-2 gap-2">
              <input name="startsOn" type="date" className="input" aria-label="Starts" />
              <input name="endsOn" type="date" className="input" aria-label="Ends" />
            </div>
            <button className="btn btn-sm">Create campaign</button>
          </form>
        </aside>
      </div>
    </div>
  );
}
