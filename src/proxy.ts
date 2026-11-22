import { NextResponse, type NextRequest } from "next/server";

/** Public paths: no studio login needed. */
const PUBLIC = /^\/(site(\/|$)|login|api\/public|api\/cron|api\/oauth|sitemap\.xml$|robots\.txt$|_next|favicon\.ico)/;

/**
 * 1. When the public website has its own domain (SITE_URL host, set in the hosting environment),
 *    requests to that domain are served from /site, so simplybeingfemale.com/articles/x works.
 * 2. Everything else in the studio needs a session cookie (verified server-side on every page).
 */
export function proxy(req: NextRequest) {
  const siteHost = siteHostname();
  const path = req.nextUrl.pathname;
  if (siteHost && req.nextUrl.hostname === siteHost && !/^\/(site|_next|api\/public|sitemap\.xml|robots\.txt|favicon\.ico)/.test(path)) {
    const url = req.nextUrl.clone();
    url.pathname = `/site${path === "/" ? "" : path}`;
    return NextResponse.rewrite(url);
  }
  if (PUBLIC.test(path)) return NextResponse.next();
  // Local testing only (see devAutoLoginActive in lib/auth.ts).
  if (process.env.NODE_ENV !== "production" && process.env.SBF_DEV_AUTOLOGIN === "1" && ["localhost", "127.0.0.1", "[::1]"].includes(req.nextUrl.hostname)) return NextResponse.next();
  if (!req.cookies.get("sbf_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

function siteHostname(): string | null {
  const raw = process.env.SITE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    // Only a dedicated domain (no path) is rewritten; https://studio.example.com/site needs nothing.
    return u.pathname === "/" || u.pathname === "" ? u.hostname : null;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
