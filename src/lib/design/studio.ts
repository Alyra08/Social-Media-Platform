import { z } from "zod";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assets, designs, posts, type DesignParams } from "@/db/schema";
import { aiEnabled, structured } from "../ai/client";
import { SBF_BRAND_BRIEF, CATEGORY_LABELS } from "../brand/brief";
import { checkBrandCopy } from "../brand/check";
import { editPost, WorkflowError } from "../workflow";
import { audit, notify, type Actor } from "../system";
import { DESIGN_FORMATS, renderDesignSvg } from "./render";
import { applyPrompt, checkDesign, FORMAT_TO_POST, tidyParams } from "./editor-rules";
import { avaGuidance, contentTypeEnum, pillarEnum, pillarForCategory } from "../ava";

/**
 * AI design studio + visual editor (server side).
 * Everything made here starts as a draft post and a draft design. Nothing is published:
 * "Send for approval" puts the copy into Content approval, and the design follows into
 * Design approval once the copy is approved (the normal safeguards apply).
 */

export async function logoHref(db: Db) {
  const logo = await db.query.assets.findFirst({ where: eq(assets.kind, "logo"), orderBy: desc(assets.createdAt) });
  return logo ? `/api/files/${logo.id}` : undefined;
}

const Draft = z.object({
  category: z.enum(Object.keys(CATEGORY_LABELS) as [string, ...string[]]),
  treatment: z.enum(["serious", "humorous", "inspirational", "lifestyle"]),
  hook: z.string().describe("Opening line of the caption: short, specific, in the brand voice"),
  caption: z.string(),
  callToAction: z.string().describe('Says exactly what happens, e.g. "Get the Sunday note"'),
  hashtags: z.array(z.string()).max(8),
  altText: z.string(),
  headline: z.string().describe("Words on the image: short, declarative, ends with a full stop"),
  emphasis: z.string().describe("Two or three words from the headline to set in italic"),
  poster: z.string().nullable().describe("Optional single Anton statement, five words or fewer"),
  script: z.string().nullable().describe("Optional single handwritten word, e.g. together."),
  layout: z.enum(["poster", "editorial", "quote", "stripe", "arch"]),
  lead: z.enum(["signal", "hot", "tangerine"]),
  canvas: z.enum(["white", "blush", "shell", "roseMist", "candy", "peach", "peachCream"]),
  motifs: z.array(z.enum(["arch", "flower", "heart", "badge", "stripe"])).max(2),
  pillar: pillarEnum,
  contentType: contentTypeEnum,
});

/**
 * Demo mode: pull the actual message out of a description, e.g.
 * "A soft quote post: choose yourself every single time, with hearts" → "choose yourself every single time".
 */
export function messageFrom(prompt: string) {
  let m = prompt.includes(":")
    ? prompt.split(":").slice(1).join(":")
    : /\b(post|poster|carousel|story|reel|quote|graphic|design|slide)\s+(about|on|for|saying|that says)\s+/i.test(prompt)
      ? prompt.replace(/^[\w\s,'-]*?\b(post|poster|carousel|story|reel|quote|graphic|design|slide)\s+(about|on|for|saying|that says)\s+/i, "")
      : prompt.replace(/^(an?|the)\s+[\w\s,'-]*?\b(post|poster|carousel|story|reel|quote|graphic|design|slide)\b\s*/i, "");
  m = m.replace(/,?\s*(with|in|using|and)\s+(some\s+)?(hearts?|flowers?|stripes?|arch(es)?|red|pink|peach|candy|soft|warm|bold|retro|70s)\b[^.]*$/i, "");
  m = m.replace(/,\s*(warm|soft|bold|feminine|playful)\b[^,.]*$/i, "");
  return m.trim() || prompt;
}

function sentence(s: string) {
  const t = s.replace(/\s+/g, " ").trim().replace(/[!]+/g, ".");
  const first = t.split(/(?<=[.?])\s/)[0] ?? t;
  const cut = first.length > 80 ? first.slice(0, 77).replace(/\s+\S*$/, "") : first;
  const cased = cut.charAt(0).toUpperCase() + cut.slice(1);
  return /[.?]$/.test(cased) ? cased : `${cased}.`;
}

/** Turn a description into a draft post + draft design, then return the design id for the editor. */
export async function studioCreate(db: Db, actor: Actor, input: { prompt: string; format: string }) {
  const format = DESIGN_FORMATS[input.format] ? input.format : "ig_portrait";
  const target = FORMAT_TO_POST[format] ?? { platform: "instagram", format: "post" };
  const prompt = input.prompt.trim().slice(0, 1200);
  if (!prompt) throw new WorkflowError("Describe the post you want first.");

  let draft: z.infer<typeof Draft>;
  let isDemo = false;
  if (aiEnabled()) {
    draft = await structured({
      schema: Draft,
      system: SBF_BRAND_BRIEF,
      task: `${await avaGuidance(db)}

As Ava, draft one ${target.platform} ${target.format} for Simply Being Female from the owner's description. Write the caption in the brand voice. Never invent statistics, names, prices or dates; use a clearly marked placeholder like [real date] instead. Then choose the design: layout, lead colour, canvas and at most two motifs.`,
      input: prompt,
      effort: "medium",
      maxTokens: 4000,
    });
  } else {
    // No AI key yet: build an honest starting point from the description itself.
    isDemo = true;
    const head = sentence(messageFrom(prompt));
    const words = head.replace(/[.?]$/, "").split(" ");
    const base: DesignParams = { layout: "poster", lead: "signal", canvas: "blush", headline: head, emphasis: words.slice(-2).join(" "), motifs: ["arch"], headlineScale: 1, logoScale: 1, textDensity: 1 };
    const styled = applyPrompt(base, prompt).params;
    draft = {
      category: /mother|mum|parent/i.test(prompt) ? "motherhood" : /date|partner|relationship|friend/i.test(prompt) ? "relationships" : /laugh|funny|humou?r/i.test(prompt) ? "humour" : /pay|equal|work|career/i.test(prompt) ? "social-issues" : "confidence",
      treatment: "inspirational",
      hook: head,
      caption: `[Write the caption] ${prompt}`,
      callToAction: "Get the Sunday note",
      hashtags: ["SimplyBeingFemale"],
      altText: `Graphic with the words: ${head}`,
      headline: styled.headline,
      emphasis: styled.emphasis,
      poster: null,
      script: null,
      layout: styled.layout,
      lead: styled.lead,
      canvas: styled.canvas,
      motifs: styled.motifs,
      pillar: "say-it-out-loud",
      contentType: "quote-poster",
    };
  }

  const params = tidyParams({
    layout: draft.layout,
    lead: draft.lead,
    canvas: draft.canvas,
    headline: draft.headline,
    emphasis: draft.emphasis,
    poster: draft.poster ?? undefined,
    script: draft.script ?? undefined,
    motifs: draft.motifs,
    headlineScale: 1,
    logoScale: 1,
    textDensity: 1,
  });
  const issues = checkBrandCopy({ hook: draft.hook, caption: draft.caption, callToAction: draft.callToAction, hashtags: draft.hashtags });
  const [post] = await db
    .insert(posts)
    .values({
      platform: target.platform,
      format: target.format,
      category: draft.category,
      treatment: draft.treatment,
      hook: draft.hook,
      caption: draft.caption,
      callToAction: draft.callToAction,
      hashtags: draft.hashtags.map((h) => h.replace(/^#/, "")),
      altText: draft.altText,
      designConcept: `Made in the design studio from: ${prompt}`,
      pillar: isDemo ? pillarForCategory(draft.category) : draft.pillar,
      contentType: draft.contentType,
      author: isDemo ? null : "ava",
      brandIssues: issues,
      isDemo,
      status: "saved",
    })
    .returning();
  const f = DESIGN_FORMATS[format];
  const [d] = await db
    .insert(designs)
    .values({ postId: post.id, variant: 1, format, width: f.w, height: f.h, params, svg: renderDesignSvg({ format, params, logoHref: await logoHref(db) }), source: "studio", status: "draft" })
    .returning();
  await audit(db, actor, "studio.create", "design", d.id, prompt.slice(0, 200));
  return d.id;
}

const Save = z.object({
  format: z.string(),
  params: z.custom<DesignParams>((v) => !!v && typeof v === "object"),
  copy: z.object({
    hook: z.string().max(500),
    caption: z.string().max(5000),
    callToAction: z.string().max(200),
    hashtags: z.array(z.string().max(60)).max(30),
    altText: z.string().max(1000),
  }),
});
export type EditorSave = z.infer<typeof Save>;

/**
 * Save the editor. Editing a design that was already proposed or approved makes a new draft
 * version (the approved one is never changed underneath you); returns the id now being edited.
 */
export async function saveFromEditor(db: Db, actor: Actor, designId: string, raw: unknown): Promise<{ id: string; copyReset: boolean }> {
  const input = Save.parse(raw);
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.postId) throw new WorkflowError("Design not found.");
  const format = DESIGN_FORMATS[input.format] ? input.format : d.format;
  const f = DESIGN_FORMATS[format];
  const params = tidyParams(input.params);
  const svg = renderDesignSvg({ format, params, logoHref: await logoHref(db) });

  let id = d.id;
  if (d.status === "draft") {
    await db.update(designs).set({ format, width: f.w, height: f.h, params, svg }).where(eq(designs.id, d.id));
  } else {
    const [n] = await db
      .insert(designs)
      .values({ postId: d.postId, variant: d.variant, format, width: f.w, height: f.h, params, svg, source: "studio", status: "draft", parentId: d.id })
      .returning();
    id = n.id;
  }

  const p = await db.query.posts.findFirst({ where: eq(posts.id, d.postId) });
  let copyReset = false;
  if (p && p.status !== "published") {
    const c = input.copy;
    const changed = c.hook !== p.hook || c.caption !== p.caption || c.callToAction !== p.callToAction || c.altText !== (p.altText ?? "") || c.hashtags.join(" ") !== p.hashtags.join(" ");
    if (changed) copyReset = (await editPost(db, actor, p.id, { ...c, hashtags: c.hashtags.map((h) => h.replace(/^#/, "")) }, "Edited in the design studio")).reset;
  }
  await audit(db, actor, "studio.save", "design", id);
  return { id, copyReset };
}

/** Send for approval: copy goes to Content approval; the design follows once the copy is approved. */
export async function sendDesignForApproval(db: Db, actor: Actor, designId: string) {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.postId || !d.params) throw new WorkflowError("Design not found.");
  const blocking = checkDesign(d.params).filter((i) => i.severity === "block");
  if (blocking.length) throw new WorkflowError(`Fix first: ${blocking.map((b) => b.detail).join(" ")}`);
  const p = await db.query.posts.findFirst({ where: eq(posts.id, d.postId) });
  if (!p) throw new WorkflowError("Post not found.");
  if (p.isDemo && /^\[Write the caption\]/.test(p.caption)) throw new WorkflowError("Write the caption first (Caption tab).");

  // Older unapproved options for this post step aside; an approved design stays on record.
  await db.update(designs).set({ status: "superseded" }).where(and(eq(designs.postId, p.id), ne(designs.id, d.id), inArray(designs.status, ["proposed", "changes_requested", "draft"])));
  if (["approved_for_publishing", "scheduled", "failed"].includes(p.status)) {
    // A new design for an approved post needs approving again before anything publishes.
    await db.update(posts).set({ status: "awaiting_design", approvedDesignId: null, designApprovedAt: null, designApprovedBy: null, updatedAt: new Date() }).where(eq(posts.id, p.id));
    await db.update(designs).set({ status: "proposed" }).where(eq(designs.id, d.id));
    await notify(db, "design_awaiting", "A new studio design needs approval before publishing", p.hook, `/design?post=${p.id}`);
    await audit(db, actor, "studio.redesign_reset_approval", "design", d.id, `post ${p.id}`);
    return "Sent to Design approval. The post won't publish until the new design is approved.";
  }
  if (p.status === "awaiting_design") {
    // Copy already approved: the design goes straight to Design approval.
    await db.update(designs).set({ status: "proposed" }).where(eq(designs.id, d.id));
    await notify(db, "design_awaiting", "A studio design is ready for approval", p.hook, `/design?post=${p.id}`);
    return "Sent to Design approval.";
  }
  await db.update(designs).set({ status: "draft" }).where(eq(designs.id, d.id));
  if (["saved", "revision_requested", "denied"].includes(p.status)) await db.update(posts).set({ status: "awaiting_content", updatedAt: new Date() }).where(eq(posts.id, p.id));
  await notify(db, "content_awaiting", "A studio post is ready for approval", p.hook, `/content`);
  await audit(db, actor, "studio.send_for_approval", "design", d.id);
  return "Sent to Content approval. The design follows once the copy is approved.";
}

const Delta = z.object({
  headline: z.string().nullable(),
  emphasis: z.string().nullable(),
  poster: z.string().nullable(),
  script: z.string().nullable(),
  layout: z.enum(["poster", "editorial", "quote", "stripe", "arch"]).nullable(),
  lead: z.enum(["signal", "hot", "tangerine"]).nullable(),
  canvas: z.enum(["white", "blush", "shell", "roseMist", "candy", "peach", "peachCream"]).nullable(),
  motifs: z.array(z.enum(["arch", "flower", "heart", "badge", "stripe"])).max(2).nullable(),
  headlineScale: z.number().nullable(),
  explanation: z.string(),
});

/** "Ask for a change" in the editor: AI when the key is set, otherwise the plain-English rules. */
export async function refineWithPrompt(params: DesignParams, prompt: string): Promise<{ params: DesignParams; changes: string[] }> {
  const rules = applyPrompt(params, prompt);
  if (!aiEnabled()) return rules.changes.length ? rules : { params, changes: [] };
  const d = await structured({
    schema: Delta,
    system: SBF_BRAND_BRIEF,
    task: "Change this social media design as the owner asks. Return only the fields that should change (null for unchanged). Stay inside the brand brief: one bright leads, at most two motifs, headline ends with a full stop, one script word at most.",
    input: `Current design: ${JSON.stringify(params)}\n\nOwner's request: ${prompt}`,
    effort: "low",
    maxTokens: 2000,
  });
  const next = tidyParams({
    ...params,
    ...(d.headline ? { headline: d.headline } : {}),
    ...(d.emphasis ? { emphasis: d.emphasis } : {}),
    ...(d.poster !== null ? { poster: d.poster || undefined } : {}),
    ...(d.script !== null ? { script: d.script || undefined } : {}),
    ...(d.layout ? { layout: d.layout } : {}),
    ...(d.lead ? { lead: d.lead } : {}),
    ...(d.canvas ? { canvas: d.canvas } : {}),
    ...(d.motifs ? { motifs: d.motifs } : {}),
    ...(d.headlineScale ? { headlineScale: d.headlineScale } : {}),
  });
  return { params: next, changes: [d.explanation] };
}
