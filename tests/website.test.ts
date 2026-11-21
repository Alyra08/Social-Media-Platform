import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { testDb } from "./helpers";
import type { Db } from "@/db/client";
import { appSecrets, articles, auditLog, designs, eventRsvps, newsletterDeliveries, posts, subscribers } from "@/db/schema";
import type { Actor } from "@/lib/system";
import { KEYS, keyStatuses, loadKeys, removeKey, saveKey } from "@/lib/keys";
import { approveArticle, createArticle, publishArticle, publishedArticleBySlug, publishedArticles, saveArticleDraft, unpublishArticle, WebsiteError } from "@/lib/website";
import { approveIssue, confirmSubscription, createIssue, requestSend, saveIssue, sendIssueBatches, subscribe, unsubscribe } from "@/lib/newsletter";
import { approveEvent, cancelRsvp, createEvent, publishEvent, rsvp, updateEvent } from "@/lib/events";
import { sandboxOutbox } from "@/lib/email";
import { importFromCanva } from "@/lib/canva";
import { setInternalSecret } from "@/lib/keys";
import { ArticleBody } from "@/components/article-body";

let db: Db;
let owner: Actor;
let editor: Actor;

const CLEAN_BODY = "I rewrote the email four times before I sent it.\n\n## Why we shrink\n\nNobody taught us to ask for more. So we practise.\n\nWho taught you to ask for less?";

beforeEach(async () => {
  ({ db, owner, editor } = await testDb());
  delete process.env.EMAIL_SANDBOX;
  delete process.env.EMAIL_SANDBOX_FAIL;
  delete process.env.RESEND_API_KEY;
  delete process.env.NEWSLETTER_FROM;
  sandboxOutbox().length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EMAIL_SANDBOX;
  delete process.env.CANVA_CLIENT_ID;
  delete process.env.CANVA_CLIENT_SECRET;
});

async function liveArticle(title = "Asking for more is a skill.") {
  const id = await createArticle(db, owner, title);
  await saveArticleDraft(db, owner, id, { title, body: CLEAN_BODY, excerpt: "On asking for what you want.", category: "confidence" });
  await approveArticle(db, owner, id);
  await publishArticle(db, owner, id);
  return id;
}

describe("keys added later in Settings", () => {
  it("encrypts the key, switches it on immediately and never logs the value", async () => {
    await saveKey(db, owner, "ANTHROPIC_API_KEY", "  sk-ant-test-1234567890  ");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-1234567890");
    const [row] = await db.select().from(appSecrets).where(eq(appSecrets.name, "ANTHROPIC_API_KEY"));
    expect(row.encryptedValue).not.toContain("sk-ant");
    const audits = await db.select().from(auditLog);
    expect(audits.some((a) => a.action === "key.save")).toBe(true);
    expect(JSON.stringify(audits)).not.toContain("sk-ant-test");
    const st = (await keyStatuses(db)).find((k) => k.name === "ANTHROPIC_API_KEY")!;
    expect(st.source).toBe("app");
    expect(st.display).toBe("••••7890");

    await removeKey(db, owner, "ANTHROPIC_API_KEY");
    expect(process.env.ANTHROPIC_API_KEY ?? "").toBe("");
  });

  it("reloads keys from the database (e.g. after a restart)", async () => {
    await saveKey(db, owner, "RESEND_API_KEY", "re_abc123456");
    delete process.env.RESEND_API_KEY;
    await loadKeys(db, { force: true });
    expect(process.env.RESEND_API_KEY).toBe("re_abc123456");
    await removeKey(db, owner, "RESEND_API_KEY");
  });

  it("rejects unknown names, bad addresses and pasted spaces", async () => {
    await expect(saveKey(db, owner, "ENCRYPTION_KEY", "x")).rejects.toThrow(/knows about/);
    await expect(saveKey(db, owner, "APP_URL", "studio.example.com")).rejects.toThrow(/https/);
    await expect(saveKey(db, owner, "APP_URL", "http://studio.example.com")).rejects.toThrow(/https/);
    await expect(saveKey(db, owner, "META_APP_SECRET", "abc def")).rejects.toThrow(/spaces/);
    await saveKey(db, owner, "APP_URL", "https://studio.example.com/");
    expect(process.env.APP_URL).toBe("https://studio.example.com");
    await removeKey(db, owner, "APP_URL");
    expect(KEYS.some((k) => k.name === "ENCRYPTION_KEY")).toBe(false);
  });
});

describe("website articles", () => {
  it("needs owner approval, then publishes and appears on the public site and in search", async () => {
    const id = await createArticle(db, editor, "Asking for more is a skill.");
    await saveArticleDraft(db, editor, id, { title: "Asking for more is a skill.", body: CLEAN_BODY, category: "confidence" });
    await expect(publishArticle(db, owner, id)).rejects.toThrow(/Approve/);
    await expect(approveArticle(db, editor, id)).rejects.toThrow(/owner/);
    await approveArticle(db, owner, id);
    await publishArticle(db, owner, id);
    const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
    expect(a?.status).toBe("published");
    expect(await publishedArticleBySlug(db, "asking-for-more-is-a-skill")).toBeTruthy();
    expect((await publishedArticles(db, { q: "practise" })).map((x) => x.id)).toContain(id);
    expect(await publishedArticles(db, { q: "nothing-like-this" })).toHaveLength(0);
  });

  it("blocks brand-rule breaks and unsourced figures until fixed or overridden", async () => {
    const id = await createArticle(db, owner, "A big change.");
    const r = await saveArticleDraft(db, owner, id, { title: "A big change!", body: "This will empower you.\n\n64% of women agree." });
    expect(r.issues.some((i) => i.rule === "no-exclamation")).toBe(true);
    expect(r.issues.some((i) => i.rule === "avoid-word")).toBe(true);
    expect(r.issues.some((i) => i.rule === "unverified-figure")).toBe(true);
    await expect(approveArticle(db, owner, id)).rejects.toThrow(/brand issues/);
    await approveArticle(db, owner, id, { override: true });
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "article.approve_override"));
    expect(audits).toHaveLength(1);
  });

  it("an edit after publishing takes the article off the site until approved again", async () => {
    const id = await liveArticle();
    const r = await saveArticleDraft(db, owner, id, { title: "Asking for more is a skill.", body: CLEAN_BODY + "\n\nA new paragraph." });
    expect(r.reset).toBe(true);
    const a = await db.query.articles.findFirst({ where: eq(articles.id, id) });
    expect(a?.status).toBe("ready");
    expect(a?.approvedHash).toBeNull();
    expect(await publishedArticleBySlug(db, a!.slug!)).toBeUndefined();
  });

  it("re-checks the content hash at publish time (catches direct database edits)", async () => {
    const id = await createArticle(db, owner, "Asking for more is a skill.");
    await saveArticleDraft(db, owner, id, { title: "Asking for more is a skill.", body: CLEAN_BODY });
    await approveArticle(db, owner, id);
    await db.update(articles).set({ body: "Changed behind the studio's back." }).where(eq(articles.id, id));
    await expect(publishArticle(db, owner, id)).rejects.toThrow(/changed after it was approved/);
  });

  it("can't publish an article built on demo research", async () => {
    const id = await createArticle(db, owner, "Sample.");
    await saveArticleDraft(db, owner, id, { title: "Sample.", body: CLEAN_BODY });
    await db.update(articles).set({ isDemo: true }).where(eq(articles.id, id));
    await approveArticle(db, owner, id);
    await expect(publishArticle(db, owner, id)).rejects.toThrow(WebsiteError);
  });

  it("keeps web addresses unique and can unpublish", async () => {
    const a = await liveArticle("Same title.");
    const b = await liveArticle("Same title.");
    const [ra, rb] = await Promise.all([a, b].map((id) => db.query.articles.findFirst({ where: eq(articles.id, id) })));
    expect(ra!.slug).toBe("same-title");
    expect(rb!.slug).toBe("same-title-2");
    await unpublishArticle(db, owner, a);
    expect(await publishedArticleBySlug(db, "same-title")).toBeUndefined();
  });
});

describe("article text renders safely", () => {
  it("never outputs raw HTML or script links", () => {
    const html = renderToStaticMarkup(
      createElement(ArticleBody, { body: "## Heading\n\n<script>alert(1)</script> and [bad](javascript:alert(1)) and [good](https://example.com) **bold**\n\n- one\n- two" }),
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>two</li>");
  });
});

describe("Sunday note", () => {
  it("collects sign-ups before email is set up, then sends confirmations once it is", async () => {
    expect(await subscribe(db, { email: "Amy@Example.com" })).toBe("pending");
    expect(sandboxOutbox()).toHaveLength(0);
    await expect(subscribe(db, { email: "not-an-email" })).rejects.toThrow();
    process.env.EMAIL_SANDBOX = "1";
    const { runNewsletterJob } = await import("@/lib/newsletter");
    const r = await runNewsletterJob(db);
    expect(r.confirmations).toBe(1);
    expect(sandboxOutbox()[0].to).toBe("amy@example.com");
    const s = await db.query.subscribers.findFirst({ where: eq(subscribers.email, "amy@example.com") });
    expect(await confirmSubscription(db, s!.token)).toBe(true);
    expect(await subscribe(db, { email: "amy@example.com" })).toBe("already");
  });

  it("sends an approved issue once to confirmed subscribers only", async () => {
    process.env.EMAIL_SANDBOX = "1";
    const art = await liveArticle();
    for (const e of ["a@x.com", "b@x.com", "c@x.com"]) await subscribe(db, { email: e });
    const all = await db.select().from(subscribers);
    await confirmSubscription(db, all.find((x) => x.email === "a@x.com")!.token);
    await confirmSubscription(db, all.find((x) => x.email === "b@x.com")!.token);
    await unsubscribe(db, all.find((x) => x.email === "b@x.com")!.token);
    sandboxOutbox().length = 0;

    const id = await createIssue(db, editor);
    await saveIssue(db, editor, id, { subject: "This week's Sunday note.", intro: "Something happened on Tuesday.", articleIds: [art] });
    await expect(requestSend(db, owner, id)).rejects.toThrow(/Approve/);
    await approveIssue(db, owner, id);
    await requestSend(db, owner, id);
    await sendIssueBatches(db);
    await sendIssueBatches(db);
    expect(sandboxOutbox().map((m) => m.to)).toEqual(["a@x.com"]);
    expect(sandboxOutbox()[0].html).toContain("Asking for more is a skill.");
    expect(sandboxOutbox()[0].headers?.["List-Unsubscribe"]).toContain("/api/public/unsubscribe?token=");
    const deliveries = await db.select().from(newsletterDeliveries);
    expect(deliveries).toHaveLength(1);
    const issue = await db.query.newsletterIssues.findFirst();
    expect(issue?.status).toBe("sent");
    expect(issue?.recipientCount).toBe(1);
    await expect(saveIssue(db, owner, id, { subject: "x.", intro: "", articleIds: [] })).rejects.toThrow(/already gone out/);
  });

  it("an edit after approval needs approving again, and sending needs email set up", async () => {
    const id = await createIssue(db, owner);
    await saveIssue(db, owner, id, { subject: "Note.", intro: "Hello.", articleIds: [] });
    await approveIssue(db, owner, id);
    const r = await saveIssue(db, owner, id, { subject: "Note.", intro: "Hello, changed.", articleIds: [] });
    expect(r.reset).toBe(true);
    await approveIssue(db, owner, id);
    await expect(requestSend(db, owner, id)).rejects.toThrow(/Email isn't set up/);
  });
});

describe("events", () => {
  const when = () => new Date(Date.now() + 7 * 86400_000);

  it("needs approval, then takes RSVPs with a capacity, waitlist and no duplicates", async () => {
    const id = await createEvent(db, editor, { title: "Sunday circle.", summary: "A small circle.", body: "Tea and honest talk.", startsAt: when(), capacity: 1 });
    await expect(rsvp(db, { slug: "sunday-circle", name: "Amy", email: "amy@x.com" })).rejects.toThrow(/isn't taking RSVPs/);
    await approveEvent(db, owner, id);
    await publishEvent(db, owner, id);
    expect((await rsvp(db, { slug: "sunday-circle", name: "Amy", email: "amy@x.com" })).status).toBe("going");
    expect((await rsvp(db, { slug: "sunday-circle", name: "Amy", email: "AMY@x.com" })).already).toBe(true);
    expect((await rsvp(db, { slug: "sunday-circle", name: "Bea", email: "bea@x.com" })).status).toBe("waitlist");
    const amy = await db.query.eventRsvps.findFirst({ where: eq(eventRsvps.email, "amy@x.com") });
    await cancelRsvp(db, amy!.token);
    const bea = await db.query.eventRsvps.findFirst({ where: eq(eventRsvps.email, "bea@x.com") });
    expect(bea?.status).toBe("going");
  });

  it("an edit after approval takes the event back to draft", async () => {
    const id = await createEvent(db, owner, { title: "Workshop.", summary: "", body: "", startsAt: when() });
    await approveEvent(db, owner, id);
    await publishEvent(db, owner, id);
    const r = await updateEvent(db, owner, id, { title: "Workshop, moved.", summary: "", body: "", startsAt: when() });
    expect(r.reset).toBe(true);
    await expect(rsvp(db, { slug: "workshop", name: "Amy", email: "amy@x.com" })).rejects.toThrow();
  });
});

describe("Canva", () => {
  it("brings an exported Canva design back as a new design awaiting approval", async () => {
    process.env.CANVA_CLIENT_ID = "id";
    process.env.CANVA_CLIENT_SECRET = "secret";
    await setInternalSecret(db, "canva_tokens", JSON.stringify({ access: "tok", refresh: "ref", expiresAt: Date.now() + 3600_000 }));
    const [post] = await db
      .insert(posts)
      .values({ platform: "instagram", format: "single", category: "confidence", hook: "Ask for more.", caption: "c", callToAction: "Read the article", status: "awaiting_design" })
      .returning();
    const [d] = await db
      .insert(designs)
      .values({ postId: post.id, format: "ig_square", width: 1080, height: 1080, source: "canva", status: "in_canva", canvaDesignId: "DAF123", canvaEditUrl: "https://www.canva.com/design/DAF123/edit" })
      .returning();
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/exports")) return new Response(JSON.stringify({ job: { id: "job1", status: "in_progress" } }), { status: 200 });
      if (url.endsWith("/exports/job1")) return new Response(JSON.stringify({ job: { id: "job1", status: "success", urls: ["https://export-download.canva.com/x.png"] } }), { status: 200 });
      if (url.startsWith("https://export-download.canva.com/")) return new Response(new Uint8Array(png), { status: 200 });
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    process.env.UPLOAD_DIR = `${process.cwd()}/.data/test-uploads`;
    await importFromCanva(db, owner, d.id);
    const after = await db.query.designs.findFirst({ where: eq(designs.id, d.id) });
    expect(after?.status).toBe("proposed");
    expect(after?.uploadMime).toBe("image/png");
    const exportCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/exports"));
    expect(JSON.parse(String((exportCall as unknown as [string, RequestInit])[1].body)).design_id).toBe("DAF123");
  });
});
