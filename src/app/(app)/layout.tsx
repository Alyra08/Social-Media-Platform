import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { interactions, notifications, posts, stories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/client";
import { ensureSeed } from "@/lib/seed";
import { Nav } from "@/components/nav";
import { FlashToast } from "@/components/flash-toast";
import { Stripe, Wordmark } from "@/components/ui";
import { logoutAction } from "./actions";
import { nowMs } from "@/lib/time";

async function count(q: Promise<{ n: number }[]>) {
  return (await q)[0]?.n ?? 0;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  await ensureSeed(db);
  const user = await requireUser();
  const n = sql<number>`count(*)::int`;
  const [news, content, design, publishing, inbox, unread] = await Promise.all([
    count(db.select({ n }).from(stories).where(eq(stories.status, "pending"))),
    count(db.select({ n }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested"]))),
    count(db.select({ n }).from(posts).where(eq(posts.status, "awaiting_design"))),
    count(db.select({ n }).from(posts).where(inArray(posts.status, ["manual_required", "failed"]))),
    count(db.select({ n }).from(interactions).where(inArray(interactions.status, ["new", "drafted"]))),
    count(db.select({ n }).from(notifications).where(eq(notifications.read, false))),
  ]);

  return (
    <div className="min-h-screen">
      <Stripe />
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-5 lg:flex-row lg:px-6">
        <aside className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto">
          <div className="flex items-center justify-between gap-3 lg:mb-6 lg:block">
            <Link href="/" className="no-underline">
              <Wordmark />
              <span className="label mt-1 block text-deepred">Studio</span>
            </Link>
            <Nav badges={{ news, content, design, publishing, inbox }} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <form action="/search" className="min-w-0 flex-1 basis-full sm:basis-auto">
              <label className="sr-only" htmlFor="q">
                Search everything
              </label>
              <input id="q" name="q" className="input" placeholder="Search stories, posts, briefs, assets, comments" />
            </form>
            <Link href="/notifications" className="btn btn-sm" aria-label={`Notifications, ${unread} unread`}>
              Notifications {unread > 0 && <span className="rounded-full bg-deepred px-2 text-white">{unread}</span>}
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-sm" title={user.email}>
                Sign out
              </button>
            </form>
          </div>
          {!aiEnabled() && (
            <div className="card-tint mb-6 text-sm">
              <strong className="text-ink">Demo mode.</strong> Research, briefs and captions are clearly marked samples until an Anthropic API key is added to <code>.env.local</code>. Nothing in demo mode is real research, and demo posts can only go to sandbox accounts.
            </div>
          )}
          <main id="main">{children}</main>
          <footer className="mt-16">
            <Stripe />
            <p className="label mt-3 text-deepred">Unapologetically fierce. Beautifully imperfect.</p>
          </footer>
        </div>
      </div>
      <FlashToast tick={String(nowMs())} />
    </div>
  );
}
