import type { Metadata } from "next";
import Link from "next/link";
import { Stripe, Wordmark } from "@/components/ui";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getDb } from "@/db";
import { DEFAULT_SETTINGS, getSetting } from "@/lib/system";
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

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const footer = await getSetting(await getDb(), "siteFooter");
  return (
    <div className="flex min-h-screen flex-col bg-page">
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
      <SiteFooter footer={{ ...DEFAULT_SETTINGS.siteFooter, ...footer }} />
    </div>
  );
}
