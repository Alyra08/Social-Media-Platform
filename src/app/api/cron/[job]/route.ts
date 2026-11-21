import crypto from "node:crypto";
import { getDb } from "@/db";
import { JOBS, runJob, type JobName } from "@/lib/jobs";

/** External scheduler hook (e.g. Vercel Cron, GitHub Actions): POST with `Authorization: Bearer $CRON_SECRET`. */
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!secret || given.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("Unauthorised", { status: 401 });
  }
  const { job } = await params;
  const name = job.replace("-", ":") as JobName;
  if (!(name in JOBS)) return new Response("Unknown job", { status: 404 });
  const result = await runJob(await getDb(), name);
  return Response.json(result);
}
