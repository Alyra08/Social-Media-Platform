import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { completeOAuth } from "@/lib/integrations/registry";
import { audit, logActivity } from "@/lib/system";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const back = new URL("/integrations", url.origin);
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") {
    back.searchParams.set("error", "Sign in as the owner to connect accounts.");
    return NextResponse.redirect(back);
  }
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    back.searchParams.set("error", url.searchParams.get("error_description") ?? "Connection was cancelled.");
    return NextResponse.redirect(back);
  }
  const db = await getDb();
  try {
    await completeOAuth(db, platform, code, state);
    await audit(db, user, "account.connect", "account", null, platform);
    back.searchParams.set("connected", platform);
  } catch (e) {
    await logActivity(db, `oauth:${platform}`, "failed", e instanceof Error ? e.message : String(e));
    back.searchParams.set("error", e instanceof Error ? e.message : "Connection failed.");
  }
  return NextResponse.redirect(back);
}
