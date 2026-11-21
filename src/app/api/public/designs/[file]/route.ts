import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { designs } from "@/db/schema";
import { designPng } from "@/lib/design/png";
import { verifyPublic } from "@/lib/files";

/**
 * Signed, unauthenticated access to APPROVED creatives only, so Instagram, Pinterest and Threads
 * can fetch the image when publishing. Unapproved designs are never exposed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const id = file.replace(/\.png$/, "");
  const sig = new URL(req.url).searchParams.get("sig") ?? "";
  if (!verifyPublic(id, sig)) return new Response("Forbidden", { status: 403 });
  const db = await getDb();
  const d = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!d || d.status !== "approved") return new Response("Not found", { status: 404 });
  const { bytes, mime } = await designPng(db, id);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=3600" } });
}
