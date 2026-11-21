import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { accounts, interactions } from "@/db/schema";
import { aiEnabled, structured } from "./ai/client";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { checkBrandCopy } from "./brand/check";
import { learnedGuidance, recordFeedback } from "./learning";
import { adapterFor, credentialsFor } from "./integrations/registry";
import { audit, getSetting, logActivity, notify, type Actor } from "./system";

/**
 * Community Engagement Centre.
 * Safeguard 5: sensitive disclosures, allegations, medical/legal questions, threats, domestic
 * violence and highly personal situations are NEVER answered automatically. Auto-replies are off
 * by default and, when the owner enables them, only cover low-risk categories she selects.
 */
const SENSITIVE_PATTERNS: [RegExp, string][] = [
  [/\b(abuse[ds]?|abusive|hit me|hits me|coercive|controlling partner|domestic violence|\bdv\b|family violence)\b/i, "Possible domestic or family violence disclosure"],
  [/\b(suicid|kill myself|self[- ]harm|end it all|don'?t want to (live|be here))/i, "Possible risk to life"],
  [/\b(rape[ds]?|sexual(ly)? assault|harass(ed|ment)|molest)/i, "Sexual harm disclosure or allegation"],
  [/\b(lawyer|legal advice|sue|court|custody|visa|divorce settlement)\b/i, "Legal question"],
  [/\b(doctor|diagnos|medication|symptom|pregnan|miscarr|cancer|prescri|dosage)\w*/i, "Medical question"],
  [/\b(threat|i'?ll find you|watch your back|kill you)\b/i, "Threat"],
  [/\b(scam(med)?|fraud|stole|allegation|accus)/i, "Allegation"],
];

export function detectSensitive(text: string): string | null {
  for (const [re, why] of SENSITIVE_PATTERNS) if (re.test(text)) return why;
  return null;
}

function heuristicCategory(text: string): string {
  if (/https?:\/\/|follow for follow|dm me to earn|crypto|giveaway winner/i.test(text)) return "spam";
  if (/\?\s*$|\b(how|what|when|where|can i|do you|is there)\b/i.test(text)) return "question";
  if (/\b(collab|partner(ship)?|sponsor|work together|pr package)\b/i.test(text)) return "collaboration";
  if (/\b(advice|should i|what would you do)\b/i.test(text)) return "advice";
  if (/\b(i remember|when i was|my (husband|partner|mum|boss|kids?)|happened to me)\b/i.test(text)) return "experience";
  if (/\b(love|thank|needed this|so true|yes)\b/i.test(text)) return "positive";
  if (/\b(disappointed|terrible|unfollow|rubbish|hate)\b/i.test(text)) return "negative";
  if (/\b(refund|complain|didn'?t receive|charged)\b/i.test(text)) return "complaint";
  return "general";
}

const PRIORITY: Record<string, number> = { sensitive: 3, complaint: 3, question: 2, advice: 2, experience: 2, collaboration: 2, negative: 1, positive: 1, general: 0, spam: 0 };

const TriageSchema = z.object({
  category: z.enum(["positive", "question", "general", "experience", "advice", "complaint", "negative", "sensitive", "collaboration", "spam"]),
  sensitive: z.boolean(),
  sensitiveReason: z.string().nullable(),
  needsPersonalResponse: z.boolean(),
  suggestPrivate: z.boolean(),
  harmful: z.boolean(),
  suggestedReply: z.string().nullable().describe("null when the owner must respond personally"),
});

export async function triageInteraction(db: Db, id: string) {
  const it = await db.query.interactions.findFirst({ where: eq(interactions.id, id) });
  if (!it) return;
  const ruleSensitive = detectSensitive(it.text);
  let t: z.infer<typeof TriageSchema> = {
    category: ruleSensitive ? "sensitive" : (heuristicCategory(it.text) as z.infer<typeof TriageSchema>["category"]),
    sensitive: Boolean(ruleSensitive),
    sensitiveReason: ruleSensitive,
    needsPersonalResponse: Boolean(ruleSensitive),
    suggestPrivate: Boolean(ruleSensitive),
    harmful: false,
    suggestedReply: null,
  };
  if (aiEnabled()) {
    try {
      const guidance = await learnedGuidance(db, ["community"]);
      const past = await db.select({ q: interactions.text, a: interactions.replyText }).from(interactions).where(eq(interactions.status, "replied")).orderBy(desc(interactions.repliedAt)).limit(8);
      const ai = await structured({
        schema: TriageSchema,
        system: SBF_BRAND_BRIEF,
        task: `You are the SBF community manager. Categorise this ${it.kind} and, unless it needs a personal response from the founder, draft a short reply in the SBF voice (warm, honest, no exclamation marks, no emoji). Mark as sensitive anything involving disclosures of harm, allegations, medical or legal questions, threats, domestic violence or highly personal situations; for those, set suggestedReply to null and suggestPrivate to true. Flag harmful or inappropriate content.
${guidance}
Examples of how the founder has replied before:\n${past.map((p) => `Q: ${p.q}\nA: ${p.a}`).join("\n\n") || "none yet"}`,
        input: `${it.platform} ${it.kind} from ${it.author}:\n${it.text}`,
        effort: "low",
        maxTokens: 4000,
      });
      t = { ...ai, sensitive: ai.sensitive || Boolean(ruleSensitive), sensitiveReason: ai.sensitiveReason ?? ruleSensitive };
    } catch {
      /* heuristic triage stands */
    }
  }
  if (t.sensitive) {
    t.category = "sensitive";
    t.suggestedReply = null; // never draft a public reply to a sensitive disclosure
    t.needsPersonalResponse = true;
  }
  if (t.suggestedReply && checkBrandCopy({ caption: t.suggestedReply }).some((i) => i.severity === "block")) t.suggestedReply = null;
  await db
    .update(interactions)
    .set({
      category: t.category,
      sensitive: t.sensitive,
      sensitiveReason: t.sensitiveReason,
      needsPersonalResponse: t.needsPersonalResponse,
      suggestPrivate: t.suggestPrivate,
      priority: t.harmful ? 3 : PRIORITY[t.category] ?? 1,
      suggestedReply: t.suggestedReply,
      status: t.suggestedReply ? "drafted" : "new",
    })
    .where(eq(interactions.id, id));

  // Notify only for meaningful interactions — not every like or routine comment.
  if (["question", "advice", "experience", "sensitive", "complaint", "collaboration"].includes(t.category) || it.kind === "dm") {
    await notify(db, "interaction", t.sensitive ? `Sensitive ${it.kind} needs your personal attention` : `New ${t.category} ${it.kind} from ${it.author}`, it.text.slice(0, 160), "/inbox");
  }
  await maybeAutoReply(db, id);
}

async function maybeAutoReply(db: Db, id: string) {
  const enabled = await getSetting(db, "autoReplyEnabled");
  if (!enabled) return;
  const cats = await getSetting(db, "autoReplyCategories");
  const it = await db.query.interactions.findFirst({ where: eq(interactions.id, id) });
  if (!it || it.sensitive || it.needsPersonalResponse || !it.suggestedReply || !cats.includes(it.category) || it.kind === "dm") return;
  if (detectSensitive(it.text)) return; // belt and braces
  await sendReply(db, { id: null, email: "auto-reply" }, id, it.suggestedReply, true);
}

export async function sendReply(db: Db, actor: Actor, id: string, text: string, auto = false) {
  const it = await db.query.interactions.findFirst({ where: eq(interactions.id, id) });
  if (!it) throw new Error("Interaction not found");
  if (auto && (it.sensitive || it.needsPersonalResponse)) throw new Error("Sensitive interactions can't be answered automatically.");
  const issues = checkBrandCopy({ caption: text }).filter((i) => i.severity === "block");
  if (issues.length) throw new Error(issues.map((i) => i.detail).join(" "));
  const acc = it.accountId ? await db.query.accounts.findFirst({ where: eq(accounts.id, it.accountId) }) : null;
  if (acc && acc.mode === "live" && it.externalId) {
    const adapter = adapterFor(acc.platform);
    if (!adapter?.reply) throw new Error(`${acc.platform} replies aren't supported through the API. Reply in the app, then mark as replied.`);
    await adapter.reply(credentialsFor(acc), it.externalId, text);
  }
  await db.update(interactions).set({ status: "replied", replyText: text, repliedAt: new Date(), repliedBy: actor.id ?? null, autoReplied: auto }).where(eq(interactions.id, id));
  await audit(db, actor, auto ? "interaction.auto_reply" : "interaction.reply", "interaction", id, text.slice(0, 200));
  if (!auto && it.suggestedReply && it.suggestedReply !== text) {
    await recordFeedback(db, { area: "community", subjectType: "interaction", subjectId: id, action: "edit_reply", feedback: text.length < it.suggestedReply.length * 0.7 ? "shorter" : undefined });
  }
}

/** Pull new comments/mentions from connected accounts (where the API supports it). */
export async function syncInteractions(db: Db) {
  const accs = await db.select().from(accounts).where(and(eq(accounts.status, "connected"), eq(accounts.mode, "live")));
  let n = 0;
  for (const acc of accs) {
    const a = adapterFor(acc.platform);
    if (!a?.fetchInteractions) continue;
    try {
      const items = await a.fetchInteractions(credentialsFor(acc), new Date(Date.now() - 2 * 86400_000));
      for (const i of items) {
        const exists = await db.query.interactions.findFirst({ where: and(eq(interactions.externalId, i.externalId), eq(interactions.platform, acc.platform)) });
        if (exists) continue;
        const [row] = await db.insert(interactions).values({ accountId: acc.id, platform: acc.platform, kind: i.kind, externalId: i.externalId, author: i.author, text: i.text, receivedAt: i.receivedAt ?? new Date() }).returning();
        await triageInteraction(db, row.id);
        n++;
      }
    } catch (e) {
      await logActivity(db, "community:sync", "failed", `${acc.platform}: ${(e as Error).message}`);
    }
  }
  await logActivity(db, "community:sync", "ok", `${n} new interactions`);
}

export async function openInteractionCount(db: Db) {
  return (await db.select({ id: interactions.id }).from(interactions).where(inArray(interactions.status, ["new", "drafted"]))).length;
}
