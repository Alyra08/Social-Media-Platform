import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, interactions, notifications, posts, stories } from "@/db/schema";
import { devAutoLoginActive, requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/client";
import { ensureSeed } from "@/lib/seed";
import { Nav } from "@/components/nav";
import { FlashToast } from "@/components/flash-toast";
import { CommandMenu, QuickFindButton } from "@/components/command-menu";
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
  const autoLogin = await devAutoLoginActive();
  const n = sql<number>`count(*)::int`;
  const [news, content, design, publishing, inbox, unread, website] = await Promise.all([
    count(db.select({ n }).from(stories).where(eq(stories.status, "pending"))),
    count(db.select({ n }).from(posts).where(inArray(posts.status, ["awaiting_content", "revision_requested"]))),
    count(db.select({ n }).from(posts).where(eq(posts.status, "awaiting_design"))),
    count(db.select({ n }).from(posts).where(inArray(posts.status, ["manual_required", "failed"]))),
    count(db.select({ n }).from(interactions).where(inArray(interactions.status, ["new", "drafted"]))),
    count(db.select({ n }).from(notifications).where(eq(notifications.read, false))),
    count(db.select({ n }).from(articles).where(eq(articles.status, "ready"))),
  ]);

  return (
    <div className="min-h-screen">
      <Stripe />
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-5 lg:flex-row lg:px-6">
        <aside className="no-scrollbar lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:rounded-[28px] lg:bg-blush lg:px-3 lg:py-6">
          <div className="flex items-center justify-between gap-3 lg:block">
            <Link href="/" className="no-underline lg:mb-6 lg:block lg:px-4">
              <Wordmark />
              <span className="font-serif text-[2.4rem] font-medium leading-none text-signal">
                Studio<span className="text-hot">.</span>
              </span>
            </Link>
            <Nav badges={{ news, content, design, publishing, inbox, website }} />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <form action="/search" className="min-w-0 flex-1 basis-48">
              <label className="sr-only" htmlFor="q">
                Search everything
              </label>
              <input id="q" name="q" className="input" placeholder="Search stories, posts, briefs, assets, comments" />
            </form>
            <QuickFindButton />
            <CommandMenu />
            <Link href="/notifications" className="btn btn-sm" aria-label={`Notifications, ${unread} unread`}>
              Notifications {unread > 0 && <span className="rounded-full bg-deepred px-2 text-white">{unread}</span>}
            </Link>
            <form action={logoutAction}>
              <button className="btn btn-sm" title={user.email}>
                Sign out
              </button>
            </form>
          </div>
          {(autoLogin || !aiEnabled()) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
              {autoLogin && (
                <span className="block sm:inline" title="Remove SBF_DEV_AUTOLOGIN=1 from .env.local to turn the login back on. The live site always needs a login.">
                  <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-tangerine align-middle" />
                  <strong className="text-ink">Testing:</strong> login skipped on this computer
                </span>
              )}
              {!aiEnabled() && (
                <span className="block sm:inline">
                  <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-hot align-middle" />
                  <strong className="text-ink">Demo mode:</strong> research and captions are samples.
                  {" "}
                  <Link href="/settings#keys" className="font-bold">
                    Add the AI key
                  </Link>
                </span>
              )}
            </div>
          )}
          <main id="main" className="mt-4">{children}</main>
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
