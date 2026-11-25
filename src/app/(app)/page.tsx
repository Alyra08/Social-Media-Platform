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
import { requireUser } from "@/lib/auth";
import { emailReady } from "@/lib/email";
import { canvaStatus } from "@/lib/canva";
import { keyStatuses } from "@/lib/keys";
import { JOBS } from "@/lib/jobs";
import { runResearchNow } from "./actions";
import { OverviewAnalytics } from "./overview-analytics";
import { Icon, Tile } from "./overview-ui";
import { HeroSearch } from "./hero-search";

const STAGE_ICON: Record<string, string> = { "1": "search", "2": "palette", "3": "calendar", "4": "chat", "5": "chart", "6": "sliders" };

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
  const me = await requireUser("viewer");
  const firstName = (me.name || me.email.split("@")[0]).trim().split(/\s+/)[0] || "there";
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
  const [templates, topStories, toApprove, nextEvents, openComments, studioDrafts, avaDrafted] = await Promise.all([
    c(db.select({ n }).from(designs).where(eq(designs.isTemplate, true))),
    db.select({ id: stories.id, headline: stories.headline, category: stories.category, score: stories.relevanceScore }).from(stories).where(eq(stories.status, "pending")).orderBy(desc(stories.relevanceScore)).limit(3),
    db.select({ id: posts.id, hook: posts.hook, platform: posts.platform }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested", "awaiting_design"])).orderBy(desc(posts.createdAt)).limit(3),
    db.select({ id: events.id, title: events.title, startsAt: events.startsAt }).from(events).where(and(eq(events.status, "published"), gte(events.startsAt, now))).orderBy(events.startsAt).limit(2),
    db.select({ id: interactions.id, author: interactions.author, text: interactions.text, platform: interactions.platform }).from(interactions).where(inArray(interactions.status, ["new", "drafted"])).orderBy(desc(interactions.priority)).limit(2),
    c(db.select({ n }).from(designs).where(and(eq(designs.source, "studio"), eq(designs.status, "draft")))),
    c(db.select({ n }).from(posts).where(eq(posts.author, "ava"))),
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
          href: "/create",
          title: "Design studio",
          blurb: "Describe a post and the studio drafts the copy and design, then edit everything in the visual editor.",
          value: studioDrafts,
          unit: studioDrafts === 1 ? "draft in progress" : "drafts in progress",
          status: { label: "New", tone: "ok" },
        },
        {
          href: "/ava",
          title: "Ava, captions",
          blurb: "Your caption specialist: SEO-aware, algorithm-savvy, rotates pillars and formats, researches trends weekly.",
          value: avaDrafted,
          unit: "captions drafted",
          status: ai ? { label: "Writing live", tone: "ok" } : { label: "Add AI key", tone: "setup" },
        },
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
    "/analytics": "chart", "/intelligence": "spark", "/archive": "archive", "/settings#keys": "key", "/settings": "sliders", "/notifications": "bell", "/create": "plus", "/ava": "spark",
  };
  // Welcome tiles: white cards, red line icon, bold name, one live line. Icon beside text on phones, above it from tablet up.
  const welcomeTileCls =
    "group flex h-full items-start gap-3.5 rounded-[22px] bg-white p-4 text-left no-underline ring-1 ring-inset ring-[rgb(158_9_98/0.1)] transition-all duration-200 hover:-translate-y-1 hover:ring-[rgb(158_9_98/0.3)] sm:flex-col sm:gap-4 sm:p-5";
  const welcomeIconCls = "h-7 w-7 shrink-0 text-signal transition-transform group-hover:scale-110 sm:h-8 sm:w-8";

  return (
    <div className="space-y-16">
      {/*
        Banner: the owner's confetti photograph fills the top, with a flat white veil so the type stays readable
        (Deep Ink headline 10:1, Deep Red script word 3.6:1 at display size). Summary cards overlap its bottom edge.
      */}
      <div>
        <section aria-labelledby="hero" className="relative isolate min-h-[560px] overflow-hidden rounded-t-[32px] sm:min-h-[660px] xl:min-h-[720px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/overview-hero-2400.jpg"
            srcSet="/images/overview-hero-1200.webp 1200w, /images/overview-hero-2400.webp 2400w"
            sizes="(max-width: 1024px) 100vw, 1200px"
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover object-top [mask-image:linear-gradient(to_bottom,#000_58%,transparent_100%)]"
            fetchPriority="high"
          />
          {/* Flat white veil for legibility; the photo itself feathers into the white page at the bottom (owner request). */}
          <div aria-hidden className="absolute inset-0 -z-10 bg-white/35" />
          <div className="flex min-h-[560px] flex-col items-center justify-end px-6 pb-32 pt-56 text-center sm:min-h-[660px] sm:px-10 sm:pb-36 sm:pt-52 xl:min-h-[720px]">
            <h1 id="hero" className="text-[2.6rem] font-medium leading-[1.02] text-ink sm:text-6xl xl:text-[4.4rem]">
              Welcome back, <em className="text-deepred">{firstName}</em>.
            </h1>
            <p className="mt-3 text-[17px] text-ink sm:text-[19px]">
              What are we making{" "}
              <span className="script inline-block text-[1.7em] leading-none text-deepred" style={{ transform: "translateY(0.12em)" }}>
                today?
              </span>
            </p>
            <HeroSearch />
          </div>
        </section>


        {/* How it works: six steps as round icons joined by a dashed line, over the banner's faded edge; each jumps to its section. */}
        <nav id="how" aria-labelledby="how-title" className="relative z-10 -mt-24 scroll-mt-6 px-3 sm:px-6">
        <h2 id="how-title" className="mb-8 text-center text-[1.9rem] text-charcoal sm:text-[2.3rem]">
          How the studio <em className="text-deepred">works</em>.
        </h2>
        <ol className="relative grid grid-cols-3 gap-x-2 gap-y-8 sm:grid-cols-6">
          {/* Dashed connector behind the circles (one row on wider screens). */}
          <span aria-hidden className="absolute left-[8.33%] right-[8.33%] top-8 hidden border-t-2 border-dashed border-rose sm:block" />
          {groups.map((g) => (
            <li key={g.step} className="relative">
              <a href={`#stage-${g.step}`} className="group flex flex-col items-center gap-3 text-center no-underline">
                <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-blush text-deepred ring-4 ring-white transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-signal group-hover:text-white">
                  <Icon name={STAGE_ICON[g.step] ?? "spark"} className="h-7 w-7" />
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-signal text-[11px] font-bold text-white ring-2 ring-white">{g.step}</span>
                </span>
                <span className="max-w-[9rem] text-[14px] font-semibold leading-snug text-ink group-hover:text-deepred">{g.title}</span>
                <span className="-mt-2 text-[12.5px] text-charcoal">{g.stat}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

        {/* Nine welcome tiles: icon, name and a live line each. */}
        <nav aria-label="Start here" className="relative z-10 mx-auto mt-12 max-w-5xl px-3 sm:px-6">
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <li>
              <form action={runResearchNow.bind(null, "daily")} className="h-full">
                <button className={`${welcomeTileCls} w-full cursor-pointer`}>
                  <Icon name="search" className={welcomeIconCls} />
                  <span className="min-w-0">
                    <span className="block text-[16px] font-bold leading-tight text-ink">Run research</span>
                    <span className="mt-1 block text-[13.5px] leading-snug text-charcoal">
                      Find fresh stories now. {pendingStories ? `${pendingStories} waiting to review.` : "Nothing waiting to review."}
                    </span>
                  </span>
                </button>
              </form>
            </li>
            {[
              { href: "/create", icon: "plus", title: "Create a post", body: "Describe it in your words. The studio drafts the copy and design." },
              { href: "/design", icon: "palette", title: "Designs", body: awaitingDesign ? `${awaitingDesign} to approve. Edit in the studio or Canva.` : "Approve and edit designs, in the studio or Canva." },
              { href: "/website", icon: "brief", title: "New article", body: "Write, brand-check and publish to your website." },
              { href: "/planner", icon: "calendar", title: "Planner", body: `${week.scheduled} scheduled this week. Calendar and Instagram grid.` },
              { href: "/website/events", icon: "event", title: "Events", body: upcomingEvents ? `${upcomingEvents} coming up. Circles, RSVPs and waitlists.` : "Circles, workshops, RSVPs and waitlists." },
              { href: "/inbox", icon: "chat", title: "Inbox", body: inboxOpen ? `${inboxOpen} to answer, sorted by priority.` : "Comments and messages, sorted by priority." },
              { href: "/website/newsletter", icon: "mail", title: "Newsletter", body: `${subscribersConfirmed} ${subscribersConfirmed === 1 ? "subscriber" : "subscribers"}. Draft and send the Sunday note.` },
              { href: "/analytics", icon: "chart", title: "Analytics", body: "Reach, saves and what to post next." },
            ].map((t) => (
              <li key={t.href}>
                <Link href={t.href} className={welcomeTileCls}>
                  <Icon name={t.icon} className={welcomeIconCls} />
                  <span className="min-w-0">
                    <span className="block text-[16px] font-bold leading-tight text-ink">{t.title}</span>
                    <span className="mt-1 block text-[13.5px] leading-snug text-charcoal">{t.body}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-4 px-3 text-center text-[12.5px] leading-snug text-charcoal">
          {todo.length > 0 && (
            <>
              <strong className="text-ink">Needs you:</strong>{" "}
              {todo.map((t, i) => (
                <span key={t.href}>
                  {i > 0 && ", "}
                  <Link href={t.href} className="font-bold">
                    {t.n} {t.label}
                  </Link>
                </span>
              ))}
              {" · "}
            </>
          )}
          {lastRun ? `Last research ${formatBrisbane(lastRun.startedAt)}` : "No research yet"} ·{" "}
          <Link href="/ava" className="font-bold">
            Ava&apos;s weekly trends
          </Link>
        </p>
      </div>

      {groups.map((g) => {
        const pv = previews[g.step];
        return (
          <section key={g.step} id={`stage-${g.step}`} aria-labelledby={`g-${g.step}`} className="scroll-mt-6">
            {/* Editorial header: small stage label, large light serif title, one sentence, then what runs by itself. */}
            <div className="mb-7 grid gap-x-10 gap-y-3 md:grid-cols-[minmax(0,1fr)_16rem] md:items-end">
              <div className="min-w-0">
                <h2 id={`g-${g.step}`} className="text-[2.2rem] font-medium sm:text-[2.9rem]">
                  {g.title}
                  <em>.</em>
                </h2>
                <p className="mt-2 max-w-2xl text-[15.5px] leading-[1.45]">{g.line}</p>
              </div>
              <p className="border-l-2 border-rose pl-4 text-[13px] leading-snug">
                <span className="block font-serif text-[1.05rem] italic text-deepred">Runs on its own</span>
                {g.auto}
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
