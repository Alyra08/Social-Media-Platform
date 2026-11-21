/**
 * Starts the automation scheduler inside the Next.js server process (Node runtime only).
 * Set DISABLE_SCHEDULER=1 to turn it off (e.g. when running a separate worker, or in tests).
 * For serverless hosting, call POST /api/cron/<job> from the platform's cron instead.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DISABLE_SCHEDULER === "1") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/scheduler");
  await startScheduler();
}
