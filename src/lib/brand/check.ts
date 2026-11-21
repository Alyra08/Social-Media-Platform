import type { BrandIssue } from "@/db/schema";
import { FIXED_TAGLINE } from "./tokens";

/**
 * Deterministic brand-rule checker. Runs on every generated or edited piece of copy
 * before it reaches the approval centre. "block" issues prevent approval until fixed
 * (or explicitly overridden by the owner); "warn" issues are shown on the card.
 */
const AVOID_WORDS: { re: RegExp; label: string }[] = [
  { re: /\bempower(s|ed|ing)?\b/i, label: "empower (as a verb)" },
  { re: /\bjourney(s)?\b/i, label: "journey" },
  { re: /\bunlock(s|ed|ing)?\b/i, label: "unlock" },
  { re: /\belevat(e|es|ed|ing)\b/i, label: "elevate" },
  { re: /\bgame[- ]?chang(ing|er)\b/i, label: "game-changing" },
  { re: /\bgirl ?boss\b/i, label: "girl boss" },
  { re: /\bslay(s|ed|ing)?\b/i, label: "slay" },
  { re: /\bqueens?\b/i, label: "queen" },
  { re: /we'?re on a mission/i, label: "we're on a mission" },
];

const WAR_WORDS = /\b(war|wars|warrior|warriors|army|armies|battle|battles|battlefield|uprising|fight(s|ing)? back|soldier|troops|weapon|arsenal|enemy|combat|frontline|front line|crusade)\b/i;

const VAGUE_CTAS = /\b(click here|learn more|submit)\b/i;

// Emoji and pictographs (✦ is permitted).
const EMOJI = /(?!✦)[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

// Numbers that look like statistics (percentages, "x in y", large counts).
const STAT_LIKE = /(\b\d{1,3}(\.\d+)?\s?%|\b\d+\s+(in|out of)\s+\d+\b|\b\d{1,3}(,\d{3})+\b|\b\d+(\.\d+)?\s?(million|billion|thousand)\b)/i;

const AMERICAN_SPELLINGS: [RegExp, string][] = [
  [/\bcolor(s|ed|ful)?\b/i, "colour"],
  [/\borganiz(e|ed|ation|ing)\b/i, "organise"],
  [/\brecogniz(e|ed|ing)\b/i, "recognise"],
  [/\bprioritiz(e|ed|ing)\b/i, "prioritise"],
  [/\bfavorite(s)?\b/i, "favourite"],
  [/\bbehavior(s)?\b/i, "behaviour"],
  [/\bcenter(s|ed)?\b/i, "centre"],
  [/\bapologiz(e|ed|ing)\b/i, "apologise"],
  [/\bmom(s)?\b/i, "mum"],
  [/\blabor\b/i, "labour"],
  [/\bjudgment\b/i, "judgement"],
];

export type CheckInput = {
  hook?: string | null;
  caption?: string | null;
  supportingCopy?: string | null;
  callToAction?: string | null;
  taglines?: string[] | null;
  hashtags?: string[] | null;
  /** statements that are backed by a verified source (allowed to contain figures) */
  sourcedStatements?: string[];
};

export function checkBrandCopy(input: CheckInput): BrandIssue[] {
  const issues: BrandIssue[] = [];
  const fields: [string, string][] = [
    ["hook", input.hook ?? ""],
    ["caption", input.caption ?? ""],
    ["supporting copy", input.supportingCopy ?? ""],
    ["call to action", input.callToAction ?? ""],
    ...(input.taglines ?? []).map((t, i) => [`tagline ${i + 1}`, t] as [string, string]),
  ];

  for (const [name, text] of fields) {
    if (!text) continue;
    if (text.includes("!")) issues.push({ rule: "no-exclamation", severity: "block", detail: `Exclamation mark in ${name}.` });
    if (EMOJI.test(text)) issues.push({ rule: "no-emoji", severity: "block", detail: `Emoji in ${name}. The only decorative glyph is ✦.` });
    for (const w of AVOID_WORDS) {
      if (w.re.test(text)) issues.push({ rule: "avoid-word", severity: "block", detail: `"${w.label}" in ${name} is on the avoid list.` });
    }
    const war = text.match(WAR_WORDS);
    if (war) issues.push({ rule: "no-war-language", severity: "block", detail: `"${war[0]}" in ${name}: no war, army, battle or uprising language.` });
    for (const [re, uk] of AMERICAN_SPELLINGS) {
      const m = text.match(re);
      if (m) issues.push({ rule: "british-spelling", severity: "warn", detail: `"${m[0]}" in ${name}: use British spelling (${uk}).` });
    }
    if (/[A-Z]{4,}/.test(text.replace(/\b(SBF|TikTok|LinkedIn|URL|SEO|CTA|AI|NDIS|ABS|WGEA|UK|US|USA|UN|WHO)\b/g, ""))) {
      issues.push({ rule: "sentence-case", severity: "warn", detail: `Typed uppercase in ${name}. Uppercase is a design style only.` });
    }
    // Stat-like figures must be traceable to a verified source.
    const stat = text.match(STAT_LIKE);
    if (stat) {
      const sourced = (input.sourcedStatements ?? []).some((s) => s.includes(stat[0]));
      if (!sourced) {
        issues.push({
          rule: "unverified-figure",
          severity: "block",
          detail: `"${stat[0]}" in ${name} isn't linked to a verified source. Use a sourced figure or a placeholder like [real figure].`,
        });
      }
    }
  }

  // Fixed tagline must never be rewritten.
  const all = fields.map((f) => f[1]).join("\n");
  if (/unapologetically fierce/i.test(all) && !all.includes(FIXED_TAGLINE) && !/unapologetically fierce, beautifully imperfect woman/.test(all)) {
    issues.push({ rule: "fixed-tagline", severity: "block", detail: `The tagline is fixed: "${FIXED_TAGLINE}"` });
  }

  if (input.callToAction && VAGUE_CTAS.test(input.callToAction)) {
    issues.push({ rule: "cta", severity: "block", detail: 'CTAs say exactly what happens. Never "Click here", "Submit" or "Learn more".' });
  }

  if (input.hook && input.hook.length > 0 && input.hook.length <= 90 && !/[.?…]$/.test(input.hook.trim())) {
    issues.push({ rule: "headline-full-stop", severity: "warn", detail: "Short declarative headlines end with a full stop." });
  }

  for (const tag of input.hashtags ?? []) {
    if (/girlboss|slay|queen|empower/i.test(tag)) {
      issues.push({ rule: "avoid-word", severity: "block", detail: `Hashtag ${tag} uses an avoid-list word.` });
    }
  }

  // De-duplicate identical messages.
  const seen = new Set<string>();
  return issues.filter((i) => (seen.has(i.detail) ? false : (seen.add(i.detail), true)));
}

export const hasBlockingIssues = (issues: BrandIssue[]) => issues.some((i) => i.severity === "block");
