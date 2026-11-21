import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { rsvpsCsv } from "@/lib/events";
import { audit } from "@/lib/system";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role === "viewer") return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  const db = await getDb();
  const csv = await rsvpsCsv(db, id);
  await audit(db, user, "rsvps.export", "event", id);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="sbf-rsvps-${id.slice(0, 8)}.csv"`, "Cache-Control": "no-store" },
  });
}
