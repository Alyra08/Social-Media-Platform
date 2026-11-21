"use server";
import { redirect } from "next/navigation";
import type { SourceRef } from "@/db/schema";
import { act } from "@/lib/flash";
import { approveArticle, createArticle, draftArticleFromBrief, publishArticle, saveArticleDraft, unpublishArticle } from "@/lib/website";
import { approveIssue, createIssue, markSentManually, requestSend, saveIssue } from "@/lib/newsletter";
import { approveEvent, cancelEvent, createEvent, publishEvent, unpublishEvent, updateEvent, type EventEdit } from "@/lib/events";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const PATHS = ["/website", "/editorial", "/site"];

/* ───────────── Articles ───────────── */

export async function newArticleAction(f: FormData) {
  let id = "";
  await act("editor", async ({ db, user }) => {
    id = await createArticle(db, user, s(f, "title"));
  }, PATHS);
  if (id) redirect(`/website/articles/${id}`);
}

/** Sources are one per line: "Title | https://url | Organisation". */
function parseSources(raw: string): SourceRef[] {
  return raw
    .split("\n")
    .map((l) => l.split("|").map((x) => x.trim()))
    .filter(([, url]) => url && /^https?:\/\//.test(url))
    .map(([title, url, organisation]) => ({ title: title || url, url, ...(organisation ? { organisation } : {}) }));
}

export async function saveArticleAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const r = await saveArticleDraft(db, user, s(f, "id"), {
      title: s(f, "title"),
      body: String(f.get("body") ?? ""),
      excerpt: s(f, "excerpt"),
      slug: s(f, "slug"),
      category: s(f, "category"),
      seoTitle: s(f, "seoTitle"),
      metaDescription: s(f, "metaDescription"),
      sources: parseSources(String(f.get("sources") ?? "")),
      status: s(f, "status") || undefined,
    });
    const blocks = r.issues.filter((i) => i.severity === "block").length;
    if (r.reset) return "Saved. This was a substantive change, so the article needs approval again (and is off the website until then).";
    return blocks ? `Saved. ${blocks} brand ${blocks === 1 ? "issue needs" : "issues need"} fixing before approval.` : "Saved.";
  }, PATHS);
}

export async function draftArticleAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const r = await draftArticleFromBrief(db, user, s(f, "id"));
    return r.isDemo ? "Draft scaffold added from the brief (sample mode). Write each section in your own words." : "First draft written from the brief. Edit it into your voice before approving.";
  }, PATHS);
}

export async function articleDecisionAction(f: FormData) {
  const decision = s(f, "decision");
  await act("owner", async ({ db, user }) => {
    const id = s(f, "id");
    if (decision === "approve") {
      await approveArticle(db, user, id, { override: s(f, "override") === "1" });
      return "Approved for the website.";
    }
    if (decision === "publish") {
      await publishArticle(db, user, id);
      return "Published. It's live on the website.";
    }
    if (decision === "approve_publish") {
      await approveArticle(db, user, id, { override: s(f, "override") === "1" });
      await publishArticle(db, user, id);
      return "Approved and published. It's live on the website.";
    }
    if (decision === "unpublish") {
      await unpublishArticle(db, user, id);
      return "Taken off the website. It stays approved, so you can republish it.";
    }
    return "Nothing changed.";
  }, PATHS);
}

/* ───────────── Newsletter ───────────── */

export async function newIssueAction() {
  let id = "";
  await act("editor", async ({ db, user }) => {
    id = await createIssue(db, user);
  }, PATHS);
  if (id) redirect(`/website/newsletter/${id}`);
}

export async function saveIssueAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const r = await saveIssue(db, user, s(f, "id"), {
      subject: s(f, "subject"),
      preheader: s(f, "preheader"),
      intro: String(f.get("intro") ?? ""),
      closing: String(f.get("closing") ?? ""),
      articleIds: f.getAll("articleIds").map(String).filter(Boolean),
    });
    return r.reset ? "Saved. It changed after approval, so it needs approving again." : "Saved.";
  }, PATHS);
}

export async function issueDecisionAction(f: FormData) {
  const decision = s(f, "decision");
  await act("owner", async ({ db, user }) => {
    const id = s(f, "id");
    if (decision === "approve") {
      await approveIssue(db, user, id, { override: s(f, "override") === "1" });
      return "Approved. Send it now, or send it from your own email tool and mark it as sent.";
    }
    if (decision === "send") {
      await requestSend(db, user, id);
      return "Sending has started. Delivery runs in batches every few minutes; you'll get a notification when it's done.";
    }
    if (decision === "manual") {
      await markSentManually(db, user, id, Number(s(f, "recipients")) || 0);
      return "Marked as sent.";
    }
    return "Nothing changed.";
  }, PATHS);
}

/* ───────────── Events ───────────── */

function readEvent(f: FormData): EventEdit {
  const local = (k: string) => {
    const v = s(f, k);
    // datetime-local values are Brisbane time (UTC+10, no daylight saving).
    return v ? new Date(`${v}:00+10:00`) : null;
  };
  const cap = s(f, "capacity");
  return {
    title: s(f, "title"),
    summary: s(f, "summary"),
    body: String(f.get("body") ?? ""),
    startsAt: local("startsAt") ?? new Date(NaN),
    endsAt: local("endsAt"),
    location: s(f, "location"),
    onlineUrl: s(f, "onlineUrl"),
    capacity: cap ? Number(cap) : null,
    priceNote: s(f, "priceNote"),
    slug: s(f, "slug"),
  };
}

export async function createEventAction(f: FormData) {
  let id = "";
  await act("editor", async ({ db, user }) => {
    id = await createEvent(db, user, readEvent(f));
  }, PATHS);
  if (id) redirect(`/website/events/${id}`);
}

export async function saveEventAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const r = await updateEvent(db, user, s(f, "id"), readEvent(f));
    return r.reset ? "Saved. It changed after approval, so it needs approving again (and is off the website until then)." : "Saved.";
  }, PATHS);
}

export async function eventDecisionAction(f: FormData) {
  const decision = s(f, "decision");
  await act("owner", async ({ db, user }) => {
    const id = s(f, "id");
    if (decision === "approve") {
      await approveEvent(db, user, id, { override: s(f, "override") === "1" });
      return "Approved.";
    }
    if (decision === "approve_publish") {
      await approveEvent(db, user, id, { override: s(f, "override") === "1" });
      await publishEvent(db, user, id);
      return "Approved and published. RSVPs are open.";
    }
    if (decision === "publish") {
      await publishEvent(db, user, id);
      return "Published. RSVPs are open.";
    }
    if (decision === "unpublish") {
      await unpublishEvent(db, user, id);
      return "Taken off the website. Existing RSVPs are kept.";
    }
    if (decision === "cancel") {
      const r = await cancelEvent(db, user, id, s(f, "message") || "We're sorry to cancel. We'll let you know when it's rescheduled.");
      return r.emailed ? `Cancelled. ${r.emailed} people were emailed.` : "Cancelled. Email isn't set up, so let people know yourself (export the RSVP list).";
    }
    return "Nothing changed.";
  }, PATHS);
}
