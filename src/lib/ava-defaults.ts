/** Ava's starting content pillars and content types. The owner can edit all of these on Ava's page. */

export type Pillar = { key: string; label: string; about: string; target: number /* share of posts, 0–1 */ };
export type ContentType = { key: string; label: string; best: string };

export const DEFAULT_PILLARS: Pillar[] = [
  { key: "now-is-our-time", label: "Now is our time", about: "Ambition, money, career, asking for what you're owed, starting the thing.", target: 0.2 },
  { key: "got-your-back", label: "Women who've got your back", about: "Friendship, sisterhood, circles, community, member voices (with consent).", target: 0.2 },
  { key: "say-it-out-loud", label: "Say it out loud", about: "Honest conversations: menopause, motherhood, bodies, relationships, the mental load.", target: 0.2 },
  { key: "practical-courage", label: "Practical courage", about: "Scripts, tools, checklists and how-tos people save and use.", target: 0.15 },
  { key: "founder-confessions", label: "Founder confessions", about: "The founder goes first: behind the scenes, lessons, what it cost.", target: 0.1 },
  { key: "dry-wit", label: "Dry wit", about: "Relatable humour and sass with a wink. Punch at situations, never people.", target: 0.1 },
  { key: "good-news", label: "Good news", about: "Wins, positive stories, celebrations and community spotlights.", target: 0.05 },
];

export const DEFAULT_CONTENT_TYPES: ContentType[] = [
  { key: "carousel-howto", label: "How-to carousel", best: "Saves" },
  { key: "script", label: "Word-for-word script", best: "Saves and shares" },
  { key: "myth-vs-fact", label: "Myth vs fact", best: "Shares" },
  { key: "quote-poster", label: "Quote poster", best: "Shares and sends" },
  { key: "founder-story", label: "Founder story", best: "Comments and follows" },
  { key: "question", label: "Conversation starter", best: "Comments" },
  { key: "poll", label: "Poll or this-or-that", best: "Comments and story replies" },
  { key: "checklist", label: "Checklist", best: "Saves" },
  { key: "relatable", label: "Relatable humour", best: "Shares and sends" },
  { key: "behind-the-scenes", label: "Behind the scenes", best: "Profile visits" },
  { key: "short-video", label: "Short video (Reel/TikTok)", best: "Watch time and reach" },
  { key: "event-invite", label: "Event or circle invite", best: "Link clicks" },
  { key: "spotlight", label: "Community spotlight", best: "Shares and goodwill" },
  { key: "newsletter-teaser", label: "Sunday note teaser", best: "Sign-ups" },
];

export const slugKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .slice(0, 40) || "item";

const clip = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
function uniqueKey(base: string, used: Set<string>) {
  let k = slugKey(base);
  for (let i = 2; used.has(k); i++) k = `${slugKey(base)}-${i}`;
  used.add(k);
  return k;
}

/** Validate edited pillars: names required, sensible lengths, targets 0–100%, stable keys for existing rows. */
export function cleanPillars(rows: unknown): Pillar[] {
  if (!Array.isArray(rows)) throw new Error("Nothing to save.");
  const used = new Set<string>();
  const out: Pillar[] = [];
  for (const r of rows.slice(0, 15) as Record<string, unknown>[]) {
    const label = clip(r.label, 50);
    if (!label) continue;
    const pct = Math.min(100, Math.max(0, Number(r.targetPct ?? Number(r.target ?? 0) * 100) || 0));
    const existing = typeof r.key === "string" && r.key ? slugKey(r.key) : "";
    const key = existing && !used.has(existing) ? (used.add(existing), existing) : uniqueKey(label, used);
    out.push({ key, label, about: clip(r.about, 220), target: Math.round(pct) / 100 });
  }
  if (!out.length) throw new Error("Keep at least one pillar.");
  return out;
}

export function cleanContentTypes(rows: unknown): ContentType[] {
  if (!Array.isArray(rows)) throw new Error("Nothing to save.");
  const used = new Set<string>();
  const out: ContentType[] = [];
  for (const r of rows.slice(0, 30) as Record<string, unknown>[]) {
    const label = clip(r.label, 50);
    if (!label) continue;
    const existing = typeof r.key === "string" && r.key ? slugKey(r.key) : "";
    const key = existing && !used.has(existing) ? (used.add(existing), existing) : uniqueKey(label, used);
    out.push({ key, label, best: clip(r.best, 80) });
  }
  if (!out.length) throw new Error("Keep at least one content type.");
  return out;
}
