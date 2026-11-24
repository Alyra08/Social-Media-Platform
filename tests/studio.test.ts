import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { testDb } from "./helpers";
import type { Db } from "@/db/client";
import { designs, posts, type DesignParams } from "@/db/schema";
import type { Actor } from "@/lib/system";
import { applyPrompt, checkDesign, tidyParams } from "@/lib/design/editor-rules";
import { saveFromEditor, sendDesignForApproval, studioCreate } from "@/lib/design/studio";
import { decidePost } from "@/lib/workflow";
import { avaGuidance, latestBriefing, pillarBalance, runAvaTrendResearch, STARTING_BRIEFING } from "@/lib/ava";

const base: DesignParams = { layout: "poster", lead: "signal", canvas: "blush", headline: "Say it out loud.", emphasis: "out loud", motifs: ["arch"], headlineScale: 1, logoScale: 1, textDensity: 1 };

describe("editor rules", () => {
  it("turns plain requests into design changes and reports them", () => {
    const r = applyPrompt(base, "make it pinker with a bigger headline and add hearts");
    expect(r.params.lead).toBe("hot");
    expect(r.params.headlineScale).toBeGreaterThan(1);
    expect(r.params.motifs).toContain("heart");
    expect(r.changes.length).toBeGreaterThanOrEqual(3);
  });
  it("keeps params inside brand limits", () => {
    const t = tidyParams({ ...base, motifs: ["arch", "flower", "heart"], script: "two words", headlineScale: 9, imageUrl: "https://evil.example/x.png" });
    expect(t.motifs).toHaveLength(2);
    expect(t.script).toBe("two");
    expect(t.headlineScale).toBe(1.8);
    expect(t.imageUrl).toBeUndefined();
  });
  it("flags exclamation marks as must-fix and missing full stops as advice", () => {
    expect(checkDesign({ ...base, headline: "Wow!" }).some((i) => i.severity === "block")).toBe(true);
    expect(checkDesign({ ...base, headline: "No full stop" }).some((i) => /full stop/.test(i.detail))).toBe(true);
    expect(checkDesign(base)).toEqual([]);
  });
});

describe("design studio", () => {
  let db: Db;
  let owner: Actor;
  beforeEach(async () => {
    delete process.env.ANTHROPIC_API_KEY;
    ({ db, owner } = await testDb());
  });

  it("creates a draft post and draft design from a description (demo mode), tagged with a pillar", async () => {
    const id = await studioCreate(db, owner, { prompt: "a soft feminine post about choosing yourself, with hearts", format: "story" });
    const d = await db.query.designs.findFirst({ where: eq(designs.id, id) });
    expect(d?.status).toBe("draft");
    expect(d?.source).toBe("studio");
    expect(d?.format).toBe("story");
    expect(d?.params?.motifs).toContain("heart");
    const p = await db.query.posts.findFirst({ where: eq(posts.id, d!.postId!) });
    expect(p?.status).toBe("saved");
    expect(p?.pillar).toBeTruthy();
    expect(p?.platform).toBe("instagram");
  });

  it("won't send a demo draft until the caption is written; then copy goes to content approval and the studio design survives it", async () => {
    const id = await studioCreate(db, owner, { prompt: "we saved you a seat", format: "ig_portrait" });
    await expect(sendDesignForApproval(db, owner, id)).rejects.toThrow(/caption/i);
    const d = (await db.query.designs.findFirst({ where: eq(designs.id, id) }))!;
    const copy = { hook: "We saved you a seat.", caption: "Come as you are. Leave louder.", callToAction: "See the next circle", hashtags: ["SimplyBeingFemale"], altText: "Poster" };
    await saveFromEditor(db, owner, id, { format: d.format, params: d.params!, copy });
    expect(await sendDesignForApproval(db, owner, id)).toMatch(/Content approval/);
    const p = (await db.query.posts.findFirst({ where: eq(posts.id, d.postId!) }))!;
    expect(p.status).toBe("awaiting_content");

    await decidePost(db, owner, p.id, "approve");
    const all = await db.select().from(designs).where(eq(designs.postId, p.id));
    expect(all).toHaveLength(1); // no extra generated options
    expect(all[0].status).toBe("proposed");
  });

  it("editing an approved design makes a new draft and the post needs design approval again", async () => {
    const id = await studioCreate(db, owner, { prompt: "friendship after forty", format: "ig_square" });
    const d = (await db.query.designs.findFirst({ where: eq(designs.id, id) }))!;
    await db.update(designs).set({ status: "approved" }).where(eq(designs.id, id));
    await db.update(posts).set({ status: "scheduled", approvedDesignId: id, caption: "Written." }).where(eq(posts.id, d.postId!));
    const p0 = (await db.query.posts.findFirst({ where: eq(posts.id, d.postId!) }))!;
    const r = await saveFromEditor(db, owner, id, { format: d.format, params: { ...d.params!, lead: "hot" }, copy: { hook: p0.hook, caption: p0.caption, callToAction: p0.callToAction, hashtags: p0.hashtags, altText: p0.altText ?? "" } });
    expect(r.id).not.toBe(id);
    expect((await db.query.designs.findFirst({ where: eq(designs.id, id) }))?.status).toBe("approved");
    await sendDesignForApproval(db, owner, r.id);
    const p = (await db.query.posts.findFirst({ where: eq(posts.id, d.postId!) }))!;
    expect(p.status).toBe("awaiting_design");
    expect(p.approvedDesignId).toBeNull();
  });
});

describe("Ava", () => {
  it("brings persona, pillars, content types and the trend briefing into every prompt", async () => {
    const { db } = await testDb();
    const g = await avaGuidance(db);
    expect(g).toMatch(/You are Ava/);
    expect(g).toMatch(/Practical courage/);
    expect(g).toMatch(/Myth vs fact/);
    expect(g).toMatch(/TREND BRIEFING/);
  });
  it("starts from the sourced briefing and skips weekly research without the AI key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { db } = await testDb();
    expect((await latestBriefing(db)).briefing).toEqual(STARTING_BRIEFING);
    expect(await runAvaTrendResearch(db)).toEqual({ skipped: true });
  });
  it("measures pillar balance and names the under-used pillars", async () => {
    const { db } = await testDb();
    for (let i = 0; i < 4; i++) await db.insert(posts).values({ platform: "instagram", format: "post", category: "humour", hook: "a.", caption: "b", callToAction: "Join the circle", pillar: "dry-wit", contentType: "relatable" });
    const b = await pillarBalance(db);
    expect(b.total).toBe(4);
    expect(b.under).toContain("Practical courage");
    expect(b.under).not.toContain("Dry wit");
  });
});

describe("demo headline", () => {
  it("pulls the message out of a description", async () => {
    const { messageFrom } = await import("@/lib/design/studio");
    expect(messageFrom("A soft, feminine quote post: choose yourself every single time, with hearts")).toBe("choose yourself every single time");
    expect(messageFrom("Poster for the next circle: we saved you a seat, warm and inviting")).toBe("we saved you a seat");
    expect(messageFrom("Bold red stripe post about asking for the raise you're owed")).toBe("asking for the raise you're owed");
  });
});

describe("fonts", () => {
  it("draws the chosen standard font, drops unknown ones, and notes non-brand fonts", async () => {
    const { renderDesignSvg } = await import("@/lib/design/render");
    const svg = renderDesignSvg({ format: "ig_square", params: tidyParams({ ...base, headlineFont: "playfair", bodyFont: "nope" }) });
    expect(svg).toContain("Playfair Display");
    expect(svg).toContain("family=Playfair+Display");
    expect(tidyParams({ ...base, bodyFont: "nope" }).bodyFont).toBeUndefined();
    expect(checkDesign({ ...base, headlineFont: "playfair" }).some((i) => /brand font/.test(i.detail))).toBe(true);
    expect(checkDesign({ ...base, headlineFont: "brand-serif" })).toEqual([]);
  });
});

describe("headline fitting", () => {
  it("never drops words from a long headline, even in a wide font", async () => {
    const { renderDesignSvg } = await import("@/lib/design/render");
    const headline = "A soft, feminine quote post: choose yourself every single time, with hearts.";
    const svg = renderDesignSvg({ format: "ig_portrait", params: tidyParams({ ...base, layout: "quote", headline, emphasis: "with hearts", headlineFont: "fraunces" }) });
    const text = svg.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const w of headline.replace(/[.,:]/g, "").split(" ")) expect(text).toContain(w);
  });
});

describe("post score", () => {
  it("scores a finished post at 100 and names the next fix for a draft", async () => {
    const { postScore } = await import("@/lib/design/editor-rules");
    const done = postScore(base, { hook: "We saved you a seat.", caption: "Come as you are. Leave louder. ".repeat(3), callToAction: "See the next circle", hashtags: ["a", "b", "c"], altText: "Poster saying we saved you a seat" }, "instagram", []);
    expect(done.score).toBe(100);
    const draft = postScore(base, { hook: "Hi.", caption: "[Write the caption] idea", callToAction: "", hashtags: [], altText: "" }, "instagram", []);
    expect(draft.score).toBeLessThan(60);
    expect(draft.checks.find((c) => !c.ok)?.key).toBe("caption");
  });
});
