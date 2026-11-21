import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { readStored } from "@/lib/files";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const a = await (await getDb()).query.assets.findFirst({ where: eq(assets.id, id) });
  if (!a?.path) return new Response("Not found", { status: 404 });
  const inline = /^(image|video)\//.test(a.mime ?? "") || a.mime === "application/pdf";
  return new Response(new Uint8Array(readStored(a.path)), {
    headers: {
      "Content-Type": a.mime ?? "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${a.name.replace(/[^\w.\- ]/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
