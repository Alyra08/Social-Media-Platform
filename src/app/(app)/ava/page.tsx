import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, posts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/client";
import { AVA, CONTENT_TYPES, latestBriefing, pillarBalance } from "@/lib/ava";
import { formatBrisbane } from "@/lib/scheduling";
import { runJobNow } from "../actions";
import { AvaAvatar } from "@/components/ava";

export const dynamic = "force-dynamic";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="mb-2 font-serif text-[1.15rem] italic text-deepred">{title}</h3>
      <ul className="space-y-1.5 text-[14.5px] leading-snug">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-signal">
              ✦
            </span>
            <span>{i}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AvaPage() {
  const user = await requireUser("viewer");
  const db = await getDb();
  const [{ briefing, date, isStarting }, bal, drafted, lastRun] = await Promise.all([
    latestBriefing(db),
    pillarBalance(db),
    db.select({ id: posts.id }).from(posts).where(eq(posts.author, "ava")),
    db.query.activityLog.findFirst({ where: and(eq(activityLog.job, "ava:trends")), orderBy: desc(activityLog.createdAt) }),
  ]);
  const ai = aiEnabled();
  const maxN = Math.max(1, ...bal.types.map((t) => t.n));

  return (
    <div className="space-y-14">
      {/* Profile */}
      <section className="relative overflow-hidden rounded-[32px] bg-blush px-6 py-10 sm:px-10">
        <span aria-hidden className="absolute -bottom-10 right-8 hidden h-48 w-36 rounded-t-full bg-rose opacity-70 md:block" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
          <AvaAvatar size="lg" />
          <div className="min-w-0 flex-1">
            <p className="label text-deepred">Your content team</p>
            <h1 className="mt-2 text-[2.6rem] leading-none sm:text-6xl">
              Meet <span className="script inline-block text-[1.2em] leading-none">Ava.</span>
            </h1>
            <p className="mt-2 text-[17px] font-bold text-ink">{AVA.role}</p>
            <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed">{AVA.summary}</p>
            <p className="mt-3 max-w-2xl text-[13px]">Ava is an AI persona: she drafts, you decide. Nothing she writes is published without your approval, and the brand brief always overrides her.</p>
          </div>
        </div>
        <div className="relative mt-8 flex flex-wrap gap-x-8 gap-y-3 text-[14px]">
          <p>
            <span className="kpi text-3xl">{drafted.length}</span> <span className="font-bold text-ink">captions drafted</span>
          </p>
          <p>
            <span className="kpi text-3xl">{bal.total}</span> <span className="font-bold text-ink">posts tagged in 30 days</span>
          </p>
          <p className="self-center">
            <span className={`pill ${ai ? "pill-ok" : "pill-ink"}`}>{ai ? "Writing live" : "Waiting for the AI key"}</span>
          </p>
        </div>
      </section>

      {/* Pillars */}
      <section aria-labelledby="pillars" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <p className="label text-deepred">What the feed talks about</p>
          <h2 id="pillars" className="mt-2 text-[2.2rem] sm:text-[2.6rem]">
            Content <em>pillars</em>.
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-relaxed">Every post Ava writes is tagged with one pillar. She watches the last 30 days and favours whichever pillars are falling behind, so the feed stays balanced.</p>
          {bal.under.length > 0 && bal.total > 0 && (
            <p className="mt-3 text-[14px]">
              <strong className="text-ink">Ava&apos;s next focus:</strong> {bal.under.join(", ")}.
            </p>
          )}
        </div>
        <ul className="space-y-4">
          {bal.pillars.map((p) => (
            <li key={p.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-[1.3rem] leading-tight text-deepred">{p.label}</span>
                <span className="text-[13px] font-bold text-ink">
                  {bal.total ? `${Math.round(p.share * 100)}%` : "–"} <span className="font-normal">of {Math.round(p.target * 100)}% target</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-blush" aria-hidden>
                <div className="h-2.5 rounded-full bg-signal" style={{ width: `${Math.min(100, (p.share / Math.max(p.target * 2, 0.01)) * 100)}%` }} />
                <span className="absolute top-[-3px] h-4 w-0.5 rounded bg-ink" style={{ left: "50%" }} title="Target" />
              </div>
              <p className="mt-1 text-[13px]">{p.about}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Content types */}
      <section aria-labelledby="types">
        <p className="label text-deepred">How each post is built</p>
        <h2 id="types" className="mt-2 text-[2.2rem] sm:text-[2.6rem]">
          Content <em>types</em>.
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed">Ava rotates formats and never repeats the last few, matching each type to the signal it earns best.</p>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {bal.types.map((t) => (
            <li key={t.key} className="rounded-[18px] bg-shell p-4 ring-1 ring-inset ring-[rgb(200_0_20/0.08)]">
              <p className="font-serif text-[1.2rem] leading-tight text-deepred">{t.label}</p>
              <p className="mt-1 text-[12.5px]">Best for {t.best.toLowerCase()}</p>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-blush" aria-hidden>
                  <div className="h-1.5 rounded-full bg-hot" style={{ width: `${(t.n / maxN) * 100}%` }} />
                </div>
                <span className="text-[12px] font-bold text-ink">{t.n}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12.5px]">{CONTENT_TYPES.length} types. Counts are the last 30 days.</p>
      </section>

      {/* Trend briefing */}
      <section aria-labelledby="trends" className="rounded-[32px] bg-peachcream px-6 py-10 ring-1 ring-inset ring-[rgb(251_101_38/0.14)] sm:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label text-deepred">Weekly research · Mondays 6:30 am</p>
            <h2 id="trends" className="mt-2 text-[2.2rem] sm:text-[2.6rem]">
              This week&apos;s <em>trends</em>.
            </h2>
            <p className="mt-1 text-[13px]">
              {isStarting ? "Starting briefing from the 22 November trend analysis." : `Researched ${date}.`} {lastRun ? `Last run: ${formatBrisbane(lastRun.createdAt)} (${lastRun.status}).` : ""}
            </p>
          </div>
          {user.role === "owner" && (
            <form action={runJobNow}>
              <input type="hidden" name="job" value="ava:trends" />
              <button className="btn btn-sm" disabled={!ai} title={ai ? "Ava researches now" : "Add the Anthropic key first"}>
                Research now
              </button>
            </form>
          )}
        </div>
        <p className="mt-6 max-w-3xl font-serif text-[1.45rem] font-light leading-snug text-ink">{briefing.summary}</p>
        <div className="mt-8 grid gap-8 md:grid-cols-2 xl:grid-cols-3">
          <List title="Platform changes" items={briefing.platformChanges} />
          <List title="Formats working" items={briefing.formatsWorking} />
          <List title="Conversations" items={briefing.conversations} />
          <List title="Tagline angles" items={briefing.taglineAngles} />
          <List title="Do this" items={briefing.doThis} />
          <List title="Avoid" items={briefing.avoid} />
        </div>
        {briefing.sources.length > 0 && (
          <div className="mt-8 border-t border-rosemist pt-4">
            <p className="label mb-2 text-deepred">Sources</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              {briefing.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!ai && (
          <p className="mt-6 text-[13.5px]">
            Ava needs the AI key to research each week and write live. <Link href="/settings#keys">Add it in Settings</Link>.
          </p>
        )}
      </section>
    </div>
  );
}
