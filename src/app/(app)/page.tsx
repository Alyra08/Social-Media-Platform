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
import { Icon, ShortcutFace, Tile } from "./overview-ui";

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

  const ICON: Record<string, string> = {
    "/news": "news", "/editorial": "brief", "/competitors": "eye", "/content": "check", "/design": "palette", "/website": "globe", "/brand": "book",
    "/planner": "calendar", "/publishing": "send", "/integrations": "plug", "/inbox": "chat", "/website/newsletter": "mail", "/website/events": "event", "/site": "globe",
    "/analytics": "chart", "/intelligence": "spark", "/archive": "archive", "/settings#keys": "key", "/settings": "sliders", "/notifications": "bell",
  };
  const shortcuts = [
    { icon: "palette", label: "Designs", href: "/design" },
    { icon: "brief", label: "New article", href: "/website" },
    { icon: "calendar", label: "Planner", href: "/planner" },
    { icon: "event", label: "Events", href: "/website/events" },
    { icon: "chat", label: "Inbox", href: "/inbox" },
    { icon: "mail", label: "Sunday note", href: "/website/newsletter" },
    { icon: "chart", label: "Analytics", href: "/analytics" },
  ];

  return (
    <div className="space-y-12">
      {/*
        Banner. Soft Blush field carries it; Signal Red arrives once, as an arch holding the poster line.
        Type: light serif headline, one handwritten word (brand allows one), Charcoal body. Motifs: arch + hearts.
      */}
      <section aria-labelledby="hero" className="relative overflow-hidden rounded-[32px] bg-blush ring-1 ring-inset ring-[rgb(200_0_20/0.06)]">
        <div className="grid grid-cols-1 items-stretch md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="relative px-6 py-10 sm:px-10 sm:py-14">
            <p className="label text-deepred">SBF Studio</p>
            <h1 id="hero" className="mt-4 text-[2.5rem] leading-[1.02] sm:text-6xl xl:text-[4.25rem]">
              What are we making{" "}
              <span className="script inline-block text-[1.25em] leading-none" style={{ transform: "translateY(0.08em)" }}>
                today?
              </span>
            </h1>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed">Research, write, design, publish and grow your community. Everything waits for your approval before it goes out.</p>
            <form action="/search" className="mt-7 flex max-w-xl items-center gap-2 rounded-full bg-shell py-1.5 pl-5 pr-1.5 ring-1 ring-inset ring-[rgb(200_0_20/0.12)] focus-within:ring-2 focus-within:ring-ink">
              <Icon name="search" className="h-5 w-5 shrink-0 text-deepred" />
              <label htmlFor="hero-q" className="sr-only">
                Search the studio
              </label>
              <input id="hero-q" name="q" placeholder="Search stories, posts, designs, comments" className="min-w-0 flex-1 bg-transparent py-2 text-[16px] text-ink outline-none placeholder:text-charcoal" />
              <button className="btn btn-primary btn-sm shrink-0">Search</button>
            </form>
          </div>

          {/* The one bright moment: a Signal Red arch with the poster line (white, large). */}
          <div aria-hidden className="relative hidden min-h-[320px] items-end justify-center overflow-hidden md:flex">
            <div className="relative mr-8 flex h-[88%] w-[72%] max-w-[300px] flex-col items-center justify-center rounded-t-full bg-signal px-6 pt-10 text-center">
              <p className="poster text-[2.6rem] leading-[0.92] text-white lg:text-5xl">Say it</p>
              <p className="poster text-[2.6rem] leading-[0.92] text-white lg:text-5xl">out loud.</p>
              <svg viewBox="0 0 100 60" className="mt-5 h-10 w-20">
                {[
                  [50, 14, 1],
                  [24, 34, 0.6],
                  [78, 36, 0.6],
                ].map(([x, y, s], k) => (
                  <path key={k} transform={`translate(${x} ${y}) scale(${s})`} d="M0 6C-8-6-22 4 0 20 22 4 8-6 0 6z" fill="var(--color-blush)" />
                ))}
              </svg>
            </div>
            <span className="absolute -bottom-6 right-0 h-36 w-24 rounded-t-full bg-rose opacity-80" />
          </div>
        </div>
      </section>

      {/* Round shortcuts, Canva-style. */}
      <nav aria-label="Quick actions" className="no-scrollbar -mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex justify-start gap-2 sm:justify-center sm:gap-4">
          <li>
            <form action={runResearchNow.bind(null, "daily")} className="flex w-20 shrink-0 flex-col items-center sm:w-24">
              <button className="group flex cursor-pointer flex-col items-center gap-2">
                <ShortcutFace icon="search" label="Run research" />
              </button>
            </form>
          </li>
          {shortcuts.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="group flex w-20 shrink-0 flex-col items-center gap-2 no-underline sm:w-24">
                <ShortcutFace icon={s.icon} label={s.label} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Needs you now, as a row of tiles. */}
      <section aria-labelledby="now">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="now" className="text-3xl">
            Needs you <em>now</em>.
          </h2>
          <p className="text-[13px]">{lastRun ? `Last research ${formatBrisbane(lastRun.startedAt)}` : "No research yet"}</p>
        </div>
        {todo.length === 0 ? (
          <p className="card text-[15px]">✓ You&apos;re all caught up.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {todo.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="card card-link flex h-full flex-col gap-1 p-4 text-ink no-underline">
                  <span className="kpi text-4xl">{t.n}</span>
                  <span className="text-[14px] font-bold leading-snug">{t.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Stage tabs. */}
      <nav id="how" aria-label="Studio stages" className="scroll-mt-6">
        <ul className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <li key={g.step} className="shrink-0">
              <a href={`#stage-${g.step}`} className="btn btn-sm bg-shell hover:bg-deepred">
                <span className="font-poster tracking-wide">{g.step.padStart(2, "0")}</span> {g.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {groups.map((g) => {
        const pv = previews[g.step];
        return (
          <section key={g.step} id={`stage-${g.step}`} aria-labelledby={`g-${g.step}`} className="scroll-mt-6">
            <div className="mb-5 flex flex-wrap items-end gap-x-5 gap-y-2">
              <span aria-hidden className="poster poster-outline text-5xl leading-none sm:text-6xl">
                {g.step.padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <h2 id={`g-${g.step}`} className="text-[1.9rem] sm:text-[2.3rem]">
                  {g.title}
                  <em>.</em>
                </h2>
                <p className="max-w-3xl text-[15px] leading-relaxed">{g.line}</p>
              </div>
              <p className="text-[12.5px] sm:max-w-xs sm:text-right">
                <span className="label mr-1 text-deepred">Runs on its own</span> {g.auto}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4">
              {g.items.map((item, idx) => (
                <Tile
                  key={item.href}
                  i={idx}
                  href={item.href}
                  icon={ICON[item.href] ?? "spark"}
                  title={item.title}
                  blurb={item.blurb}
                  value={item.value}
                  unit={item.unit}
                  pill={item.status ? { label: item.status.label, cls: PILL[item.status.tone] } : undefined}
                />
              ))}

              {(pv || g.step === "3" || g.step === "6") && (
                <div className="card col-span-2 flex flex-col gap-3 p-4 sm:p-5 md:col-span-1">
                  {pv && (
                    <div>
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
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-rosemist pt-3 text-center text-[12px]">
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
                    <div>
                      <p className="label mb-2 text-deepred">Set-up checklist</p>
                      <ul className="space-y-1.5 text-[14px]">
                        {setupChecklist.map((s) => (
                          <li key={s.label} className="flex items-center gap-2">
                            <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${s.on ? "bg-ink text-white" : "border border-deepred text-deepred"}`}>
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
                    </div>
                  )}
                </div>
              )}
            </div>

            {g.step === "5" && (
              <div className="mt-8">
                <OverviewAnalytics db={db} />
              </div>
            )}
          </section>
        );
      })}

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
