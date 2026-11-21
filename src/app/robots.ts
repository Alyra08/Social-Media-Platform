import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { siteUrl } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Search engines may index the public website only, never the studio. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host")?.split(":")[0];
  let siteHost: string | null = null;
  try {
    const u = process.env.SITE_URL ? new URL(process.env.SITE_URL) : null;
    if (u && (u.pathname === "/" || u.pathname === "")) siteHost = u.hostname;
  } catch {}
  const onSiteDomain = Boolean(siteHost && host === siteHost);
  return {
    rules: onSiteDomain ? { userAgent: "*", allow: "/" } : { userAgent: "*", allow: "/site", disallow: "/" },
    sitemap: onSiteDomain ? `https://${siteHost}/sitemap.xml` : siteUrl("/sitemap.xml").replace(/\/site\/sitemap\.xml$/, "/sitemap.xml"),
  };
}
