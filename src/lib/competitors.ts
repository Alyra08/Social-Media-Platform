import { z } from "zod";
import type { Db } from "@/db/client";
import { competitors, reports } from "@/db/schema";
import { aiEnabled, normaliseUrl, structured, webResearch } from "./ai/client";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { logActivity, notify } from "./system";

const CompetitorReport = z.object({
  summary: z.string(),
  competitors: z.array(
    z.object({
      name: z.string(),
      topicsPublishing: z.array(z.string()),
      mostEngagingContent: z.array(z.object({ description: z.string(), url: z.string() })),
      campaignFormats: z.array(z.string()),
    }),
  ),
  emergingThemes: z.array(z.string()),
  audienceConversations: z.array(z.string()),
  contentGaps: z.array(z.string()).describe("topics women are discussing that competitors are not covering well"),
  industryTrends: z.array(z.string()),
  opportunitiesForSbf: z.array(z.string()).describe("distinctive SBF angles — never copy competitor content"),
});

/** Weekly competitor intelligence from publicly accessible information only. */
export async function runCompetitorReport(db: Db) {
  const list = await db.select().from(competitors);
  if (!list.length) {
    await logActivity(db, "competitors:weekly", "skipped", "No competitors configured");
    return null;
  }
  if (!aiEnabled()) {
    await logActivity(db, "competitors:weekly", "skipped", "Needs an Anthropic API key");
    return null;
  }
  const system = `${SBF_BRAND_BRIEF}\n\n---\nYou are the SBF market analyst. Analyse only publicly accessible information. Never copy competitor content; identify themes, gaps and distinctive opportunities. Cite URLs exactly as returned by search. Never invent engagement figures.`;
  const research = await webResearch({
    system,
    prompt: `Review the last 7 days of public content from these women's media / empowerment / lifestyle brands:\n${list.map((c) => `- ${c.name} ${c.url ?? ""} ${Object.entries(c.handles).map(([k, v]) => `${k}:${v}`).join(" ")}`).join("\n")}\nFind the topics they're publishing, which content is visibly getting the most engagement, campaign formats, audience conversations, content gaps, and industry trends.`,
    maxSearches: 15,
    effort: "medium",
  });
  const data = await structured({ schema: CompetitorReport, system, task: "Structure the competitor research into the weekly report. Only include URLs from the allowed list.", input: `ALLOWED URLS:\n${research.hits.map((h) => h.url).join("\n")}\n\nNOTES:\n${research.notes}`, effort: "low" });
  const allowed = new Set(research.hits.map((h) => normaliseUrl(h.url)));
  for (const c of data.competitors) c.mostEngagingContent = c.mostEngagingContent.filter((m) => allowed.has(normaliseUrl(m.url)));
  const now = new Date();
  const [r] = await db
    .insert(reports)
    .values({ kind: "competitor", periodStart: new Date(now.getTime() - 7 * 86400_000).toISOString().slice(0, 10), periodEnd: now.toISOString().slice(0, 10), title: "Weekly competitor intelligence", data })
    .returning();
  await notify(db, "report_ready", "Weekly competitor intelligence is ready", undefined, `/competitors?report=${r.id}`);
  await logActivity(db, "competitors:weekly", "ok", `${list.length} competitors reviewed`);
  return r.id;
}
