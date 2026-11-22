import Link from "next/link";
import { desc, gte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accountMetrics, accounts } from "@/db/schema";
import { PLATFORM_LABEL } from "@/components/ui";
import { algorithmSignals, dataDecisions, postPerformance, type PostPerf, type Signal } from "@/lib/analytics";
import { formatBrisbane } from "@/lib/scheduling";

/**
 * Overview analytics: headline metrics, a per-platform table, the engagement mix and top posts.
 * Real (API-sourced) numbers only. If there is no real data yet but sandbox test data exists,
 * it is shown and clearly labelled as test data; nothing is ever made up.
 */

const DAYS = 30;

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const engagements = (p: PostPerf) => p.likes + p.comments + p.shares + p.saves;

type Totals = { posts: number; reach: number; impressions: number; engagements: number; views: number; clicks: number; profileVisits: number; likes: number; comments: number; shares: number; saves: number; watch: number };
function totals(perf: PostPerf[]): Totals {
  const t: Totals = { posts: perf.length, reach: 0, impressions: 0, engagements: 0, views: 0, clicks: 0, profileVisits: 0, likes: 0, comments: 0, shares: 0, saves: 0, watch: 0 };
  for (const p of perf) {
    t.reach += p.reach;
    t.impressions += p.impressions;
    t.engagements += engagements(p);
    t.views += p.views;
    t.clicks += p.clicks;
    t.profileVisits += p.profileVisits;
    t.likes += p.likes;
    t.comments += p.comments;
    t.shares += p.shares;
    t.saves += p.saves;
    t.watch += p.watchTimeSeconds;
  }
  return t;
}
const rate = (t: Totals) => (t.engagements ? t.engagements / Math.max(1, t.reach || t.impressions) : 0);

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-[12px]">no earlier data</span>;
  const d = Math.round(((now - before) / before) * 100);
  return (
    <span className={`text-[12px] font-bold ${d >= 0 ? "text-ink" : "text-deepred"}`}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(d)}% <span className="font-normal">vs previous {DAYS} days</span>
    </span>
  );
}

function Metric({ label, value, now, before, hint }: { label: string; value: string; now?: number; before?: number; hint: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4 sm:p-5" title={hint}>
      <p className="label text-deepred">{label}</p>
      <p className="kpi text-3xl sm:text-4xl">{value}</p>
      {now !== undefined && before !== undefined ? <Delta now={now} before={before} /> : <span className="text-[12px]">{hint}</span>}
    </div>
  );
}

function SignalRow({ s }: { s: Signal }) {
  const show = (v: number | null) => (v == null ? "–" : s.unit === "pct" ? `${(v * 100).toFixed(v < 0.01 ? 2 : 1)}%` : `${v.toFixed(1)}s`);
  const trend = s.value != null && s.prev != null && s.prev > 0 ? (s.value - s.prev) / s.prev : null;
  return (
    <li className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[11rem_6rem_1fr] sm:items-baseline">
      <span className="font-bold text-ink">{s.label}</span>
      <span>
        <span className="kpi text-2xl">{show(s.value)}</span>
        {trend != null && (
          <span className={`ml-2 text-[12px] font-bold ${trend >= 0 ? "text-ink" : "text-deepred"}`}>
            {trend >= 0 ? "▲" : "▼"} {Math.abs(Math.round(trend * 100))}%
          </span>
        )}
      </span>
      <span className="text-[14px] leading-snug">
        {s.why} <span className="text-deepred">{s.act}</span>
      </span>
    </li>
  );
}

export async function OverviewAnalytics({ db }: { db: Db }) {
  const to = new Date();
  const from = new Date(to.getTime() - DAYS * 86400_000);
  const prevFrom = new Date(from.getTime() - DAYS * 86400_000);
  const fromDay = prevFrom.toISOString().slice(0, 10);

  let [perf, prev] = await Promise.all([postPerformance(db, from, to, false), postPerformance(db, prevFrom, from, false)]);
  let sample = false;
  if (perf.length === 0) {
    const [sp, spPrev] = await Promise.all([postPerformance(db, from, to, true), postPerformance(db, prevFrom, from, true)]);
    if (sp.length) {
      perf = sp;
      prev = spPrev;
      sample = true;
    }
  }

  const [accs, metrics] = await Promise.all([
    db.select().from(accounts),
    db.select().from(accountMetrics).where(gte(accountMetrics.date, fromDay)).orderBy(desc(accountMetrics.date)),
  ]);
  const accById = new Map(accs.map((a) => [a.id, a]));

  // Followers per platform: latest count per account, plus net change within the period.
  const fromStr = from.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const byPlatform = new Map<string, { followers: number; net: number; prevNet: number; handles: string[]; connected: boolean }>();
  const row = (platform: string) => {
    const r = byPlatform.get(platform) ?? { followers: 0, net: 0, prevNet: 0, handles: [], connected: false };
    byPlatform.set(platform, r);
    return r;
  };
  for (const a of accs) {
    if (a.platform === "sandbox" && !sample) continue;
    const r = row(a.platform);
    r.handles.push(a.handle);
    if (a.status === "connected") r.connected = true;
  }
  for (const m of metrics) {
    if (m.isSandbox && !sample) continue;
    const a = accById.get(m.accountId);
    if (!a) continue;
    const r = row(a.platform);
    if (!seen.has(m.accountId)) {
      seen.add(m.accountId);
      r.followers += m.followers;
    }
    if (m.date >= fromStr) r.net += m.newFollowers - m.unfollows;
    else r.prevNet += m.newFollowers - m.unfollows;
  }
  const perfByPlatform = new Map<string, PostPerf[]>();
  for (const p of perf) perfByPlatform.set(p.platform, [...(perfByPlatform.get(p.platform) ?? []), p]);
  for (const k of perfByPlatform.keys()) row(k);

  const now = totals(perf);
  const before = totals(prev);
  const followers = [...byPlatform.values()].reduce((a, r) => a + r.followers, 0);
  const net = [...byPlatform.values()].reduce((a, r) => a + r.net, 0);
  const prevNet = [...byPlatform.values()].reduce((a, r) => a + r.prevNet, 0);

  const platforms = [...byPlatform.entries()]
    .map(([platform, r]) => {
      const list = perfByPlatform.get(platform) ?? [];
      const t = totals(list);
      const best = [...list].sort((a, b) => b.engagementRate - a.engagementRate)[0];
      return { platform, ...r, t, er: rate(t), best };
    })
    .sort((a, b) => b.t.reach - a.t.reach || b.followers - a.followers);

  const top = [...perf].filter((p) => p.reach || p.impressions).sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  const mix = [
    { k: "Likes", v: now.likes, c: "bg-signal" },
    { k: "Comments", v: now.comments, c: "bg-hot" },
    { k: "Shares", v: now.shares, c: "bg-tangerine" },
    { k: "Saves", v: now.saves, c: "bg-deepred" },
  ];
  const hasData = perf.length > 0 || followers > 0;
  const signals = algorithmSignals(perf, prev);
  const decisions = dataDecisions(perf);

  return (
    <section aria-labelledby="perf" className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="perf" className="text-[1.7rem] sm:text-3xl">
          How the channels are <em>doing</em>.
        </h2>
        <span className="label text-deepred">Last {DAYS} days</span>
        {sample && <span className="pill-ink pill text-[0.66rem]">Test data, not real results</span>}
        <div className="rule hidden flex-1 sm:block" aria-hidden />
        <Link href="/analytics" className="btn btn-sm">
          Open full analytics
        </Link>
      </div>

      {!hasData ? (
        <div className="card-tint text-[15px]">
          No numbers yet. Real results appear here once your accounts are connected and posts go live:{" "}
          <Link href="/integrations">connect an account</Link>. Nothing is estimated or made up.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <Metric label="Followers" value={fmt(followers)} hint="Across every connected account" />
            <Metric label="Net new followers" value={`${net >= 0 ? "+" : ""}${fmt(net)}`} now={net} before={prevNet} hint="New followers minus unfollows" />
            <Metric label="Reach" value={fmt(now.reach)} now={now.reach} before={before.reach} hint="People who saw a post at least once" />
            <Metric label="Impressions" value={fmt(now.impressions)} now={now.impressions} before={before.impressions} hint="Total times posts were shown" />
            <Metric label="Engagements" value={fmt(now.engagements)} now={now.engagements} before={before.engagements} hint="Likes, comments, shares and saves" />
            <Metric label="Engagement rate" value={pct(rate(now))} now={rate(now)} before={rate(before)} hint="Engagements ÷ reach" />
            <Metric label="Video views" value={fmt(now.views)} now={now.views} before={before.views} hint={`Watch time ${Math.round(now.watch / 3600)} hours`} />
            <Metric label="Link clicks" value={fmt(now.clicks)} now={now.clicks} before={before.clicks} hint={`Profile visits ${fmt(now.profileVisits)}`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-5">
            <div className="card-tint xl:col-span-2">
              <p className="label mb-1 text-deepred">What the data says to do next</p>
              <p className="mb-3 text-[13px]">Ranked on shares, saves and comments per person reached: the signals platforms reward most.</p>
              <ol className="space-y-3 text-[15px] leading-snug">
                {decisions.map((d, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="font-serif text-xl font-light leading-none text-signal" aria-hidden>
                      ✦
                    </span>
                    <span>{d}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card xl:col-span-3">
              <p className="label mb-1 text-deepred">Algorithm signals</p>
              <p className="text-[13px]">Each one as a rate per person reached, so quiet and busy weeks compare fairly. Arrows compare with the previous {DAYS} days.</p>
              <ul className="divide-y divide-rosemist">
                {signals.map((s) => (
                  <SignalRow key={s.key} s={s} />
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <div className="card min-w-0 xl:col-span-2">
              <p className="label mb-3 text-deepred">By platform</p>
              <div className="-mx-2 overflow-x-auto px-2">
                <table className="w-full min-w-[640px] text-left text-[14px]">
                  <thead>
                    <tr className="label border-b border-rosemist text-deepred">
                      <th className="py-2 pr-3 font-normal">Platform</th>
                      <th className="py-2 pr-3 text-right font-normal">Followers</th>
                      <th className="py-2 pr-3 text-right font-normal">Net new</th>
                      <th className="py-2 pr-3 text-right font-normal">Posts</th>
                      <th className="py-2 pr-3 text-right font-normal">Reach</th>
                      <th className="py-2 pr-3 text-right font-normal">Eng. rate</th>
                      <th className="py-2 pr-3 text-right font-normal">Shares</th>
                      <th className="py-2 pr-3 text-right font-normal">Saves</th>
                      <th className="py-2 text-right font-normal">Clicks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rosemist">
                    {platforms.map((p) => (
                      <tr key={p.platform}>
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-ink">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                          <span className="block text-[12px]">{p.connected ? p.handles.join(", ") : "Not connected"}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right">{fmt(p.followers)}</td>
                        <td className={`py-2.5 pr-3 text-right ${p.net < 0 ? "text-deepred" : ""}`}>{`${p.net >= 0 ? "+" : ""}${fmt(p.net)}`}</td>
                        <td className="py-2.5 pr-3 text-right">{p.t.posts}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(p.t.reach)}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-ink">{p.t.posts ? pct(p.er) : "–"}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(p.t.shares)}</td>
                        <td className="py-2.5 pr-3 text-right">{fmt(p.t.saves)}</td>
                        <td className="py-2.5 text-right">{fmt(p.t.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <p className="label mb-3 text-deepred">Engagement mix</p>
              {now.engagements === 0 ? (
                <p className="text-[15px]">No engagement recorded yet.</p>
              ) : (
                <>
                  <div className="flex h-3 overflow-hidden rounded-full bg-rosemist" role="img" aria-label={mix.map((m) => `${m.k} ${m.v}`).join(", ")}>
                    {mix.map((m) => (m.v ? <span key={m.k} className={m.c} style={{ width: `${(m.v / now.engagements) * 100}%` }} /> : null))}
                  </div>
                  <ul className="mt-4 space-y-2 text-[14px]">
                    {mix.map((m) => (
                      <li key={m.k} className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${m.c}`} aria-hidden />
                        <span>{m.k}</span>
                        <span className="ml-auto font-bold text-ink">{fmt(m.v)}</span>
                        <span className="w-12 text-right">{Math.round((m.v / now.engagements) * 100)}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[13px]">Shares and saves are the strongest signals that a post is worth more reach.</p>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <p className="label mb-3 text-deepred">Top posts by engagement rate</p>
            {top.length === 0 ? (
              <p className="text-[15px]">No published posts with results in the last {DAYS} days.</p>
            ) : (
              <ol className="divide-y divide-rosemist">
                {top.map((p, i) => (
                  <li key={p.postId} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[2rem_1fr_auto] sm:items-center">
                    <span className="kpi hidden text-2xl sm:block" aria-hidden>
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-ink" title={p.hook}>
                        {p.liveUrl ? (
                          <a href={p.liveUrl} target="_blank" rel="noreferrer" className="text-ink">
                            {p.hook || "Untitled post"}
                          </a>
                        ) : (
                          p.hook || "Untitled post"
                        )}
                      </p>
                      <p className="text-[12.5px]">
                        <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                        {p.format.replace(/_/g, " ")}
                        {p.publishedAt && ` · ${formatBrisbane(p.publishedAt)}`}
                      </p>
                    </div>
                    <dl className="grid grid-cols-6 gap-x-3 text-right text-[12.5px] sm:min-w-[380px]">
                      {[
                        ["Rate", pct(p.engagementRate)],
                        ["Reach", fmt(p.reach)],
                        ["Likes", fmt(p.likes)],
                        ["Comm.", fmt(p.comments)],
                        ["Shares", fmt(p.shares)],
                        ["Saves", fmt(p.saves)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col-reverse">
                          <dt>{k}</dt>
                          <dd className={`font-bold ${k === "Rate" ? "text-deepred" : "text-ink"}`}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>
      )}
    </section>
  );
}

