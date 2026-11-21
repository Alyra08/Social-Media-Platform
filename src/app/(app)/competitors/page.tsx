import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { competitors, reports } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { addCompetitor, removeCompetitor, runCompetitorsNow } from "../actions";

type CR = {
  summary: string;
  competitors: { name: string; topicsPublishing: string[]; mostEngagingContent: { description: string; url: string }[]; campaignFormats: string[] }[];
  emergingThemes: string[];
  audienceConversations: string[];
  contentGaps: string[];
  industryTrends: string[];
  opportunitiesForSbf: string[];
};

function L({ title, items }: { title: string; items: string[] }) {
  return items?.length ? (
    <div>
      <p className="label mb-1 text-deepred">{title}</p>
      <ul className="list-inside list-disc text-[15px]">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  ) : null;
}

export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const { report: reportId } = await searchParams;
  const db = await getDb();
  const list = await db.select().from(competitors).orderBy(competitors.name);
  const all = await db.select().from(reports).where(eq(reports.kind, "competitor")).orderBy(desc(reports.createdAt)).limit(10);
  const current = reportId ? all.find((r) => r.id === reportId) : all[0];
  const d = current?.data as CR | undefined;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Competitor intelligence" title="Know the room. Take a different seat." emphasis="different seat">
        <form action={runCompetitorsNow}>
          <button className="btn btn-primary">Run this week&apos;s review</button>
        </form>
      </PageHeader>
      <p className="text-[15px]">Public information only. The aim is gaps and a distinctive SBF position, never copying. Runs automatically every Monday at 7:00 am.</p>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-3">
          <h2 className="text-2xl">Who we watch.</h2>
          {list.length === 0 && <p className="text-[15px]">No competitors yet. Add the publications and accounts you want monitored.</p>}
          <ul className="space-y-2">
            {list.map((c) => (
              <li key={c.id} className="card flex items-start justify-between gap-2 py-3">
                <div className="min-w-0 text-[15px]">
                  <p className="font-bold text-ink">{c.name}</p>
                  {c.url && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="break-all">
                      {c.url}
                    </a>
                  )}
                  <p>{Object.entries(c.handles).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                </div>
                <form action={removeCompetitor}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn btn-sm">Remove</button>
                </form>
              </li>
            ))}
          </ul>
          <form action={addCompetitor} className="card space-y-2">
            <p className="label text-deepred">Add a competitor</p>
            <input name="name" required className="input" placeholder="Name" aria-label="Name" />
            <input name="url" type="url" className="input" placeholder="Website" aria-label="Website" />
            <input name="instagram" className="input" placeholder="Instagram handle" aria-label="Instagram" />
            <input name="tiktok" className="input" placeholder="TikTok handle" aria-label="TikTok" />
            <input name="notes" className="input" placeholder="Notes" aria-label="Notes" />
            <button className="btn btn-sm">Add</button>
          </form>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <h2 className="text-2xl">{current ? `Report: ${current.periodStart} to ${current.periodEnd}` : "Weekly report."}</h2>
          {!d ? (
            <Empty title="No report yet.">
              <p>Add competitors, then run the review. It needs an Anthropic API key for web research.</p>
            </Empty>
          ) : (
            <>
              <div className="card">
                <p>{d.summary}</p>
              </div>
              <div className="card-tint grid gap-4 md:grid-cols-2">
                <L title="Opportunities for SBF" items={d.opportunitiesForSbf} />
                <L title="Content gaps" items={d.contentGaps} />
                <L title="Emerging themes" items={d.emergingThemes} />
                <L title="Industry trends" items={d.industryTrends} />
                <L title="Audience conversations" items={d.audienceConversations} />
              </div>
              {d.competitors.map((c) => (
                <div key={c.name} className="card space-y-3">
                  <h3>{c.name}</h3>
                  <L title="Publishing" items={c.topicsPublishing} />
                  <L title="Campaign formats" items={c.campaignFormats} />
                  {c.mostEngagingContent.length > 0 && (
                    <div>
                      <p className="label mb-1 text-deepred">Most engaging (visible publicly)</p>
                      <ul className="list-inside list-disc text-[15px]">
                        {c.mostEngagingContent.map((m) => (
                          <li key={m.url}>
                            <a href={m.url} target="_blank" rel="noreferrer">
                              {m.description}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
          {all.length > 1 && (
            <p className="text-[15px]">
              Earlier reports:{" "}
              {all.map((r) => (
                <a key={r.id} href={`/competitors?report=${r.id}`} className="mr-3">
                  {formatBrisbane(r.createdAt)}
                </a>
              ))}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
