"use server";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { accounts, articles, assets, brandPreferences, campaigns, competitors, designs, interactions, notifications, posts, stories, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { logout } from "@/lib/auth";
import { act } from "@/lib/flash";
import { runResearch } from "@/lib/research";
import { bulkApprovePosts, decideDesign, decidePost, decideStory, duplicatePost, editPost, restoreVersion, schedulePost, unschedulePost } from "@/lib/workflow";
import { regenerateDesign, reviseDesign } from "@/lib/design/engine";
import { confirmManualPublish, publishPost } from "@/lib/publishing";
import { saveUpload } from "@/lib/files";
import { recordFeedback, setPreferenceState } from "@/lib/learning";
import { sendReply, triageInteraction } from "@/lib/community";
import { generateReport } from "@/lib/analytics";
import { runCompetitorReport } from "@/lib/competitors";
import { beginOAuth, upsertAccount, ADAPTERS } from "@/lib/integrations/registry";
import { runJob, type JobName } from "@/lib/jobs";
import { audit, logActivity, setSetting, DEFAULT_SETTINGS, type Settings } from "@/lib/system";
import { recommendTime } from "@/lib/scheduling";
import { DESIGN_FORMATS, renderDesignSvg } from "@/lib/design/render";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const lines = (v: string) => v.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);

export async function logoutAction() {
  await logout();
  redirect("/login");
}

/* ───────────── Research & news ───────────── */

export async function runResearchNow(kind: "daily" | "breaking") {
  await act("editor", async ({ db }) => {
    runResearch(db, kind).catch(() => {});
    return kind === "daily" ? "Research started. New stories appear in Daily News as soon as it finishes." : "Breaking-news check started.";
  }, ["/news"]);
}

export async function storyDecision(f: FormData) {
  const decision = s(f, "decision") as "approve" | "deny" | "save" | "more_research";
  await act("owner", async ({ db, user }) => {
    await decideStory(db, user, s(f, "id"), decision, s(f, "feedback") || undefined, { background: true });
    return {
      approve: "Approved. The editorial brief and social drafts are being prepared.",
      deny: "Denied. Your reason has been recorded for learning.",
      save: "Saved for later.",
      more_research: "More research requested.",
    }[decision];
  }, ["/news", "/editorial", "/content"]);
}

/* ───────────── Editorial ───────────── */

export async function saveArticle(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const id = s(f, "id");
    await db.update(articles).set({ title: s(f, "title"), body: String(f.get("body") ?? ""), status: s(f, "status"), updatedAt: new Date() }).where(eq(articles.id, id));
    await audit(db, user, "article.save", "article", id, s(f, "status"));
    return "Article saved.";
  }, ["/editorial"]);
}

/* ───────────── Social content ───────────── */

export async function updatePost(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const r = await editPost(db, user, s(f, "id"), {
      hook: s(f, "hook"),
      caption: String(f.get("caption") ?? "").trim(),
      supportingCopy: String(f.get("supportingCopy") ?? "").trim() || null,
      callToAction: s(f, "callToAction"),
      hashtags: lines(s(f, "hashtags")),
      altText: s(f, "altText") || null,
      suggestedDate: s(f, "suggestedDate") || null,
      suggestedTime: s(f, "suggestedTime") || null,
      campaignId: s(f, "campaignId") || null,
    });
    return r.reset ? "Saved. This was a substantive change, so the post needs approval again." : "Saved.";
  }, ["/content", "/design", "/planner"]);
}

export async function postDecision(f: FormData) {
  const decision = s(f, "decision") as "approve" | "deny" | "revise" | "save";
  await act("owner", async ({ db, user }) => {
    await decidePost(db, user, s(f, "id"), decision, s(f, "feedback") || undefined, { overrideBrandWarnings: s(f, "override") === "1" });
    return { approve: "Approved. Design options are in the Design Approval Centre.", deny: "Denied.", revise: "Revision requested.", save: "Saved for later." }[decision];
  }, ["/content", "/design"]);
}

export async function bulkApprove(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const ids = f.getAll("ids").map(String);
    if (!ids.length) return "Select some posts first.";
    const r = await bulkApprovePosts(db, user, ids);
    const failed = r.filter((x) => !x.ok);
    return `${r.length - failed.length} approved.${failed.length ? ` ${failed.length} need fixes first: ${failed[0].error}` : ""}`;
  }, ["/content", "/design"]);
}

export async function duplicatePostAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    await duplicatePost(db, user, s(f, "id"));
    return "Duplicated. The copy is awaiting approval.";
  }, ["/content", "/planner"]);
}

export async function restorePostVersion(f: FormData) {
  await act("editor", async ({ db, user }) => {
    await restoreVersion(db, user, s(f, "id"), s(f, "versionId"));
    return "Earlier version restored.";
  }, ["/content"]);
}

/* ───────────── Design ───────────── */

export async function designDecision(f: FormData) {
  const decision = s(f, "decision") as "approve" | "deny" | "changes" | "feedback" | "regenerate";
  await act("owner", async ({ db, user }) => {
    const id = s(f, "id");
    if (decision === "feedback") {
      const fb = s(f, "feedback");
      if (!fb) return "Write what you'd like changed first.";
      await decideDesign(db, user, id, "changes", fb);
      const r = await reviseDesign(db, id, fb);
      return `Revised design ready. ${r.explanation}`;
    }
    if (decision === "regenerate") {
      await regenerateDesign(db, id);
      return "New variation generated.";
    }
    const rec = await decideDesign(db, user, id, decision === "changes" ? "changes" : decision, s(f, "feedback") || undefined);
    return decision === "approve" ? `Design approved. Recommended time: ${rec?.reason ?? ""}` : decision === "deny" ? "Design denied." : "Changes requested.";
  }, ["/design", "/publishing", "/planner"]);
}

export async function editDesign(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const d = await db.query.designs.findFirst({ where: eq(designs.id, s(f, "id")) });
    if (!d?.params) return "Only generated designs can be edited here.";
    const clamp = (v: string, lo: number, hi: number, dflt: number) => (v && Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
    const params = {
      ...d.params,
      headline: s(f, "headline") || d.params.headline,
      emphasis: s(f, "emphasis"),
      poster: s(f, "poster") || undefined,
      script: s(f, "script").split(/\s+/)[0] || undefined,
      layout: s(f, "layout") as typeof d.params.layout,
      lead: s(f, "lead") as typeof d.params.lead,
      canvas: s(f, "canvas") as typeof d.params.canvas,
      headlineScale: clamp(s(f, "headlineScale"), 0.6, 1.8, d.params.headlineScale),
      logoScale: clamp(s(f, "logoScale"), 0.6, 2, d.params.logoScale),
      textDensity: clamp(s(f, "textDensity"), 0.5, 1.5, d.params.textDensity),
    };
    const logo = await db.query.assets.findFirst({ where: eq(assets.kind, "logo") });
    await db.update(designs).set({ params, svg: renderDesignSvg({ format: d.format, params, logoHref: logo ? `/api/files/${logo.id}` : undefined }) }).where(eq(designs.id, d.id));
    await audit(db, user, "design.edit", "design", d.id);
    return "Design updated.";
  }, ["/design"]);
}

export async function uploadDesign(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return "Choose a file to upload.";
    const saved = await saveUpload(file);
    const format = s(f, "format") || "ig_square";
    const dims = DESIGN_FORMATS[format];
    const postId = s(f, "postId") || null;
    await db.insert(designs).values({
      postId,
      format,
      width: dims.w,
      height: dims.h,
      uploadPath: saved.relPath,
      uploadMime: saved.mime,
      source: postId ? "upload" : "template",
      status: "proposed",
      isTemplate: s(f, "template") === "1" || !postId,
      templateName: s(f, "templateName") || file.name,
    });
    await audit(db, user, "design.upload", "design", postId, file.name);
    return "Design uploaded.";
  }, ["/design", "/brand"]);
}

/* ───────────── Planner & publishing ───────────── */

export async function schedulePostAction(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const when = s(f, "when");
    const at = when ? new Date(`${when}:00+10:00`) : null;
    if (!at || isNaN(at.getTime())) return "Choose a date and time.";
    await schedulePost(db, user, s(f, "id"), at, s(f, "accountId") || null, s(f, "recurrence") || null);
    return "Scheduled.";
  }, ["/publishing", "/planner"]);
}

export async function acceptRecommendation(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const p = await db.query.posts.findFirst({ where: eq(posts.id, s(f, "id")) });
    if (!p) return "Post not found.";
    const rec = p.scheduledAt && p.scheduledAt > new Date() ? { at: p.scheduledAt } : await recommendTime(db, { platform: p.platform, category: p.category, storyId: p.storyId, postId: p.id });
    await schedulePost(db, user, p.id, rec.at, s(f, "accountId") || null);
    return "Scheduled at the recommended time.";
  }, ["/publishing", "/planner"]);
}

export async function reschedule(id: string, isoLocalDate: string) {
  await act("owner", async ({ db, user }) => {
    const p = await db.query.posts.findFirst({ where: eq(posts.id, id) });
    if (!p) return "Post not found.";
    const time = p.scheduledAt ? p.scheduledAt.toLocaleTimeString("en-GB", { timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit" }) : "09:00";
    const at = new Date(`${isoLocalDate}T${time}:00+10:00`);
    if (p.status === "scheduled") {
      await unschedulePost(db, user, id);
      await schedulePost(db, user, id, at, p.accountId, p.recurrence);
    } else {
      await db.update(posts).set({ scheduledAt: at, updatedAt: new Date() }).where(eq(posts.id, id));
    }
    return `Moved to ${at.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "short" })}.`;
  }, ["/planner"]);
}

export async function unscheduleAction(f: FormData) {
  await act("owner", async ({ db, user }) => {
    await unschedulePost(db, user, s(f, "id"));
    return "Removed from the schedule.";
  }, ["/publishing", "/planner"]);
}

export async function publishNow(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const p = await db.query.posts.findFirst({ where: eq(posts.id, s(f, "id")) });
    if (p?.status === "approved_for_publishing") await schedulePost(db, user, p.id, new Date(), p.accountId);
    const r = await publishPost(db, s(f, "id"), user);
    return r.status === "published" ? `Published: ${r.detail}` : `${r.status.replace(/_/g, " ")}: ${r.detail ?? ""}`;
  }, ["/publishing", "/planner", "/archive"]);
}

export async function confirmManual(f: FormData) {
  await act("owner", async ({ db, user }) => {
    await confirmManualPublish(db, user, s(f, "id"), s(f, "liveUrl"));
    return "Marked as published and archived.";
  }, ["/publishing", "/archive"]);
}

export async function retryFailed(f: FormData) {
  await act("owner", async ({ db }) => {
    await db.update(posts).set({ status: "scheduled", scheduledAt: new Date(), publishAttempts: 0, lastError: null }).where(and(eq(posts.id, s(f, "id")), eq(posts.status, "failed")));
    const r = await publishPost(db, s(f, "id"));
    return `${r.status.replace(/_/g, " ")}${r.detail ? `: ${r.detail}` : ""}`;
  }, ["/publishing"]);
}

export async function createCampaign(f: FormData) {
  await act("editor", async ({ db }) => {
    await db.insert(campaigns).values({ name: s(f, "name"), description: s(f, "description") || null, startsOn: s(f, "startsOn") || null, endsOn: s(f, "endsOn") || null });
    return "Campaign created.";
  }, ["/planner"]);
}

/* ───────────── Community ───────────── */

export async function replyAction(f: FormData) {
  await act("owner", async ({ db, user }) => {
    await sendReply(db, user, s(f, "id"), String(f.get("text") ?? "").trim());
    return "Reply sent.";
  }, ["/inbox"]);
}

export async function interactionStatus(f: FormData) {
  await act("editor", async ({ db }) => {
    await db.update(interactions).set({ status: s(f, "status") }).where(eq(interactions.id, s(f, "id")));
    return s(f, "status") === "replied" ? "Marked as replied." : "Dismissed.";
  }, ["/inbox"]);
}

export async function addInteraction(f: FormData) {
  await act("editor", async ({ db }) => {
    const [row] = await db.insert(interactions).values({ platform: s(f, "platform") || "instagram", kind: (s(f, "kind") || "comment") as "comment", author: s(f, "author") || "unknown", text: s(f, "text"), isSandbox: s(f, "sandbox") === "1" }).returning();
    await triageInteraction(db, row.id);
    return "Added and triaged.";
  }, ["/inbox"]);
}

/* ───────────── Brand library & intelligence ───────────── */

export async function uploadAsset(f: FormData) {
  await act("editor", async ({ db, user }) => {
    const file = f.get("file");
    let saved: { relPath: string; mime: string; size: number } | null = null;
    if (file instanceof File && file.size) saved = await saveUpload(file);
    const content = String(f.get("content") ?? "").trim() || null;
    if (!saved && !content) return "Add a file or some text.";
    await db.insert(assets).values({ kind: s(f, "kind"), name: s(f, "name") || (file instanceof File ? file.name : "Untitled"), path: saved?.relPath, mime: saved?.mime, size: saved?.size, content, tags: lines(s(f, "tags")) });
    await audit(db, user, "asset.upload", "asset", null, s(f, "name"));
    return "Added to the brand library.";
  }, ["/brand"]);
}

export async function updateAssetContent(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const a = await db.query.assets.findFirst({ where: eq(assets.id, s(f, "id")) });
    if (!a) return "Not found.";
    await db.update(assets).set({ content: String(f.get("content") ?? ""), version: a.version + 1 }).where(eq(assets.id, a.id));
    await audit(db, user, "asset.edit", "asset", a.id, `v${a.version + 1}`);
    return "Saved. New generations will use this version.";
  }, ["/brand"]);
}

export async function deleteAsset(f: FormData) {
  await act("owner", async ({ db }) => {
    const a = await db.query.assets.findFirst({ where: eq(assets.id, s(f, "id")) });
    if (a?.isSourceOfTruth) return "The brand brief is the source of truth and can't be removed. Edit it instead.";
    await db.delete(assets).where(eq(assets.id, s(f, "id")));
    return "Removed.";
  }, ["/brand"]);
}

export async function preferenceAction(f: FormData) {
  await act("owner", async ({ db }) => {
    await setPreferenceState(db, s(f, "id"), s(f, "state") as "confirmed" | "dismissed" | "learned", s(f, "description") || undefined);
    return "Preference updated.";
  }, ["/intelligence"]);
}

export async function addPreference(f: FormData) {
  await act("owner", async ({ db }) => {
    const area = s(f, "area") as "voice";
    const description = s(f, "description");
    const key = `owner_${description.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
    await db.insert(brandPreferences).values({ area, key, description, state: "confirmed", evidenceCount: 1, lastEvidence: "Added by owner" }).onConflictDoNothing();
    await recordFeedback(db, { area, subjectType: "profile", action: "owner_added", feedback: description });
    return "Preference added and confirmed.";
  }, ["/intelligence"]);
}

/* ───────────── Competitors & reports ───────────── */

export async function addCompetitor(f: FormData) {
  await act("editor", async ({ db }) => {
    const handles: Record<string, string> = {};
    for (const p of ["instagram", "tiktok", "facebook", "linkedin"]) if (s(f, p)) handles[p] = s(f, p);
    await db.insert(competitors).values({ name: s(f, "name"), url: s(f, "url") || null, handles, notes: s(f, "notes") || null });
    return "Competitor added.";
  }, ["/competitors"]);
}

export async function removeCompetitor(f: FormData) {
  await act("editor", async ({ db }) => {
    await db.delete(competitors).where(eq(competitors.id, s(f, "id")));
    return "Removed.";
  }, ["/competitors"]);
}

export async function runCompetitorsNow() {
  await act("editor", async ({ db }) => {
    runCompetitorReport(db).catch((e) => logActivity(db, "competitors:weekly", "failed", String(e)));
    return "Competitor review started. The report appears here when it's done.";
  }, ["/competitors"]);
}

export async function generateReportAction(f: FormData) {
  await act("editor", async ({ db }) => {
    await generateReport(db, s(f, "kind") as "weekly");
    return "Report generated.";
  }, ["/analytics"]);
}

/* ───────────── Integrations ───────────── */

export async function connectOAuth(f: FormData) {
  let url: string | null = null;
  await act("owner", async ({ db }) => {
    url = await beginOAuth(db, s(f, "platform"));
  }, ["/integrations"]);
  if (url) redirect(url);
}

export async function connectAppPassword(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const platform = s(f, "platform");
    const a = ADAPTERS[platform];
    if (!a?.connect) return "This network doesn't use app passwords.";
    const creds = await a.connect({ handle: s(f, "handle"), secret: s(f, "secret") });
    await upsertAccount(db, platform, creds, null);
    await audit(db, user, "account.connect", "account", null, platform);
    return `${a.name} connected.`;
  }, ["/integrations"]);
}

export async function addSandboxAccount(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const platform = s(f, "platform");
    await upsertAccount(db, platform, { accessToken: "sandbox", handle: `@sbf-sandbox-${platform}` }, null, undefined, "sandbox");
    await audit(db, user, "account.sandbox", "account", null, platform);
    return `Sandbox ${platform} account added. Posts "publish" to a test address only.`;
  }, ["/integrations"]);
}

export async function disconnectAccount(f: FormData) {
  await act("owner", async ({ db, user }) => {
    await db.update(accounts).set({ status: "disconnected", encryptedAccessToken: null, encryptedRefreshToken: null }).where(eq(accounts.id, s(f, "id")));
    await audit(db, user, "account.disconnect", "account", s(f, "id"));
    return "Disconnected and tokens deleted.";
  }, ["/integrations"]);
}

/* ───────────── Team ───────────── */

export async function addTeamMember(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const email = s(f, "email").toLowerCase();
    const password = String(f.get("password") ?? "");
    const role = s(f, "role");
    if (!["owner", "editor", "viewer"].includes(role)) return "Choose a role.";
    if (password.length < 12) return "Use a password of at least 12 characters.";
    const exists = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (exists) return "Someone with that email already has access.";
    await db.insert(users).values({ email, name: s(f, "name") || email, role, passwordHash: hashPassword(password) });
    await audit(db, user, "team.add", "user", null, `${email} as ${role}`);
    return `${email} added as ${role}. Share the password with them privately.`;
  }, ["/settings"]);
}

export async function updateTeamMember(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const id = s(f, "id");
    if (id === user.id) return "You can't change your own access here.";
    if (s(f, "remove") === "1") {
      await db.delete(users).where(eq(users.id, id));
      await audit(db, user, "team.remove", "user", id);
      return "Access removed.";
    }
    await db.update(users).set({ role: s(f, "role") }).where(eq(users.id, id));
    await audit(db, user, "team.role", "user", id, s(f, "role"));
    return "Role updated.";
  }, ["/settings"]);
}

export async function changeOwnPassword(f: FormData) {
  await act("viewer", async ({ db, user }) => {
    const current = String(f.get("current") ?? "");
    const next = String(f.get("next") ?? "");
    const row = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!row || !verifyPassword(current, row.passwordHash)) return "Your current password doesn't match.";
    if (next.length < 12) return "Use a new password of at least 12 characters.";
    await db.update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, user.id));
    await audit(db, user, "team.password_change", "user", user.id);
    return "Password changed.";
  }, ["/settings"]);
}

/* ───────────── Settings, automation, notifications ───────────── */

export async function saveSettings(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const num = (k: string, d: number) => (Number.isFinite(+s(f, k)) && s(f, k) ? +s(f, k) : d);
    await setSetting(db, "automationEnabled", f.get("automationEnabled") === "on");
    await setSetting(db, "autoReplyEnabled", f.get("autoReplyEnabled") === "on");
    await setSetting(db, "autoReplyCategories", f.getAll("autoReplyCategories").map(String).filter((c) => ["positive", "general"].includes(c)));
    await setSetting(db, "maxPostsPerDayPerPlatform", num("maxPostsPerDayPerPlatform", DEFAULT_SETTINGS.maxPostsPerDayPerPlatform));
    await setSetting(db, "minHoursBetweenSimilarTopics", num("minHoursBetweenSimilarTopics", DEFAULT_SETTINGS.minHoursBetweenSimilarTopics));
    const balance: Settings["editorialBalance"] = {};
    for (const k of Object.keys(DEFAULT_SETTINGS.editorialBalance)) balance[k] = num(`balance_${k}`, DEFAULT_SETTINGS.editorialBalance[k]);
    await setSetting(db, "editorialBalance", balance);
    const prefs: Settings["notificationPreferences"] = {};
    for (const k of ["research_ready", "breaking_story", "brief_ready", "content_awaiting", "design_awaiting", "post_scheduled", "post_published", "publish_failed", "manual_publish_needed", "interaction", "report_ready", "system"] as const) prefs[k] = f.get(`notify_${k}`) === "on";
    await setSetting(db, "notificationPreferences", prefs);
    await audit(db, user, "settings.save", "settings");
    return "Settings saved.";
  }, ["/settings"]);
}

export async function runJobNow(f: FormData) {
  await act("owner", async ({ db }) => {
    const name = s(f, "job") as JobName;
    runJob(db, name, { force: true }).catch(() => {});
    return `${name} started. See the activity log below.`;
  }, ["/settings"]);
}

export async function markNotifications(f: FormData) {
  await act("viewer", async ({ db }) => {
    const id = s(f, "id");
    if (id) await db.update(notifications).set({ read: true }).where(eq(notifications.id, id));
    else await db.update(notifications).set({ read: true }).where(eq(notifications.read, false));
  }, ["/notifications"]);
}

export async function archivePosts(f: FormData) {
  await act("owner", async ({ db }) => {
    await db.update(posts).set({ status: "archived" }).where(inArray(posts.id, f.getAll("ids").map(String)));
    return "Archived.";
  }, ["/archive", "/content"]);
}

export async function deleteStoryDemoData() {
  await act("owner", async ({ db }) => {
    await db.update(stories).set({ status: "denied", decisionFeedback: "Demo data cleared" }).where(and(eq(stories.isDemo, true), eq(stories.status, "pending")));
    return "Demo stories cleared.";
  }, ["/news"]);
}
