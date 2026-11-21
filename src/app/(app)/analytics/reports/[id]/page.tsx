import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { PageHeader, Stat, PLATFORM_LABEL } from "@/components/ui";
import type { PostPerf } from "@/lib/analytics";

type ReportData = {
  totals: Record<string, number>;
  postCount: number;
  insights: string[];
  narrative: { summary: string; recommendations: string[] } | null;
  top: PostPerf[];
  bottom: PostPerf[];
  pipeline: { status: string; n: number }[];
};

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await (await getDb()).query.reports.findFirst({ where: eq(reports.id, id) });
  if (!r) notFound();
  const d = r.data as unknown as ReportData;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${r.periodStart} to ${r.periodEnd}`} title={r.title}>
        <a className="btn btn-sm" href={`/api/reports/${r.id}/export?format=csv`}>
          Export CSV
        </a>
        <a className="btn btn-sm" href={`/api/reports/${r.id}/export?format=json`}>
          Export JSON
        </a>
      </PageHeader>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Posts analysed" value={d.postCount} />
        {Object.entries(d.totals ?? {}).slice(0, 3).map(([k, v]) => (
          <Stat key={k} label={k} value={Number(v).toLocaleString("en-AU")} />
        ))}
      </section>
      {d.narrative && (
        <section className="card">
          <h2 className="mb-2">Summary.</h2>
          <p>{d.narrative.summary}</p>
          <h3 className="mt-4">Recommendations</h3>
          <ul className="list-inside list-disc">
            {d.narrative.recommendations.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="card-tint">
        <h3 className="mb-2">Insights from the data</h3>
        <ul className="list-inside list-disc">
          {d.insights.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h3 className="mb-2">Top posts</h3>
        <ol className="list-inside list-decimal">
          {d.top.map((p) => (
            <li key={p.postId}>
              {p.hook} · {PLATFORM_LABEL[p.platform]} · {(p.engagementRate * 100).toFixed(1)}%
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
