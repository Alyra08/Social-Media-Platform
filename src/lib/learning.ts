import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { brandPreferences, feedbackEvents } from "@/db/schema";

/**
 * Brand Intelligence Engine.
 * Every approval, denial, edit and piece of feedback is recorded as a feedback event and
 * mapped to preference signals. A signal seen once is a "candidate" (possibly a one-off);
 * once it has been seen LEARN_THRESHOLD times it becomes "learned" and is applied to future
 * generations. The owner can confirm, edit or dismiss any preference. Preferences never
 * override the brand brief: they only tune choices the brief leaves open.
 */
export const LEARN_THRESHOLD = 3;

export type Area = "voice" | "editorial" | "visual" | "seo" | "audience" | "performance" | "community";

type SignalDef = { area: Area; key: string; description: string; patterns: RegExp[] };

export const SIGNALS: SignalDef[] = [
  // Visual
  { area: "visual", key: "headline_larger", description: "Larger, more prominent headlines", patterns: [/headline (larger|bigger|more prominent)/i, /(larger|bigger) headline/i] },
  { area: "visual", key: "headline_smaller", description: "Smaller headlines", patterns: [/headline (smaller|too big)/i, /smaller headline/i] },
  { area: "visual", key: "logo_larger", description: "More prominent logo", patterns: [/logo (more prominent|bigger|larger)/i, /(bigger|larger) logo/i] },
  { area: "visual", key: "more_pink", description: "More Hot Pink as the lead colour", patterns: [/more pink/i, /pinker/i] },
  { area: "visual", key: "more_red", description: "More Signal Red as the lead colour", patterns: [/more red/i] },
  { area: "visual", key: "less_text", description: "Less text and less clutter on designs", patterns: [/(less|reduce( the)?( amount of)?) text/i, /less clutter/i, /too busy/i, /too much text/i] },
  { area: "visual", key: "natural_imagery", description: "More natural, real photography", patterns: [/more natural/i, /less stock/i, /real (photo|women)/i] },
  { area: "visual", key: "stronger_contrast", description: "Stronger colour contrast", patterns: [/stronger contrast/i, /more contrast/i] },
  { area: "visual", key: "less_corporate", description: "Less corporate look", patterns: [/less corporate/i, /too corporate/i] },
  { area: "visual", key: "more_editorial", description: "More editorial, magazine-style layouts", patterns: [/more editorial/i, /magazine/i] },
  // Voice
  { area: "voice", key: "shorter", description: "Shorter captions", patterns: [/(too long|shorter|cut it down|trim)/i] },
  { area: "voice", key: "less_formal", description: "Less formal, more conversational", patterns: [/too formal/i, /more conversational/i, /stiff/i] },
  { area: "voice", key: "more_humour", description: "More dry wit and humour", patterns: [/(funnier|more humou?r|more wit|cheekier)/i] },
  { area: "voice", key: "less_preachy", description: "Less preachy", patterns: [/preachy/i, /lecturing/i] },
  { area: "voice", key: "more_specific", description: "More specific, concrete detail", patterns: [/more specific/i, /too vague/i, /too generic/i] },
  { area: "voice", key: "more_founder", description: "More founder confession (first person)", patterns: [/more personal/i, /confess/i, /founder voice/i] },
  { area: "voice", key: "stronger_hook", description: "Stronger opening hooks", patterns: [/(weak|boring|stronger) hook/i, /opening line/i] },
  // SEO
  { area: "seo", key: "fewer_hashtags", description: "Fewer hashtags", patterns: [/(fewer|less|too many) hashtags/i] },
  { area: "seo", key: "more_keywords", description: "More natural search keywords in captions", patterns: [/more keywords/i, /seo/i] },
  // Editorial
  { area: "editorial", key: "prefer_australian", description: "Prioritise Australian stories", patterns: [/(too )?(american|us[- ]focused|not australian)/i, /more australian/i] },
  { area: "editorial", key: "avoid_repeats", description: "Avoid topics already covered", patterns: [/already covered/i, /repeat/i, /done this/i] },
  { area: "editorial", key: "balance_positive", description: "Balance heavy topics with positive stories", patterns: [/too (negative|depressing|heavy)/i] },
  { area: "editorial", key: "avoid_celebrity", description: "Avoid celebrity-led stories", patterns: [/celebrit/i] },
  { area: "editorial", key: "need_stronger_sources", description: "Require stronger, primary sources", patterns: [/(weak|poor|unreliable) source/i, /not credible/i] },
  { area: "editorial", key: "off_brand", description: "Stories must clearly connect to SBF's audience", patterns: [/not relevant/i, /off[- ]brand/i, /not for us/i] },
  // Community
  { area: "community", key: "warmer_replies", description: "Warmer, more personal replies", patterns: [/warmer/i, /more personal/i] },
  { area: "community", key: "shorter_replies", description: "Shorter replies", patterns: [/shorter/i, /too long/i] },
];

export function extractSignals(text: string | null | undefined, areas?: Area[]): SignalDef[] {
  if (!text) return [];
  return SIGNALS.filter((s) => (!areas || areas.includes(s.area)) && s.patterns.some((p) => p.test(text)));
}

async function bump(db: Db, area: Area, key: string, description: string, evidence: string, value?: unknown) {
  const existing = await db.query.brandPreferences.findFirst({
    where: and(eq(brandPreferences.area, area), eq(brandPreferences.key, key)),
  });
  if (!existing) {
    await db.insert(brandPreferences).values({ area, key, description, value: value ?? null, evidenceCount: 1, state: "candidate", lastEvidence: evidence });
    return;
  }
  if (existing.state === "dismissed") return; // owner said no — never re-learn silently
  const count = existing.evidenceCount + 1;
  const state = existing.state === "confirmed" ? "confirmed" : count >= LEARN_THRESHOLD ? "learned" : "candidate";
  await db
    .update(brandPreferences)
    .set({ evidenceCount: count, state, lastEvidence: evidence, updatedAt: new Date(), ...(value !== undefined ? { value } : {}) })
    .where(eq(brandPreferences.id, existing.id));
}

export async function recordFeedback(
  db: Db,
  e: { area: Area; subjectType: string; subjectId?: string; action: string; feedback?: string | null; extraSignals?: { key: string; description: string; value?: unknown }[] },
) {
  const areas: Area[] = e.area === "visual" ? ["visual"] : e.area === "editorial" ? ["editorial"] : e.area === "community" ? ["community"] : ["voice", "seo"];
  const matched = extractSignals(e.feedback, areas);
  await db.insert(feedbackEvents).values({
    area: e.area,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    action: e.action,
    feedback: e.feedback ?? null,
    signals: [...matched.map((m) => `${m.area}.${m.key}`), ...(e.extraSignals ?? []).map((s) => `${e.area}.${s.key}`)],
  });
  const evidence = `${e.action} ${e.subjectType}${e.feedback ? `: "${e.feedback.slice(0, 200)}"` : ""}`;
  for (const m of matched) await bump(db, m.area, m.key, m.description, evidence);
  for (const s of e.extraSignals ?? []) await bump(db, e.area, s.key, s.description, evidence, s.value);
}

/** Preferences that are applied to generation: learned (repeated) or owner-confirmed. */
export async function activePreferences(db: Db, areas?: Area[]) {
  const rows = await db
    .select()
    .from(brandPreferences)
    .where(
      areas
        ? and(inArray(brandPreferences.state, ["learned", "confirmed"]), inArray(brandPreferences.area, areas))
        : inArray(brandPreferences.state, ["learned", "confirmed"]),
    );
  return rows;
}

export async function learnedGuidance(db: Db, areas: Area[]): Promise<string> {
  const prefs = await activePreferences(db, areas);
  if (!prefs.length) return "";
  return (
    "Learned preferences from the owner's past decisions (apply them unless they conflict with the brand brief, which always wins):\n" +
    prefs.map((p) => `- [${p.area}] ${p.description}${p.state === "confirmed" ? " (confirmed by owner)" : ` (seen ${p.evidenceCount} times)`}`).join("\n")
  );
}

export async function setPreferenceState(db: Db, id: string, state: "confirmed" | "dismissed" | "candidate" | "learned", description?: string) {
  await db
    .update(brandPreferences)
    .set({ state, ...(description ? { description } : {}), updatedAt: new Date() })
    .where(eq(brandPreferences.id, id));
}

export async function preferenceCounts(db: Db) {
  return db
    .select({ area: brandPreferences.area, state: brandPreferences.state, n: sql<number>`count(*)::int` })
    .from(brandPreferences)
    .groupBy(brandPreferences.area, brandPreferences.state);
}
