import type { Metadata } from "next";
import Link from "next/link";
import { Stripe, Wordmark } from "@/components/ui";
import { SiteNav } from "@/components/site-nav";
import { siteUrl } from "@/lib/email";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(siteUrl("/")),
    title: { default: "Simply Being Female", template: "%s · Simply Being Female" },
    description: "A movement, a community and a safe space for women to be unapologetically themselves.",
    openGraph: { siteName: "Simply Being Female", locale: "en_AU", type: "website" },
    robots: { index: true, follow: true },
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-blush">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <Stripe />
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-6">
        <Link href="/site" className="no-underline" aria-label="Simply Being Female home">
          <Wordmark />
        </Link>
        <SiteNav />
      </header>
      <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 md:px-6">
        {children}
      </main>
      <footer className="bg-shell">
        <Stripe />
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 md:grid-cols-2 md:px-6">
          <div>
            <Wordmark small />
            <p className="mt-3 max-w-md text-[15px]">A movement, a community and a safe space for women to be unapologetically themselves.</p>
          </div>
          <div className="text-[15px] md:text-right">
            <p className="label text-deepred">Unapologetically fierce. Beautifully imperfect.</p>
            <p className="mt-3">
              <Link href="/site/newsletter">The Sunday note</Link> · <Link href="/site/events">Events</Link> · <Link href="/site/articles">Stories</Link>
            </p>
            <p className="mt-3 text-sm">© {new Date().getFullYear()} Simply Being Female</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
