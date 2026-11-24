import Link from "next/link";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accounts,
  activityLog,
  articles,
  assets,
  brandPreferences,
  briefs,
  competitors,
  designs,
  events,
  interactions,
  notifications,
  posts,
  reports,
  researchRuns,
  stories,
  subscribers,
} from "@/db/schema";
import { PLATFORM_LABEL } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { weeklyOverview } from "@/lib/analytics";
import { plannerWarnings } from "@/lib/planner";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { aiEnabled } from "@/lib/ai/client";
import { emailReady } from "@/lib/email";
import { canvaStatus } from "@/lib/canva";
import { keyStatuses } from "@/lib/keys";
import { JOBS } from "@/lib/jobs";
import { runResearchNow } from "./actions";
import { OverviewAnalytics } from "./overview-analytics";

type Tone = "attention" | "ok" | "setup" | "quiet";
type Capability = {
  href: string;
  title: string;
  blurb: string;
  value: number | string;
  unit: string;
  status?: { label: string; tone: Tone };
};

const PILL: Record<Tone, string> = { attention: "pill-red pill", ok: "pill-ok pill", setup: "pill-ink pill", quiet: "pill" };

function CapabilityCard({ c }: { c: Capability }) {
  return (
    <Link href={c.href} title={c.blurb} className="card card-link group flex h-full flex-col gap-2 p-4 text-charcoal no-underline sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
        <h3 className="font-serif text-xl font-light leading-tight text-deepred sm:text-[1.6rem]">{c.title}</h3>
        {c.status && <span className={`${PILL[c.status.tone]} text-[0.66rem]`}>{c.status.label}</span>}
      </div>
      <p className="hidden text-[14.5px] leading-relaxed md:block">{c.blurb}</p>
      <div className="rule mt-auto" />
      <p className="flex items-baseline gap-2 pt-1">
        <span className="kpi text-3xl sm:text-4xl">{c.value}</span>
        <span className="text-[13px] leading-tight">{c.unit}</span>
        <span aria-hidden className="ml-auto text-deepred opacity-0 transition-opacity group-hover:opacity-100">→</span>
      </p>
    </Link>
  );
}

export default async function Overview() {
  const db = await getDb();
  const n = sql<number>`count(*)::int`;
  const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
  const now = new Date();
  const weekStart = new Date(now.getTime() - ((now.getUTCDay() + 6) % 7) * 86400_000);
  weekStart.setUTCHours(-10, 0, 0, 0);
  const in7 = new Date(now.getTime() + 7 * 86400_000);

  const [
    pendingStories,
    briefCount,
    articlesReady,
    articlesLive,
    awaitingContent,
    awaitingDesign,
    brandAssets,
    scheduled,
    needsPublishing,
    liveAccounts,
    inboxOpen,
    subscribersConfirmed,
    upcomingEvents,
    publishedPosts,
    learnedPrefs,
    competitorCount,
    reportCount,
    unread,
    lastRun,
    upcoming,
    attention,
    activity,
    week,
    warnings,
    canva,
    keys,
  ] = await Promise.all([
    c(db.select({ n }).from(stories).where(eq(stories.status, "pending"))),
    c(db.select({ n }).from(briefs)),
    c(db.select({ n }).from(articles).where(eq(articles.status, "ready"))),
    c(db.select({ n }).from(articles).where(eq(articles.status, "published"))),
    c(db.select({ n }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested"]))),
    c(db.select({ n }).from(posts).where(eq(posts.status, "awaiting_design"))),
    c(db.select({ n }).from(assets)),
    c(db.select({ n }).from(posts).where(eq(posts.status, "scheduled"))),
    c(db.select({ n }).from(posts).where(inArray(posts.status, ["failed", "manual_required"]))),
    c(db.select({ n }).from(accounts).where(and(eq(accounts.status, "connected"), eq(accounts.mode, "live")))),
    c(db.select({ n }).from(interactions).where(inArray(interactions.status, ["new", "drafted"]))),
    c(db.select({ n }).from(subscribers).where(eq(subscribers.status, "confirmed"))),
    c(db.select({ n }).from(events).where(and(eq(events.status, "published"), gte(events.startsAt, now)))),
    c(db.select({ n }).from(posts).where(eq(posts.status, "published"))),
    c(db.select({ n }).from(brandPreferences).where(inArray(brandPreferences.state, ["learned", "confirmed"]))),
    c(db.select({ n }).from(competitors)),
    c(db.select({ n }).from(reports)),
    c(db.select({ n }).from(notifications).where(eq(notifications.read, false))),
    db.query.researchRuns.findFirst({ orderBy: desc(researchRuns.startedAt) }),
    db.select().from(posts).where(and(eq(posts.status, "scheduled"), gte(posts.scheduledAt, now), lte(posts.scheduledAt, in7))).orderBy(posts.scheduledAt).limit(6),
    db.select().from(notifications).where(and(eq(notifications.requiresAttention, true), eq(notifications.read, false))).orderBy(desc(notifications.createdAt)).limit(5),
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(6),
    weeklyOverview(db, weekStart),
    plannerWarnings(db, now, in7),
    canvaStatus(db),
    keyStatuses(db),
  ]);
  const [templates, topStories, toApprove, nextEvents, openComments] = await Promise.all([
    c(db.select({ n }).from(designs).where(eq(designs.isTemplate, true))),
    db.select({ id: stories.id, headline: stories.headline, category: stories.category, score: stories.relevanceScore }).from(stories).where(eq(stories.status, "pending")).orderBy(desc(stories.relevanceScore)).limit(3),
    db.select({ id: posts.id, hook: posts.hook, platform: posts.platform }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested", "awaiting_design"])).orderBy(desc(posts.createdAt)).limit(3),
    db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(events).where(and(eq(events.status, "published"), gte(events.startsAt, now))).orderBy(events.startsAt).limit(2),
    db.select({ id: interactions.id, author: interactions.author, text: interactions.text, platform: interactions.platform }).from(interactions).where(inArray(interactions.status, ["new", "drafted"])).orderBy(desc(interactions.priority)).limit(2),
  ]);
  const ai = aiEnabled();
  const email = emailReady();
  const keysAdded = keys.filter((k) => k.source !== "none").length;

  const todo = [
    { n: pendingStories, label: pendingStories === 1 ? "story to review" : "stories to review", href: "/news" },
    { n: awaitingContent, label: "posts to approve", href: "/content" },
    { n: awaitingDesign, label: awaitingDesign === 1 ? "design to approve" : "designs to approve", href: "/design" },
    { n: articlesReady, label: articlesReady === 1 ? "article to approve" : "articles to approve", href: "/website?status=ready" },
    { n: needsPublishing, label: "posts need publishing help", href: "/publishing" },
    { n: inboxOpen, label: inboxOpen === 1 ? "comment to answer" : "comments to answer", href: "/inbox" },
  ].filter((t) => t.n > 0);

  const previewItem = (key: string, href: string, title: string, meta: string) => ({ key, href, title, meta });
  const previews: Record<string, { empty: string; items: { key: string; href: string; title: string; meta: string }[] }> = {
    "1": { empty: "No stories waiting. The next research run is at 6:00 am.", items: topStories.map((s) => previewItem(s.id, "/news", s.headline, `${CATEGORY_LABELS[s.category] ?? s.category} · relevance ${s.score}`)) },
    "2": { empty: "Nothing waiting for approval.", items: toApprove.map((p) => previewItem(p.id, "/content", p.hook || "Untitled post", PLATFORM_LABEL[p.platform] ?? p.platform)) },
    "3": { empty: "Nothing scheduled in the next 7 days.", items: upcoming.slice(0, 3).map((p) => previewItem(p.id, "/planner", p.hook || "Untitled post", `${PLATFORM_LABEL[p.platform] ?? p.platform} · ${p.scheduledAt ? formatBrisbane(p.scheduledAt) : ""}`)) },
    "4": {
      empty: "No comments waiting and no events coming up.",
      items: [
        ...nextEvents.map((e) => previewItem(e.id, `/website/events/${e.id}`, e.title, `Event · ${formatBrisbane(e.startsAt)}`)),
        ...openComments.map((i) => previewItem(i.id, "/inbox", i.text.length > 80 ? `${i.text.slice(0, 80)}…` : i.text, `${i.author} · ${PLATFORM_LABEL[i.platform] ?? i.platform}`)),
      ],
    },
  };
  const setupChecklist = [
    { label: "AI research and writing", on: ai, href: "/settings#keys" },
    { label: "Email for the Sunday note", on: email, href: "/settings#keys" },
    { label: "Canva", on: canva.connected, href: "/integrations" },
    { label: "A social account", on: liveAccounts > 0, href: "/integrations" },
  ];

  const groups: { step: string; title: string; line: string; auto: string; stat: string; tint: string; items: Capability[] }[] = [
    {
      step: "1",
      title: "Find what matters",
      line: "The studio reads the news for you, scores each story for relevance to SBF and turns the ones you approve into briefs.",
      auto: "Research every morning at 6:00 am, competitor check weekly.",
      stat: `${pendingStories} to review`,
      tint: "bg-shell",
      items: [
        {
          href: "/news",
          title: "Daily news",
          blurb: "Research every morning at 6:00 am on what's affecting women. Approve, deny or save each story.",
          value: pendingStories,
          unit: "waiting for you",
          status: pendingStories ? { label: "Needs you", tone: "attention" } : ai ? { label: "Live research", tone: "ok" } : { label: "Demo mode", tone: "setup" },
        },
        {
          href: "/editorial",
          title: "Editorial briefs",
          blurb: "Every approved story becomes a full brief: angle, outline, sources, SEO and headlines.",
          value: briefCount,
          unit: briefCount === 1 ? "brief" : "briefs",
        },
        {
          href: "/competitors",
          title: "Competitors",
          blurb: "Weekly look at what similar brands are posting and where the gaps are.",
          value: competitorCount,
          unit: "being watched",
        },
      ],
    },
    {
      step: "2",
      title: "Create and approve",
      line: "Captions, designs and full articles, drafted in your voice and checked against the brand brief. Nothing goes anywhere until you approve it.",
      auto: "Brand check on every draft; approval resets if anything changes.",
      stat: `${awaitingContent + awaitingDesign + articlesReady} to approve`,
      tint: "bg-peachcream",
      items: [
        {
          href: "/content",
          title: "Content approval",
          blurb: "Captions and copy for every platform, brand-checked before you see them. Edit, approve or ask for changes.",
          value: awaitingContent,
          unit: "to approve",
          status: awaitingContent ? { label: "Needs you", tone: "attention" } : undefined,
        },
        {
          href: "/design",
          title: "Design approval",
          blurb: "On-brand designs for each post. Give feedback in plain words, upload your own, or edit in Canva.",
          value: awaitingDesign,
          unit: "to approve",
          status: awaitingDesign ? { label: "Needs you", tone: "attention" } : canva.connected ? { label: "Canva on", tone: "ok" } : undefined,
        },
        {
          href: "/website",
          title: "Website articles",
          blurb: "Write, brand-check, preview and publish full articles to the public website.",
          value: articlesLive,
          unit: `live${articlesReady ? ` · ${articlesReady} to approve` : ""}`,
          status: articlesReady ? { label: "Needs you", tone: "attention" } : undefined,
        },
        {
          href: "/brand",
          title: "Brand library",
          blurb: "Your brand brief, logos, fonts, photos and templates. Everything the studio creates follows it.",
          value: brandAssets + templates,
          unit: "files and templates",
        },
      ],
    },
    {
      step: "3",
      title: "Schedule and publish",
      line: "Approved posts land on the calendar at the best time for each platform, then go out on their own. If anything fails, you hear about it.",
      auto: "Publishing checks every few minutes, with retries.",
      stat: `${scheduled} scheduled`,
      tint: "bg-shell",
      items: [
        {
          href: "/planner",
          title: "Planner",
          blurb: "Calendar of everything planned, with recommended posting times and spacing warnings.",
          value: scheduled,
          unit: "scheduled",
          status: warnings.length ? { label: `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}`, tone: "quiet" } : undefined,
        },
        {
          href: "/publishing",
          title: "Publishing",
          blurb: "Posts go out on time through each network. Anything that fails or needs a manual post shows here.",
          value: needsPublishing,
          unit: "need attention",
          status: needsPublishing ? { label: "Needs you", tone: "attention" } : undefined,
        },
        {
          href: "/integrations",
          title: "Integrations",
          blurb: "Connect Instagram, Facebook, TikTok, LinkedIn, Pinterest, Threads, X, Bluesky, YouTube and Canva.",
          value: liveAccounts,
          unit: liveAccounts === 1 ? "account connected" : "accounts connected",
          status: liveAccounts ? { label: "Connected", tone: "ok" } : { label: "Not connected", tone: "setup" },
        },
      ],
    },
    {
      step: "4",
      title: "Your community",
      line: "Comments and messages in one inbox, the Sunday note, events with RSVPs and the public website where it all lives.",
      auto: "Comments sorted by priority; sensitive ones always come to you.",
      stat: `${subscribersConfirmed} ${subscribersConfirmed === 1 ? "subscriber" : "subscribers"}`,
      tint: "bg-peachcream",
      items: [
        {
          href: "/inbox",
          title: "Community inbox",
          blurb: "Comments and messages sorted by priority, with suggested replies. Sensitive ones always come to you.",
          value: inboxOpen,
          unit: "to answer",
          status: inboxOpen ? { label: "Needs you", tone: "attention" } : undefined,
        },
        {
          href: "/website/newsletter",
          title: "Sunday note",
          blurb: "Newsletter sign-ups from the website, and a weekly email you approve before it sends.",
          value: subscribersConfirmed,
          unit: subscribersConfirmed === 1 ? "subscriber" : "subscribers",
          status: email ? { label: "Email on", tone: "ok" } : { label: "Email not set up", tone: "setup" },
        },
        {
          href: "/website/events",
          title: "Events",
          blurb: "Circles, workshops and meetups with RSVPs, places and a waitlist.",
          value: upcomingEvents,
          unit: "coming up",
        },
        {
          href: "/site",
          title: "Public website",
          blurb: "What the public sees: your stories, a searchable hub, events and the Sunday note sign-up.",
          value: articlesLive,
          unit: articlesLive === 1 ? "story online" : "stories online",
          status: { label: "Public", tone: "quiet" },
        },
      ],
    },
    {
      step: "5",
      title: "Learn and improve",
      line: "Real results from every platform, the signals the algorithms reward, and what the studio has learned from your approvals.",
      auto: "Results collected daily; reports weekly, monthly and quarterly.",
      stat: `${learnedPrefs} learned`,
      tint: "bg-shell",
      items: [
        {
          href: "/analytics",
          title: "Analytics",
          blurb: "Reach, engagement and what's working, with weekly, monthly and quarterly reports.",
          value: reportCount,
          unit: reportCount === 1 ? "report" : "reports",
        },
        {
          href: "/intelligence",
          title: "Brand intelligence",
          blurb: "What the studio has learned from your approvals and edits. Confirm, rewrite or dismiss each one.",
          value: learnedPrefs,
          unit: "preferences learned",
        },
        {
          href: "/archive",
          title: "Archive",
          blurb: "Every published post with its research, approvals, designs and results.",
          value: publishedPosts,
          unit: "published",
        },
      ],
    },
    {
      step: "6",
      title: "Set up and settings",
      line: "Add keys and accounts whenever you're ready. Each one switches its part of the studio on straight away.",
      auto: `${Object.keys(JOBS).length} jobs run on their own once set up.`,
      stat: `${setupChecklist.filter((s) => s.on).length} of ${setupChecklist.length} on`,
      tint: "bg-peachcream",
      items: [
        {
          href: "/settings#keys",
          title: "Keys and connections",
          blurb: "Add API keys whenever you're ready: Anthropic, email, Canva and each social network.",
          value: `${keysAdded}/${keys.length}`,
          unit: "added",
          status: ai ? { label: "AI on", tone: "ok" } : { label: "Add AI key", tone: "setup" },
        },
        {
          href: "/settings",
          title: "Settings and automation",
          blurb: "Schedules, posting limits, editorial balance, auto-replies, your team and the audit log.",
          value: Object.keys(JOBS).length,
          unit: "automated jobs",
        },
        {
          href: "/notifications",
          title: "Notifications",
          blurb: "Everything the studio has told you, in one place.",
          value: unread,
          unit: "unread",
        },
      ],
    },
  ];

  return (
    <div className="space-y-12">
      {/* Hero: one poster statement, the day's to-dos beside it. Motifs: arch + stripe. */}
      <section aria-labelledby="hero" className="card relative overflow-hidden p-6 sm:p-10">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-6 hidden h-72 w-56 rounded-t-full bg-rose opacity-60 lg:block" />
        <div className="relative grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-end">
          <div>
            <p className="label text-deepred">SBF Studio · overview</p>
            <h1 id="hero" className="sr-only">
              Find it. Make it. Say it out loud.
            </h1>
            <p aria-hidden className="poster mt-4 text-[2.6rem] sm:text-6xl xl:text-7xl">
              Find it. Make it.
            </p>
            <p aria-hidden className="poster poster-outline text-[2.6rem] sm:text-6xl xl:text-7xl">
              Say it out loud.
            </p>
            <p className="mt-5 max-w-xl font-serif text-xl font-light leading-snug text-ink sm:text-2xl">
              Research, writing, design, publishing, community and results, in one studio. <em className="text-deepred">You approve everything</em> before it goes out.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <form action={runResearchNow.bind(null, "daily")}>
                <button className="btn btn-primary">Run research now</button>
              </form>
              <a href="#how" className="btn">
                See how it works
              </a>
            </div>
          </div>

          <div className="card-tint relative">
            <h2 id="now" className="text-3xl">
              Needs you <em>now</em>.
            </h2>
            {todo.length === 0 ? (
              <p className="mt-3 text-[15px]">✓ You&apos;re all caught up.</p>
            ) : (
              <ul className="mt-3 divide-y divide-rosemist">
                {todo.map((t) => (
                  <li key={t.href}>
                    <Link href={t.href} className="group flex items-baseline gap-3 py-2.5 text-ink no-underline">
                      <span className="kpi w-10 text-3xl">{t.n}</span>
                      <span className="text-[15px] font-bold group-hover:underline">{t.label}</span>
                      <span aria-hidden className="ml-auto text-deepred">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[13px]">{lastRun ? `Last research ${formatBrisbane(lastRun.startedAt)}` : "No research yet"}</p>
          </div>
        </div>
      </section>

      {/* How it works: the six stages as one flow, each jumping to its band. */}
      <section id="how" aria-labelledby="how-title" className="scroll-mt-6">
        <div className="mb-5 flex items-center gap-4">
          <h2 id="how-title" className="text-[1.7rem] sm:text-3xl">
            How the studio <em>works</em>.
          </h2>
          <div className="rule flex-1" aria-hidden />
        </div>
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {groups.map((g) => (
            <li key={g.step}>
              <a href={`#stage-${g.step}`} className="card card-link group flex h-full flex-col gap-1 p-4 text-charcoal no-underline">
                <span aria-hidden className="poster poster-outline text-4xl">
                  {g.step.padStart(2, "0")}
                </span>
                <span className="font-serif text-lg font-light leading-tight text-deepred sm:text-xl">{g.title}</span>
                <span className="mt-auto pt-2 text-[12.5px] font-bold text-ink">{g.stat}</span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      {/* One band per stage: what it does, what runs on its own, what's in it right now, and its tools. */}
      <div className="space-y-6">
        {groups.map((g) => {
          const pv = previews[g.step];
          return (
            <section key={g.step} id={`stage-${g.step}`} aria-labelledby={`g-${g.step}`} className={`scroll-mt-6 rounded-[28px] ${g.tint} p-5 sm:p-8`}>
              <div className="grid gap-6 lg:grid-cols-[19rem_1fr] lg:gap-8">
                <div className="flex flex-col gap-3">
                  <span aria-hidden className="poster poster-outline text-6xl leading-none sm:text-7xl">
                    {g.step.padStart(2, "0")}
                  </span>
                  <h2 id={`g-${g.step}`} className="text-[1.9rem] sm:text-[2.2rem]">
                    {g.title}
                    <em>.</em>
                  </h2>
                  <p className="text-[15px] leading-relaxed">{g.line}</p>
                  <p className="text-[13px]">
                    <span className="label mr-1 text-deepred">Runs on its own</span> {g.auto}
                  </p>

                  {pv && (
                    <div className="mt-1 rounded-[18px] border border-rosemist bg-shell p-4">
                      <p className="label mb-2 text-deepred">Right now</p>
                      {pv.items.length === 0 ? (
                        <p className="text-[14px]">{pv.empty}</p>
                      ) : (
                        <ul className="space-y-2.5">
                          {pv.items.map((it) => (
                            <li key={it.key}>
                              <Link href={it.href} className="block text-[14px] font-bold leading-snug text-ink no-underline hover:underline">
                                {it.title}
                              </Link>
                              <span className="block text-[12px]">{it.meta}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {g.step === "3" && (
                    <dl className="mt-1 grid grid-cols-4 gap-2 rounded-[18px] border border-rosemist bg-shell p-3 text-center text-[12px]">
                      {[
                        ["Planned", week.planned],
                        ["Approving", week.awaitingApproval],
                        ["Scheduled", week.scheduled],
                        ["Published", week.published],
                      ].map(([k, v]) => (
                        <div key={k} className="flex flex-col-reverse">
                          <dt>{k}</dt>
                          <dd className="kpi text-2xl">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {g.step === "6" && (
                    <ul className="mt-1 space-y-1.5 rounded-[18px] border border-rosemist bg-shell p-4 text-[14px]">
                      {setupChecklist.map((s) => (
                        <li key={s.label} className="flex items-center gap-2">
                          <span aria-hidden className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${s.on ? "bg-ink text-white" : "border border-deepred text-deepred"}`}>
                            {s.on ? "✓" : ""}
                          </span>
                          <span className={s.on ? "text-ink" : ""}>{s.label}</span>
                          {!s.on && (
                            <Link href={s.href} className="ml-auto text-[12px] font-bold">
                              Set up
                            </Link>
                          )}
                          <span className="sr-only">{s.on ? "is on" : "is not set up"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid content-start gap-3 sm:grid-cols-2 md:gap-4 2xl:grid-cols-3">
                  {g.items.map((item) => (
                    <CapabilityCard key={item.href} c={item} />
                  ))}
                </div>

                {g.step === "5" && (
                  <div className="lg:col-span-2">
                    <OverviewAnalytics db={db} />
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section aria-labelledby="today" className="grid gap-6 lg:grid-cols-2">
        <h2 id="today" className="sr-only">
          Alerts and activity
        </h2>
        <div className="card">
          <p className="label mb-2 text-deepred">Alerts</p>
          {attention.length === 0 && warnings.length === 0 ? (
            <p className="text-[15px]">✓ Nothing needs your attention.</p>
          ) : (
            <ul className="space-y-2 text-[15px]">
              {attention.map((a) => (
                <li key={a.id}>
                  <Link href={a.link ?? "/notifications"} className="font-bold text-ink">
                    {a.title}
                  </Link>
                  {a.body && <span className="block text-sm">{a.body}</span>}
                </li>
              ))}
              {warnings.slice(0, 3).map((w) => (
                <li key={w} className="text-sm">
                  Planner: {w}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card text-sm">
          <p className="label mb-2 text-deepred">Automation activity</p>
          <ul className="space-y-1">
            {activity.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {a.status === "failed" ? "✕" : a.status === "ok" ? "✓" : "·"} {a.job}
                </span>
                <span className="shrink-0">{formatBrisbane(a.createdAt)}</span>
              </li>
            ))}
          </ul>
          <Link href="/settings#activity" className="mt-2 inline-block">
            See the full activity log
          </Link>
        </div>
      </section>
    </div>
  );
}
