import { NextResponse, type NextRequest } from "next/server";

/** Cheap gate: no session cookie → login. The session itself is verified server-side on every page. */
export function proxy(req: NextRequest) {
  if (!req.cookies.get("sbf_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/public|api/cron|api/oauth|_next|favicon.ico).*)"],
};
