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
import { PageHeader, PLATFORM_LABEL } from "@/components/ui";
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
    <Link href={c.href} title={c.blurb} className="card group flex h-full flex-col gap-1.5 p-4 no-underline transition-colors hover:bg-white sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h3 className="font-serif text-lg font-light leading-tight text-signal group-hover:underline sm:text-xl">{c.title}</h3>
        {c.status && <span className={`${PILL[c.status.tone]} text-[0.68rem]`}>{c.status.label}</span>}
      </div>
      <p className="hidden text-[15px] leading-snug md:block">{c.blurb}</p>
      <p className="mt-auto flex items-baseline gap-2 pt-1">
        <span className="kpi text-2xl sm:text-3xl">{c.value}</span>
        <span className="text-sm leading-tight">{c.unit}</span>
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
  const templates = await c(db.select({ n }).from(designs).where(eq(designs.isTemplate, true)));
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

  const groups: { step: string; title: string; items: Capability[] }[] = [
    {
      step: "1",
      title: "Find what matters",
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
    <div className="space-y-10">
      <PageHeader eyebrow="Overview" title="Everything the studio does, in one place." emphasis="in one place">
        <form action={runResearchNow.bind(null, "daily")}>
          <button className="btn btn-primary">Run research now</button>
        </form>
      </PageHeader>

      <section aria-labelledby="now" className="card-tint">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <h2 id="now" className="text-2xl">
            Needs you now.
          </h2>
          {todo.length === 0 ? (
            <p className="text-[15px]">✓ You&apos;re all caught up.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {todo.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="btn btn-sm">
                    <span className="rounded-full bg-deepred px-2 text-white">{t.n}</span> {t.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm md:ml-auto">{lastRun ? `Last research ${formatBrisbane(lastRun.startedAt)}` : "No research yet"}</p>
        </div>
      </section>

      <div className="space-y-7">
        {groups.map((g) => (
          <section key={g.step} aria-labelledby={`g-${g.step}`}>
            <h2 id={`g-${g.step}`} className="mb-3 flex items-baseline gap-3 text-2xl">
              <span className="poster text-3xl" aria-hidden>
                {g.step}
              </span>
              {g.title}.
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
              {g.items.map((item) => (
                <CapabilityCard key={item.href} c={item} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="today" className="grid gap-6 lg:grid-cols-3">
        <h2 id="today" className="sr-only">
          This week
        </h2>
        <div className="card">
          <p className="label mb-2 text-deepred">Coming up this week</p>
          {upcoming.length === 0 ? (
            <p className="text-[15px]">Nothing scheduled yet.</p>
          ) : (
            <ul className="divide-y divide-rosemist text-[15px]">
              {upcoming.map((p) => (
                <li key={p.id} className="py-2">
                  <span className="label mr-2 text-deepred">{PLATFORM_LABEL[p.platform]}</span>
                  {p.hook}
                  <span className="block text-sm">{formatBrisbane(p.scheduledAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-rosemist pt-3 text-center text-sm">
            {[
              ["Planned", week.planned],
              ["Approving", week.awaitingApproval],
              ["Scheduled", week.scheduled],
              ["Published", week.published],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-col-reverse">
                <dt>{k}</dt>
                <dd className="font-bold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          {Object.keys(week.byCategory).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(week.byCategory).map(([k, v]) => (
                <span key={k} className="pill">
                  {CATEGORY_LABELS[k] ?? k}: {v}
                </span>
              ))}
            </div>
          )}
        </div>

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
