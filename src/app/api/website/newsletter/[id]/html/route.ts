import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { newsletterIssues } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { renderIssue } from "@/lib/newsletter";

/** The approved issue as an HTML file, to paste into another email tool. Approved issues only. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "viewer") return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i) return new Response("Not found", { status: 404 });
  if (!i.approvedHash) return new Response("Approve the issue first.", { status: 409 });
  const r = await renderIssue(db, i);
  return new Response(r.html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename="sunday-note-${id.slice(0, 8)}.html"`, "Cache-Control": "no-store" },
  });
}
