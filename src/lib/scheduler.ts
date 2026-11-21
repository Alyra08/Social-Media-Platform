import cron from "node-cron";
import { getDb } from "@/db";
import { JOBS, runJob, type JobName } from "./jobs";
import { ensureSeed } from "./seed";

const g = globalThis as unknown as { __sbfScheduler?: boolean };

export async function startScheduler() {
  if (g.__sbfScheduler) return;
  g.__sbfScheduler = true;
  const db = await getDb();
  await ensureSeed(db);
  for (const [name, job] of Object.entries(JOBS) as [JobName, (typeof JOBS)[JobName]][]) {
    cron.schedule(job.cron, () => void runJob(db, name), { timezone: "Australia/Brisbane", name });
  }
  console.log(`[sbf] automation scheduler started: ${Object.keys(JOBS).length} jobs (Australia/Brisbane)`);
}
