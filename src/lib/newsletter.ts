import crypto from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { articles, newsletterDeliveries, newsletterIssues, subscribers, type BrandIssue } from "@/db/schema";
import { checkBrandCopy, hasBlockingIssues } from "./brand/check";
import { emailReady, emailSetupMessage, emailShell, esc, sendEmail, siteUrl } from "./email";
import { randomToken } from "./crypto";
import { audit, logActivity, notify, type Actor } from "./system";

/**
 * The Sunday note. Double opt-in sign-ups, owner approval before sending, a content hash re-checked
 * at send time, and one delivery row per subscriber per issue so nobody is ever emailed twice.
 */
export class NewsletterError extends Error {}

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => e.length <= 254 && EMAIL_RE.test(e);

/* ───────────── Subscribers ───────────── */

export async function subscribe(db: Db, input: { email: string; name?: string | null; source?: string }): Promise<"pending" | "already" | "resent"> {
  const email = normaliseEmail(input.email);
  if (!validEmail(email)) throw new NewsletterError("That email address doesn't look right.");
  const name = input.name?.trim().slice(0, 80) || null;
  const existing = await db.query.subscribers.findFirst({ where: eq(subscribers.email, email) });
  if (existing?.status === "confirmed") return "already";
  if (existing) {
    const recently = existing.confirmationSentAt && Date.now() - existing.confirmationSentAt.getTime() < 10 * 60_000;
    await db
      .update(subscribers)
      .set({ status: "pending", name: name ?? existing.name, token: existing.status === "unsubscribed" ? randomToken(24) : existing.token, unsubscribedAt: null, ...(recently ? {} : { confirmationSentAt: null }) })
      .where(eq(subscribers.id, existing.id));
    if (!recently) await sendConfirmation(db, existing.id);
    return "resent";
  }
  const [row] = await db.insert(subscribers).values({ email, name, token: randomToken(24), source: input.source ?? "website" }).returning();
  await sendConfirmation(db, row.id);
  return "pending";
}

/** Sends the confirm-your-email message. Without an email key, the sign-up waits and is sent later. */
async function sendConfirmation(db: Db, id: string) {
  if (!emailReady()) return;
  const s = await db.query.subscribers.findFirst({ where: eq(subscribers.id, id) });
  if (!s || s.status !== "pending") return;
  const link = siteUrl(`/newsletter/confirm?token=${encodeURIComponent(s.token)}`);
  const res = await sendEmail({
    to: s.email,
    subject: "Confirm your Sunday note.",
    text: `${s.name ? `Hi ${s.name},\n\n` : ""}Tap the link to confirm you'd like the Sunday note from Simply Being Female:\n${link}\n\nIf this wasn't you, ignore this email and nothing happens.`,
    html: emailShell({
      preheader: "One tap and you're in.",
      bodyHtml: `<h1 style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:30px;margin:0 0 12px">One tap and you're <em style="color:#D9087F">in</em>.</h1>
<p>${s.name ? `Hi ${esc(s.name)}, t` : "T"}ap the button to confirm you'd like the Sunday note.</p>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#9E0962;color:#fff;border-radius:999px;padding:12px 22px;font-weight:800;text-decoration:none;display:inline-block">Confirm my subscription</a></p>
<p style="font-size:14px">If this wasn't you, ignore this email and nothing happens.</p>`,
    }),
    idempotencyKey: `confirm:${s.id}:${s.token}`,
  });
  if (res.ok) await db.update(subscribers).set({ confirmationSentAt: new Date() }).where(eq(subscribers.id, id));
}

export async function sendPendingConfirmations(db: Db): Promise<number> {
  if (!emailReady()) return 0;
  const rows = await db.select({ id: subscribers.id }).from(subscribers).where(and(eq(subscribers.status, "pending"), isNull(subscribers.confirmationSentAt))).limit(200);
  for (const r of rows) await sendConfirmation(db, r.id);
  return rows.length;
}

export async function confirmSubscription(db: Db, token: string): Promise<boolean> {
  if (!token) return false;
  const s = await db.query.subscribers.findFirst({ where: eq(subscribers.token, token) });
  if (!s || s.status === "unsubscribed") return false;
  if (s.status !== "confirmed") await db.update(subscribers).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(subscribers.id, s.id));
  return true;
}

export async function unsubscribe(db: Db, token: string): Promise<boolean> {
  if (!token) return false;
  const s = await db.query.subscribers.findFirst({ where: eq(subscribers.token, token) });
  if (!s) return false;
  if (s.status !== "unsubscribed") await db.update(subscribers).set({ status: "unsubscribed", unsubscribedAt: new Date() }).where(eq(subscribers.id, s.id));
  return true;
}

export async function subscriberCounts(db: Db): Promise<Record<string, number>> {
  const rows = await db.select({ status: subscribers.status, n: sql<number>`count(*)::int` }).from(subscribers).groupBy(subscribers.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

export async function subscribersCsv(db: Db, status: "confirmed" | "all" = "confirmed"): Promise<string> {
  const rows = await db.select().from(subscribers).where(status === "all" ? undefined : eq(subscribers.status, "confirmed")).orderBy(asc(subscribers.createdAt));
  return toCsv(["email", "name", "status", "source", "signed_up", "confirmed"], rows.map((r) => [r.email, r.name, r.status, r.source, r.createdAt, r.confirmedAt]));
}

/* ───────────── Issues ───────────── */

type IssueRow = typeof newsletterIssues.$inferSelect;
type IssueEdit = { subject: string; preheader?: string | null; intro: string; closing?: string | null; articleIds: string[] };

export function issueHash(i: Pick<IssueRow, "subject" | "preheader" | "intro" | "closing" | "articleIds">) {
  return crypto.createHash("sha256").update(JSON.stringify([i.subject.trim(), (i.preheader ?? "").trim(), i.intro.trim(), (i.closing ?? "").trim(), [...i.articleIds].sort()])).digest("hex");
}

export function checkIssue(i: IssueEdit): BrandIssue[] {
  const issues = [
    ...checkBrandCopy({ hook: i.subject }).map((x) => ({ ...x, detail: x.detail.replace(/\bhook\b/, "subject line") })),
    ...checkBrandCopy({ caption: i.intro }).map((x) => ({ ...x, detail: x.detail.replace(/\bcaption\b/, "introduction") })),
    ...(i.preheader ? checkBrandCopy({ supportingCopy: i.preheader }).map((x) => ({ ...x, detail: x.detail.replace(/supporting copy/, "preview text") })) : []),
    ...(i.closing ? checkBrandCopy({ supportingCopy: i.closing }).map((x) => ({ ...x, detail: x.detail.replace(/supporting copy/, "sign-off") })) : []),
  ];
  return issues.filter((x) => x.rule !== "headline-full-stop" || i.subject.length > 0);
}

export async function createIssue(db: Db, actor: Actor): Promise<string> {
  const latest = await db.select({ id: articles.id }).from(articles).where(eq(articles.status, "published")).orderBy(sql`${articles.publishedAt} desc`).limit(3);
  const [row] = await db
    .insert(newsletterIssues)
    .values({ subject: "This week's Sunday note.", intro: "", articleIds: latest.map((a) => a.id), closing: "Until next Sunday." })
    .returning();
  await audit(db, actor, "newsletter.create", "newsletter", row.id);
  return row.id;
}

export async function saveIssue(db: Db, actor: Actor, id: string, edit: IssueEdit): Promise<{ reset: boolean }> {
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i) throw new NewsletterError("Issue not found.");
  if (["sending", "sent", "sent_manually"].includes(i.status)) throw new NewsletterError("This issue has already gone out, so it can't be edited. Duplicate it instead.");
  const next = { subject: edit.subject.trim(), preheader: edit.preheader?.trim() || null, intro: edit.intro.trim(), closing: edit.closing?.trim() || null, articleIds: edit.articleIds };
  if (!next.subject) throw new NewsletterError("The issue needs a subject line.");
  const reset = Boolean(i.approvedHash && issueHash(next) !== i.approvedHash);
  await db
    .update(newsletterIssues)
    .set({ ...next, brandIssues: checkIssue(next), ...(reset ? { status: "draft", approvedHash: null, approvedAt: null, approvedBy: null } : {}), updatedAt: new Date() })
    .where(eq(newsletterIssues.id, id));
  await audit(db, actor, reset ? "newsletter.edit_reset_approval" : "newsletter.save", "newsletter", id, next.subject);
  return { reset };
}

export async function approveIssue(db: Db, actor: Actor, id: string, opts: { override?: boolean } = {}) {
  if (actor.role !== "owner") throw new NewsletterError("Only the owner can approve the Sunday note.");
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i) throw new NewsletterError("Issue not found.");
  if (i.status !== "draft") throw new NewsletterError("Only a draft can be approved.");
  if (!i.intro.trim() && !i.articleIds.length) throw new NewsletterError("Write an introduction or add at least one article first.");
  const issues = checkIssue(i);
  if (hasBlockingIssues(issues) && !opts.override) throw new NewsletterError(`Fix the brand issues first: ${issues.filter((x) => x.severity === "block").map((x) => x.detail).join(" ")}`);
  await db.update(newsletterIssues).set({ status: "approved", approvedHash: issueHash(i), approvedBy: actor.id ?? null, approvedAt: new Date(), brandIssues: issues }).where(eq(newsletterIssues.id, id));
  await audit(db, actor, opts.override && hasBlockingIssues(issues) ? "newsletter.approve_override" : "newsletter.approve", "newsletter", id, i.subject);
}

/** Queue an approved issue for sending. The newsletter:send job delivers it in batches. */
export async function requestSend(db: Db, actor: Actor, id: string) {
  if (actor.role !== "owner") throw new NewsletterError("Only the owner can send the Sunday note.");
  if (!emailReady()) throw new NewsletterError(emailSetupMessage());
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i) throw new NewsletterError("Issue not found.");
  if (!i.approvedHash || i.status !== "approved") throw new NewsletterError("Approve the issue before sending it.");
  if (issueHash(i) !== i.approvedHash) throw new NewsletterError("The issue changed after approval. Approve it again.");
  const claimed = await db
    .update(newsletterIssues)
    .set({ status: "sending", sendRequestedAt: new Date() })
    .where(and(eq(newsletterIssues.id, id), eq(newsletterIssues.status, "approved")))
    .returning();
  if (!claimed.length) throw new NewsletterError("This issue is already sending.");
  await audit(db, actor, "newsletter.send", "newsletter", id, i.subject);
}

export async function markSentManually(db: Db, actor: Actor, id: string, recipients: number) {
  if (actor.role !== "owner") throw new NewsletterError("Only the owner can mark the Sunday note as sent.");
  const i = await db.query.newsletterIssues.findFirst({ where: eq(newsletterIssues.id, id) });
  if (!i || i.status !== "approved") throw new NewsletterError("Only an approved issue can be marked as sent.");
  await db.update(newsletterIssues).set({ status: "sent_manually", sentAt: new Date(), recipientCount: Math.max(0, recipients) }).where(eq(newsletterIssues.id, id));
  await audit(db, actor, "newsletter.sent_manually", "newsletter", id, `${recipients} recipients`);
}

/** Render the issue. `token` personalises the unsubscribe link (omitted for previews and exports). */
export async function renderIssue(db: Db, i: IssueRow, token?: string): Promise<{ subject: string; html: string; text: string; unsubscribeUrl: string }> {
  const list = i.articleIds.length ? await db.select().from(articles).where(and(inArray(articles.id, i.articleIds), eq(articles.status, "published"))) : [];
  const ordered = i.articleIds.map((id) => list.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const unsubscribeUrl = siteUrl(`/newsletter/unsubscribe${token ? `?token=${encodeURIComponent(token)}` : ""}`);
  const para = (t: string) => t.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const cards = ordered
    .map((a) => {
      const url = siteUrl(`/articles/${a.slug}`);
      return `<tr><td style="padding:14px 0;border-top:1px solid #F1D2EC"><a href="${esc(url)}" style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:22px;text-decoration:none">${esc(a.title)}</a>${a.excerpt ? `<p style="margin:6px 0 8px">${esc(a.excerpt)}</p>` : ""}<a href="${esc(url)}" style="color:#9E0962;font-weight:800">Read the article</a></td></tr>`;
    })
    .join("");
  const html = emailShell({
    preheader: i.preheader ?? undefined,
    bodyHtml: `<h1 style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:30px;margin:0 0 16px">${esc(i.subject)}</h1>${para(i.intro)}${cards ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>` : ""}${i.closing ? `<div style="margin-top:18px">${para(i.closing)}</div>` : ""}`,
    footerHtml: `You're getting this because you signed up for the Sunday note at Simply Being Female. <a href="${esc(unsubscribeUrl)}" style="color:#9E0962">Unsubscribe</a>`,
  });
  const text = [
    i.subject,
    "",
    i.intro,
    ...ordered.flatMap((a) => ["", a.title, a.excerpt ?? "", siteUrl(`/articles/${a.slug}`)]),
    ...(i.closing ? ["", i.closing] : []),
    "",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");
  return { subject: i.subject, html, text, unsubscribeUrl };
}

/** Deliver queued issues. A delivery row is claimed before each send, so a crash or a second worker never double-sends. */
export async function sendIssueBatches(db: Db, batchSize = 50): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  if (!emailReady()) return { sent, failed };
  const queued = await db.select().from(newsletterIssues).where(eq(newsletterIssues.status, "sending"));
  for (const issue of queued) {
    if (!issue.approvedHash || issueHash(issue) !== issue.approvedHash) {
      await db.update(newsletterIssues).set({ status: "draft", approvedHash: null }).where(eq(newsletterIssues.id, issue.id));
      await notify(db, "system", "Sunday note stopped", "It changed after approval, so sending was stopped. Approve it again.", "/website/newsletter");
      continue;
    }
    const todo = await db
      .select()
      .from(subscribers)
      .where(
        and(
          eq(subscribers.status, "confirmed"),
          sql`not exists (select 1 from ${newsletterDeliveries} d where d.issue_id = ${issue.id} and d.subscriber_id = ${subscribers.id})`,
        ),
      )
      .limit(batchSize);
    for (const s of todo) {
      const claim = await db.insert(newsletterDeliveries).values({ issueId: issue.id, subscriberId: s.id, status: "sending" }).onConflictDoNothing().returning();
      if (!claim.length) continue;
      const r = await renderIssue(db, issue, s.token);
      const res = await sendEmail({
        to: s.email,
        subject: r.subject,
        html: r.html,
        text: r.text,
        headers: {
          "List-Unsubscribe": `<${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/public/unsubscribe?token=${encodeURIComponent(s.token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        idempotencyKey: `issue:${issue.id}:${s.id}`,
      });
      if (res.ok) {
        sent++;
        await db.update(newsletterDeliveries).set({ status: "sent" }).where(eq(newsletterDeliveries.id, claim[0].id));
      } else {
        failed++;
        await db.update(newsletterDeliveries).set({ status: "failed", error: res.error.slice(0, 500) }).where(eq(newsletterDeliveries.id, claim[0].id));
      }
    }
    if (todo.length < batchSize) {
      const counts = await db
        .select({ status: newsletterDeliveries.status, n: sql<number>`count(*)::int` })
        .from(newsletterDeliveries)
        .where(eq(newsletterDeliveries.issueId, issue.id))
        .groupBy(newsletterDeliveries.status);
      const n = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;
      await db.update(newsletterIssues).set({ status: "sent", sentAt: new Date(), recipientCount: n("sent"), failedCount: n("failed") }).where(eq(newsletterIssues.id, issue.id));
      await notify(db, "system", `Sunday note sent: ${issue.subject}`, `${n("sent")} delivered${n("failed") ? `, ${n("failed")} failed` : ""}.`, "/website/newsletter");
      await logActivity(db, "newsletter:send", "ok", `${issue.subject}: ${n("sent")} sent, ${n("failed")} failed`);
    }
  }
  return { sent, failed };
}

/** Scheduled job: deliver queued confirmations and newsletter batches. */
export async function runNewsletterJob(db: Db) {
  const confirmations = await sendPendingConfirmations(db);
  const r = await sendIssueBatches(db);
  return { confirmations, ...r };
}
