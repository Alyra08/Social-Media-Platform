import { describe, it, expect, vi, beforeEach } from "vitest";
import { testDb } from "./helpers";
import type { Db } from "@/db/client";
import { stories } from "@/db/schema";

// Simulate live mode: web search returns two real URLs; the model then cites one real
// and one fabricated source, plus a statistic from a URL search never returned.
vi.mock("@/lib/ai/client", async (orig) => {
  const real = await orig<typeof import("@/lib/ai/client")>();
  return {
    ...real,
    aiEnabled: () => true,
    webResearch: vi.fn(async () => ({
      notes: "notes",
      hits: [
        { url: "https://www.wgea.gov.au/data-statistics", title: "WGEA data" },
        { url: "https://www.abs.gov.au/some-release?utm_source=x", title: "ABS" },
      ],
    })),
    structured: vi.fn(async () => ({
      stories: [
        story("au-pay-gap", "https://www.wgea.gov.au/data-statistics/", [
          { statement: "Gap figure from WGEA", sourceUrl: "https://www.wgea.gov.au/data-statistics" },
          { statement: "Made-up figure", sourceUrl: "https://fake.example.com/stat" },
        ]),
        story("invented", "https://not-in-search.example.com/article", []),
      ],
    })),
  };
});

function story(topicKey: string, sourceUrl: string, keyStats: { statement: string; sourceUrl: string }[]) {
  return {
    topicKey, meaningfulDevelopment: false, category: "social-issues", headline: `H ${topicKey}`, overview: "o", whyItMatters: "w", whyRelevantToSbf: "r",
    keyStats, sourceUrl, sourceOrganisation: "Org", publishedAt: "2026-11-20", eventDate: "2026-11-19",
    supportingSources: [{ title: "ABS", url: "https://www.abs.gov.au/some-release", organisation: "ABS" }, { title: "Fake", url: "https://fake.example.com/x", organisation: "?" }],
    region: "australian", regionalDifferences: "", trending: true, momentum: "rising", verification: "confirmed", factsVsOpinion: "", conflictingReports: "",
    suggestedAngle: "a", socialOpportunities: [], audienceInterest: "high", suggestedArticleHeadline: "t",
    scoreBreakdown: { relevance: 120, momentum: 80, significance: 80, audience: 80, discussion: 80, originality: 80, brandAlignment: 80 },
    scoreExplanation: "e",
  };
}

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
});

describe("live research source verification", () => {
  it("confirms real sources, flags invented ones and drops unsourced statistics", async () => {
    const { runResearch } = await import("@/lib/research");
    const r = await runResearch(db, "daily");
    expect(r.mode).toBe("ai");
    const rows = await db.select().from(stories);
    const real = rows.find((s) => s.topicKey === "au-pay-gap")!;
    const fake = rows.find((s) => s.topicKey === "invented")!;

    expect(real.sourcesVerified).toBe(true);
    expect(real.keyStats.map((k) => k.statement)).toEqual(["Gap figure from WGEA"]);
    expect(real.supportingSources.map((s) => s.title)).toEqual(["ABS"]);
    expect(real.isDemo).toBe(false);
    expect(real.scoreBreakdown?.relevance).toBe(100); // clamped

    expect(fake.sourcesVerified).toBe(false);
    expect(fake.verification).toBe("unverified");
  });
});
