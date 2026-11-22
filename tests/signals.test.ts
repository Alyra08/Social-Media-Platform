import { describe, expect, it } from "vitest";
import { algorithmSignals, dataDecisions, type PostPerf } from "@/lib/analytics";

const post = (o: Partial<PostPerf>): PostPerf => ({
  postId: crypto.randomUUID(), platform: "instagram", category: "career", format: "carousel", hook: "Hook", treatment: "type", publishedAt: new Date("2026-11-16T22:00:00Z"), liveUrl: null,
  impressions: 1000, reach: 1000, likes: 10, comments: 2, shares: 1, saves: 1, clicks: 0, views: 0, profileVisits: 0, watchTimeSeconds: 0, completionRate: null, ...o,
});

describe("algorithm signals", () => {
  it("expresses each signal per person reached and leaves missing data blank", () => {
    const s = algorithmSignals([post({ shares: 20, reach: 1000 }), post({ shares: 0, reach: 1000 })], []);
    const share = s.find((x) => x.key === "share")!;
    expect(share.value).toBeCloseTo(0.01);
    expect(share.prev).toBeNull();
    expect(s.find((x) => x.key === "completion")!.value).toBeNull();
  });
});

describe("data decisions", () => {
  it("waits for enough posts before recommending anything", () => {
    expect(dataDecisions([post({})])[0]).toMatch(/at least 5 posts/);
  });
  it("names the platform and format with the strongest share and save signals, with sample sizes", () => {
    const perf = [
      ...Array.from({ length: 3 }, () => post({ platform: "instagram", format: "carousel", shares: 40, saves: 30 })),
      ...Array.from({ length: 3 }, () => post({ platform: "linkedin", format: "text", shares: 1, saves: 0 })),
    ];
    const d = dataDecisions(perf).join("\n");
    expect(d).toMatch(/Lean into Instagram.*\(3 posts\)/);
    expect(d).toMatch(/Make more carousel posts/);
  });
});

describe("overview analytics panel", () => {
  it("renders headline metrics, decisions, signals, the platform table and top posts, labelled as test data", async () => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { testDb } = await import("./helpers");
    const { posts, postMetrics, accounts, accountMetrics } = await import("@/db/schema");
    const { OverviewAnalytics } = await import("@/app/(app)/overview-analytics");
    const { db } = await testDb();
    const [acc] = await db.insert(accounts).values({ platform: "instagram", handle: "@sbf", status: "connected", mode: "sandbox" }).returning();
    await db.insert(accountMetrics).values({ accountId: acc.id, date: new Date().toISOString().slice(0, 10), followers: 1200, newFollowers: 30, unfollows: 4, isSandbox: true });
    for (let i = 0; i < 6; i++) {
      const [p] = await db.insert(posts).values({ platform: i % 2 ? "instagram" : "linkedin", format: i % 2 ? "carousel" : "post", category: "humour", hook: `Hook ${i}.`, caption: "b", callToAction: "Join the circle", status: "published", publishedAt: new Date(Date.now() - (i + 1) * 86400_000) }).returning();
      await db.insert(postMetrics).values({ postId: p.id, platform: p.platform, reach: 1000, impressions: 1400, likes: 50, comments: 5, shares: i % 2 ? 30 : 2, saves: 10, clicks: 7, views: 300, profileVisits: 12, watchTimeSeconds: 2400, completionRate: 0.4, isSandbox: true });
    }
    const html = renderToStaticMarkup(await OverviewAnalytics({ db }));
    for (const s of ["Test data, not real results", "What the data says to do next", "Share rate", "Video completion", "By platform", "Top posts by engagement rate", "Hook 1.", "Lean into Instagram"]) expect(html).toContain(s);
  });
});
