import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { Db } from "@/db/client";
import { brandPreferences, posts } from "@/db/schema";
import { recordFeedback, activePreferences, setPreferenceState, LEARN_THRESHOLD } from "@/lib/learning";
import { recommendTime } from "@/lib/scheduling";
import { setSetting } from "@/lib/system";

let db: Db;
beforeEach(async () => {
  ({ db } = await testDb());
});

describe("brand intelligence", () => {
  it("treats a single edit as a one-off and learns only repeated preferences", async () => {
    await recordFeedback(db, { area: "visual", subjectType: "design", action: "changes", feedback: "make the logo more prominent" });
    expect((await activePreferences(db, ["visual"])).length).toBe(0);
    for (let i = 1; i < LEARN_THRESHOLD; i++) {
      await recordFeedback(db, { area: "visual", subjectType: "design", action: "changes", feedback: "bigger logo please" });
    }
    const active = await activePreferences(db, ["visual"]);
    expect(active.map((a) => a.key)).toContain("logo_larger");
  });

  it("never re-learns a preference the owner dismissed", async () => {
    for (let i = 0; i < LEARN_THRESHOLD; i++) await recordFeedback(db, { area: "voice", subjectType: "post", action: "revise", feedback: "too long" });
    const pref = await db.query.brandPreferences.findFirst({ where: eq(brandPreferences.key, "shorter") });
    await setPreferenceState(db, pref!.id, "dismissed");
    await recordFeedback(db, { area: "voice", subjectType: "post", action: "revise", feedback: "too long" });
    expect((await db.query.brandPreferences.findFirst({ where: eq(brandPreferences.key, "shorter") }))?.state).toBe("dismissed");
  });
});

describe("posting time optimisation", () => {
  it("explains the recommendation and respects the per-day limit", async () => {
    await setSetting(db, "maxPostsPerDayPerPlatform", 1);
    const first = await recommendTime(db, { platform: "instagram", category: "humour" });
    expect(first.reason).toMatch(/Brisbane/);
    await db.insert(posts).values({ platform: "instagram", format: "post", category: "humour", hook: "a.", caption: "b", callToAction: "Join the circle", status: "scheduled", scheduledAt: first.at });
    const second = await recommendTime(db, { platform: "instagram", category: "social-issues" });
    const day = (d: Date) => new Date(d.getTime() + 36e6).toISOString().slice(0, 10);
    expect(day(second.at)).not.toBe(day(first.at));
  });

  it("keeps similar topics apart on the same platform", async () => {
    const first = await recommendTime(db, { platform: "facebook", category: "motherhood" });
    await db.insert(posts).values({ platform: "facebook", format: "post", category: "motherhood", hook: "a.", caption: "b", callToAction: "Join the circle", status: "scheduled", scheduledAt: first.at });
    const second = await recommendTime(db, { platform: "facebook", category: "motherhood" });
    expect(Math.abs(second.at.getTime() - first.at.getTime())).toBeGreaterThanOrEqual(48 * 3600_000);
  });
});
