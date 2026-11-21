import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { subscribersCsv } from "@/lib/newsletter";
import { audit } from "@/lib/system";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role === "viewer") return new Response("Unauthorised", { status: 401 });
  const all = new URL(req.url).searchParams.has("all");
  const db = await getDb();
  const csv = await subscribersCsv(db, all ? "all" : "confirmed");
  await audit(db, user, "subscribers.export", "newsletter", null, all ? "all" : "confirmed");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sbf-subscribers-${all ? "all" : "confirmed"}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
