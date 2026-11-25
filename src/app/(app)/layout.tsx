import Link from "next/link";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { articles, interactions, notifications, posts, stories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureSeed } from "@/lib/seed";
import { Nav } from "@/components/nav";
import { FlashToast } from "@/components/flash-toast";
import { CommandMenu } from "@/components/command-menu";
import { Icon } from "./overview-ui";
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
      {/* Sidebar beside the page from tablet width (768px) up. */}
      <div className="mx-auto flex max-w-[1500px] flex-row gap-3 px-2 py-3 sm:gap-4 sm:px-3 md:gap-5 md:px-5 md:py-5 lg:gap-6 lg:px-6">
        <aside className="no-scrollbar sticky top-3 h-[calc(100vh-1.5rem)] w-14 shrink-0 overflow-y-auto rounded-[22px] bg-blush px-1 py-3 md:top-5 md:h-[calc(100vh-2.5rem)] md:w-56 md:rounded-[28px] md:px-2 md:py-6 lg:w-64 lg:px-3">
          <div>
            <Link href="/" className="mb-3 block text-center no-underline md:mb-6 md:px-4 md:text-left" aria-label="Studio home">
              <Wordmark />
              <span className="font-serif text-[1.7rem] font-medium leading-none text-signal md:text-[2.4rem]">
                <span className="md:hidden">S</span>
                <span className="hidden md:inline">Studio</span>
                <span className="text-hot">.</span>
              </span>
            </Link>
            <Nav
              badges={{ news, content, design, publishing, inbox, website }}
              railFooter={
                <div className="mt-2 flex flex-col items-center gap-1 border-t border-rosemist pt-2">
                  <Link href="/notifications" title="Notifications" aria-label={`Notifications, ${unread} unread`} className="relative flex h-10 w-10 items-center justify-center rounded-full text-deepred no-underline hover:bg-shell">
                    <Icon name="bell" className="h-5 w-5" />
                    {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-deepred px-1 text-[10px] font-bold text-white ring-2 ring-blush">{unread}</span>}
                  </Link>
                  <form action={logoutAction}>
                    <button title="Sign out" aria-label="Sign out" className="flex h-10 w-10 items-center justify-center rounded-full text-deepred hover:bg-shell">
                      <Icon name="logout" className="h-5 w-5" />
                    </button>
                  </form>
                </div>
              }
              footer={
                <div className="mt-6 space-y-0.5 border-t border-rosemist pt-4">
                  <Link href="/notifications" className="label flex min-h-10 items-center justify-between gap-2 rounded-full px-4 text-ink no-underline hover:bg-shell/70" aria-label={`Notifications, ${unread} unread`}>
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-transparent" />
                      Notifications
                    </span>
                    {unread > 0 && <span className="min-w-6 rounded-full bg-deepred px-2 text-center text-[0.7rem] tracking-normal text-white">{unread}</span>}
                  </Link>
                  <form action={logoutAction}>
                    <button className="label flex min-h-10 w-full items-center gap-2 rounded-full px-4 text-left text-ink hover:bg-shell/70" title={user.email}>
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-transparent" />
                      Sign out
                    </button>
                  </form>
                </div>
              }
            />
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <CommandMenu />
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
