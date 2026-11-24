import type { DesignParams } from "@/db/schema";
import { FONTS, isFontKey } from "./fonts";

/**
 * Pure rules shared by the visual editor (in the browser) and the server:
 * - which platform/post format each design size belongs to
 * - plain-English requests → design changes (works without AI)
 * - live brand checks on a design's words and motifs
 * No database or Node imports, so it is safe to run client-side.
 */

export const LAYOUTS: { key: DesignParams["layout"]; label: string }[] = [
  { key: "poster", label: "Poster" },
  { key: "editorial", label: "Editorial" },
  { key: "quote", label: "Quote" },
  { key: "stripe", label: "Stripe" },
  { key: "arch", label: "Arch" },
];
export const LEADS: { key: DesignParams["lead"]; label: string; hex: string }[] = [
  { key: "signal", label: "Signal Red", hex: "#FD0019" },
  { key: "hot", label: "Hot Pink", hex: "#FF006C" },
  { key: "tangerine", label: "Tangerine", hex: "#FB6526" },
];
export const CANVASES: { key: DesignParams["canvas"]; label: string; hex: string }[] = [
  { key: "blush", label: "Blush", hex: "#FFECEF" },
  { key: "shell", label: "Shell", hex: "#FFF9FA" },
  { key: "roseMist", label: "Rose Mist", hex: "#FFE0E3" },
  { key: "candy", label: "Candy", hex: "#FFE0ED" },
  { key: "peach", label: "Peach", hex: "#FEE0D4" },
  { key: "peachCream", label: "Peach Cream", hex: "#FFF6F2" },
];
export const MOTIFS: { key: DesignParams["motifs"][number]; label: string }[] = [
  { key: "arch", label: "Arch" },
  { key: "flower", label: "70s flower" },
  { key: "heart", label: "Hearts" },
  { key: "badge", label: "SBF badge" },
  { key: "stripe", label: "Stripe" },
];

/** Design size → the platform and post format it is for. */
export const FORMAT_TO_POST: Record<string, { platform: string; format: string }> = {
  ig_portrait: { platform: "instagram", format: "post" },
  ig_square: { platform: "instagram", format: "post" },
  carousel: { platform: "instagram", format: "carousel" },
  story: { platform: "instagram", format: "story" },
  reel_cover: { platform: "tiktok", format: "reel" },
  facebook: { platform: "facebook", format: "post" },
  pinterest: { platform: "pinterest", format: "pin" },
  linkedin: { platform: "linkedin", format: "post" },
  x: { platform: "x", format: "post" },
  quote: { platform: "instagram", format: "post" },
  infographic: { platform: "instagram", format: "carousel" },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Keep any params inside the brand's limits (also used to validate what the browser sends). */
export function tidyParams(p: DesignParams): DesignParams {
  const words = (s?: string) => (s ?? "").trim();
  return {
    ...p,
    layout: LAYOUTS.some((l) => l.key === p.layout) ? p.layout : "poster",
    lead: LEADS.some((l) => l.key === p.lead) ? p.lead : "signal",
    canvas: CANVASES.some((c) => c.key === p.canvas) ? p.canvas : "blush",
    headline: words(p.headline).slice(0, 140) || "Say it out loud.",
    emphasis: words(p.emphasis).slice(0, 60),
    poster: words(p.poster).slice(0, 40) || undefined,
    script: words(p.script).split(/\s+/)[0]?.slice(0, 20) || undefined,
    body: words(p.body).slice(0, 280) || undefined,
    label: words(p.label).slice(0, 30) || undefined,
    motifs: [...new Set((p.motifs ?? []).filter((m) => MOTIFS.some((x) => x.key === m)))].slice(0, 2),
    headlineScale: clamp(Number(p.headlineScale) || 1, 0.6, 1.8),
    logoScale: clamp(Number(p.logoScale) || 1, 0.6, 2),
    textDensity: clamp(Number(p.textDensity) || 1, 0.5, 1.5),
    imageUrl: p.imageUrl && /^\/api\/files\/[\w-]+$/.test(p.imageUrl) ? p.imageUrl : undefined,
    headlineFont: isFontKey(p.headlineFont) ? p.headlineFont : undefined,
    posterFont: isFontKey(p.posterFont) ? p.posterFont : undefined,
    bodyFont: isFontKey(p.bodyFont) ? p.bodyFont : undefined,
  };
}

type Rule = { re: RegExp; say: string; apply: (p: DesignParams) => DesignParams };
const withMotif = (p: DesignParams, m: DesignParams["motifs"][number]) => ({ ...p, motifs: (p.motifs.includes(m) ? p.motifs : [m, ...p.motifs]).slice(0, 2) as DesignParams["motifs"] });

const RULES: Rule[] = [
  { re: /(bigger|larger|more prominent) (headline|title|words)|headline (bigger|larger)/i, say: "Made the headline larger", apply: (p) => ({ ...p, headlineScale: clamp(p.headlineScale * 1.18, 0.6, 1.8) }) },
  { re: /(smaller|less prominent) (headline|title)|headline (smaller|too big)/i, say: "Made the headline smaller", apply: (p) => ({ ...p, headlineScale: clamp(p.headlineScale * 0.85, 0.6, 1.8) }) },
  { re: /(bigger|larger) logo|logo (bigger|larger)/i, say: "Made the logo larger", apply: (p) => ({ ...p, logoScale: clamp(p.logoScale * 1.3, 0.6, 2) }) },
  { re: /pink(er)?\b|more pink|hot pink/i, say: "Hot Pink now leads", apply: (p) => ({ ...p, lead: "hot" }) },
  { re: /more red|redder|signal red/i, say: "Signal Red now leads", apply: (p) => ({ ...p, lead: "signal" }) },
  { re: /orange|tangerine|warmer colou?r/i, say: "Tangerine now leads", apply: (p) => ({ ...p, lead: "tangerine" }) },
  { re: /less text|too busy|less clutter|simpler|minimal/i, say: "Took text away for a cleaner look", apply: (p) => ({ ...p, textDensity: clamp(p.textDensity - 0.3, 0.5, 1.5), body: undefined, motifs: p.motifs.slice(0, 1) }) },
  { re: /more contrast|stronger contrast|bolder/i, say: "Lighter canvas for stronger contrast", apply: (p) => ({ ...p, canvas: "shell", lead: p.lead === "tangerine" ? "signal" : p.lead }) },
  { re: /editorial|magazine/i, say: "Switched to the editorial layout", apply: (p) => ({ ...p, layout: "editorial" }) },
  { re: /\bquote\b/i, say: "Switched to the quote layout", apply: (p) => ({ ...p, layout: "quote" }) },
  { re: /\bposter\b/i, say: "Switched to the poster layout", apply: (p) => ({ ...p, layout: "poster" }) },
  { re: /stripe/i, say: "Added the signature stripe", apply: (p) => ({ ...withMotif(p, "stripe"), layout: p.layout === "poster" ? "stripe" : p.layout }) },
  { re: /\barch(es)?\b|photo/i, say: "Switched to the arch layout", apply: (p) => ({ ...p, layout: "arch" }) },
  { re: /heart|love|romantic/i, say: "Added hearts", apply: (p) => withMotif(p, "heart") },
  { re: /flower|floral|70s|retro/i, say: "Added a 70s flower", apply: (p) => withMotif(p, "flower") },
  { re: /\bbadge\b/i, say: "Added the SBF badge", apply: (p) => withMotif(p, "badge") },
  { re: /feminine|softer|soft/i, say: "Softer canvas with hearts", apply: (p) => withMotif({ ...p, canvas: "candy", lead: "hot" }, "heart") },
  { re: /peach/i, say: "Peach canvas", apply: (p) => ({ ...p, canvas: "peach" }) },
  { re: /candy/i, say: "Candy canvas", apply: (p) => ({ ...p, canvas: "candy" }) },
  { re: /blush/i, say: "Blush canvas", apply: (p) => ({ ...p, canvas: "blush" }) },
  { re: /no (motifs|decoration)|plain/i, say: "Removed decoration", apply: (p) => ({ ...p, motifs: [] }) },
];

/** Apply every request it recognises; report what changed (and what it didn't understand). */
export function applyPrompt(p: DesignParams, prompt: string): { params: DesignParams; changes: string[] } {
  let next = { ...p, motifs: [...p.motifs] };
  const changes: string[] = [];
  for (const r of RULES) {
    if (r.re.test(prompt)) {
      next = r.apply(next);
      changes.push(r.say);
    }
  }
  const quoted = prompt.match(/["“](.+?)["”]/);
  if (quoted && /headline|say|title|words/i.test(prompt)) {
    next.headline = quoted[1].trim();
    changes.push("Changed the headline");
  }
  return { params: tidyParams(next), changes };
}

export type DesignIssue = { severity: "block" | "warn"; detail: string };
const EMOJI = /\p{Extended_Pictographic}/u;

/** Live brand checks on a design (words on the image and how it is decorated). */
export function checkDesign(p: DesignParams): DesignIssue[] {
  const out: DesignIssue[] = [];
  const texts: [string, string | undefined][] = [
    ["headline", p.headline],
    ["poster line", p.poster],
    ["script word", p.script],
    ["body", p.body],
    ["label", p.label],
  ];
  for (const [name, t] of texts) {
    if (!t) continue;
    if (t.includes("!")) out.push({ severity: "block", detail: `No exclamation marks (${name}).` });
    if (EMOJI.test(t)) out.push({ severity: "block", detail: `No emoji (${name}). The only glyph is ✦.` });
    if (/\b(empower(s|ed|ing)?|journey|unlock|elevate|game-?changing|girl ?boss|slay|queen)\b/i.test(t)) out.push({ severity: "warn", detail: `A word the brand avoids is in the ${name}.` });
    if (t.length > 6 && t === t.toUpperCase() && /[A-Z]/.test(t)) out.push({ severity: "warn", detail: `Type the ${name} in sentence case; capitals are a design style.` });
  }
  if (p.headline && !/[.?]$/.test(p.headline.trim())) out.push({ severity: "warn", detail: "Headlines end with a full stop." });
  if (p.headline && p.headline.length > 90) out.push({ severity: "warn", detail: "Long headline. Short and declarative reads better." });
  if (p.emphasis && p.headline && !p.headline.includes(p.emphasis)) out.push({ severity: "warn", detail: "The italic words must appear in the headline." });
  if (p.emphasis && p.emphasis.split(/\s+/).length > 3) out.push({ severity: "warn", detail: "Italic emphasis is two or three words at most." });
  if (p.motifs.length > 2) out.push({ severity: "warn", detail: "Two motifs per piece at most." });
  const offBrand = [p.headlineFont, p.posterFont, p.bodyFont].map((k) => FONTS.find((x) => x.key === k)).filter((x) => x && !x.brand);
  if (offBrand.length) out.push({ severity: "warn", detail: `${offBrand.map((x) => x!.label).join(", ")} isn't a brand font. Fine for a one-off; the brief uses Silk Serif, Anton and Nunito Sans.` });
  return out;
}

/* ───────────── Post score ───────────── */

export type PostCopy = { hook: string; caption: string; callToAction: string; hashtags: string[]; altText: string };
const HASHTAG_RANGE: Record<string, [number, number]> = { instagram: [3, 10], tiktok: [3, 6], linkedin: [0, 5], x: [0, 2], threads: [0, 3], bluesky: [0, 3], facebook: [0, 5], pinterest: [2, 8] };
const CAPTION_MAX: Record<string, number> = { instagram: 2200, tiktok: 2200, facebook: 5000, linkedin: 3000, x: 280, threads: 500, bluesky: 300, pinterest: 500 };

/** How ready a post is to send for approval, out of 100, with the next fixes in plain words. */
export function postScore(params: DesignParams, copy: PostCopy, platform: string, issues: { severity: string }[]) {
  const [hMin, hMax] = HASHTAG_RANGE[platform] ?? [0, 10];
  const max = CAPTION_MAX[platform] ?? 2200;
  const captionText = copy.caption.replace(/^\[Write the caption\]\s*/, "");
  const checks = [
    { key: "design", label: "Design on brand", ok: !issues.some((i) => i.severity === "block"), weight: 20, tip: "Fix the must-fix brand notes." },
    { key: "polish", label: "No brand notes", ok: issues.length === 0, weight: 10, tip: "Look at the brand notes in the panel." },
    { key: "headline", label: "Headline ends with a full stop", ok: /[.?]$/.test(params.headline.trim()), weight: 10, tip: "Short, declarative, ending with a full stop." },
    { key: "hook", label: "Hook fits the first line", ok: copy.hook.trim().length > 0 && copy.hook.length <= 125, weight: 10, tip: "Keep the opening line under 125 characters so it shows before “more”." },
    { key: "caption", label: "Caption written", ok: !copy.caption.startsWith("[Write the caption]") && captionText.length >= 50 && captionText.length <= max, weight: 20, tip: `Write 50 to ${max} characters, in your voice.` },
    { key: "cta", label: "Call to action", ok: copy.callToAction.trim().length > 3, weight: 10, tip: "Say exactly what happens next." },
    { key: "hashtags", label: "Hashtags", ok: copy.hashtags.length >= hMin && copy.hashtags.length <= hMax, weight: 10, tip: `Use ${hMin} to ${hMax} for this platform.` },
    { key: "alt", label: "Alt text", ok: copy.altText.trim().length >= 20, weight: 10, tip: "Describe the image for screen readers (20+ characters)." },
  ];
  const score = checks.reduce((a, c) => a + (c.ok ? c.weight : 0), 0);
  return { score, checks };
}
