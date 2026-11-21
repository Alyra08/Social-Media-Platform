import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assets, designs, type DesignParams } from "@/db/schema";
import { activePreferences, extractSignals } from "../learning";
import { aiEnabled, structured } from "../ai/client";
import { SBF_BRAND_BRIEF } from "../brand/brief";
import { DESIGN_FORMATS, formatsForPost, renderDesignSvg } from "./render";

type PostLike = { id: string; platform: string; format: string; treatment: string; hook: string; caption: string; designConcept: string | null; taglines: string[] };

/** Creative treatment per content type — recognisably SBF, never identical. */
const TREATMENTS: Record<string, Partial<DesignParams>[]> = {
  serious: [
    { layout: "editorial", lead: "signal", canvas: "blush", motifs: ["stripe"] },
    { layout: "stripe", lead: "signal", canvas: "shell", motifs: ["heart"] },
    { layout: "arch", lead: "hot", canvas: "roseMist", motifs: ["stripe"] },
  ],
  humorous: [
    { layout: "poster", lead: "hot", canvas: "candy", motifs: ["flower"] },
    { layout: "editorial", lead: "hot", canvas: "blush", motifs: ["badge", "flower"] },
    { layout: "poster", lead: "tangerine", canvas: "peachCream", motifs: ["heart"] },
  ],
  inspirational: [
    { layout: "arch", lead: "signal", canvas: "blush", motifs: ["flower"] },
    { layout: "quote", lead: "hot", canvas: "peach", motifs: ["heart"] },
    { layout: "editorial", lead: "tangerine", canvas: "peachCream", motifs: ["flower", "stripe"] },
  ],
  lifestyle: [
    { layout: "quote", lead: "signal", canvas: "candy", motifs: ["badge"] },
    { layout: "arch", lead: "hot", canvas: "blush", motifs: ["flower"] },
    { layout: "stripe", lead: "hot", canvas: "shell", motifs: ["heart"] },
  ],
};

function pickEmphasis(headline: string): string {
  const words = headline.replace(/[.?]$/, "").split(/\s+/);
  if (words.length <= 3) return words.slice(-1).join(" ");
  return words.slice(-2).join(" ");
}

/** Visual preference keys → parameter changes. Shared by learning and one-off feedback. */
export function applyVisualSignals(p: DesignParams, keys: string[]): DesignParams {
  const n = { ...p, motifs: [...p.motifs] };
  for (const k of keys) {
    switch (k) {
      case "headline_larger": n.headlineScale = Math.min(1.6, n.headlineScale * 1.18); break;
      case "headline_smaller": n.headlineScale = Math.max(0.7, n.headlineScale * 0.85); break;
      case "logo_larger": n.logoScale = Math.min(2, n.logoScale * 1.3); break;
      case "more_pink": n.lead = "hot"; break;
      case "more_red": n.lead = "signal"; break;
      case "less_text": n.textDensity = Math.max(0.5, n.textDensity - 0.3); n.body = undefined; n.motifs = n.motifs.slice(0, 1); break;
      case "stronger_contrast": n.canvas = "shell"; if (n.lead === "tangerine") n.lead = "signal"; break;
      case "less_corporate": if (!n.motifs.includes("flower")) n.motifs = (["flower", ...n.motifs] as DesignParams["motifs"]).slice(0, 2); n.script = n.script ?? "honestly."; break;
      case "more_editorial": n.layout = "editorial"; n.motifs = n.motifs.filter((m) => m !== "badge"); break;
      case "natural_imagery": if (n.layout !== "arch") n.layout = "arch"; break;
    }
  }
  return n;
}

export async function baseParams(db: Db, post: PostLike, variant: number): Promise<DesignParams> {
  const options = TREATMENTS[post.treatment] ?? TREATMENTS.serious;
  const t = options[(variant - 1) % options.length];
  const headline = post.hook.length <= 80 ? post.hook : post.hook.slice(0, 77).replace(/\s+\S*$/, "") + ".";
  let p: DesignParams = {
    layout: t.layout!,
    lead: t.lead!,
    canvas: t.canvas!,
    headline,
    emphasis: pickEmphasis(headline),
    poster: post.treatment === "humorous" || variant === 2 ? post.taglines[0]?.replace(/[.?]$/, "").split(" ").slice(0, 4).join(" ") : undefined,
    script: post.treatment === "inspirational" ? "together." : undefined,
    body: post.platform === "pinterest" || post.format === "carousel" ? post.caption.split(/(?<=[.?])\s/)[0] : undefined,
    label: post.format === "carousel" ? "Swipe" : post.platform === "community" ? "Say it out loud" : undefined,
    motifs: t.motifs!,
    headlineScale: 1,
    logoScale: 1,
    textDensity: 1,
  };
  // Apply learned (repeated) and owner-confirmed visual preferences.
  const learned = await activePreferences(db, ["visual"]);
  p = applyVisualSignals(p, learned.map((l) => l.key));
  return p;
}

async function logoHref(db: Db): Promise<string | undefined> {
  const logo = await db.query.assets.findFirst({ where: eq(assets.kind, "logo"), orderBy: desc(assets.createdAt) });
  return logo ? `/api/files/${logo.id}` : undefined;
}

/** Generate 2–3 variations per required format for an approved post. */
export async function generateDesignsForPost(db: Db, post: PostLike): Promise<number> {
  const formats = formatsForPost(post.platform, post.format).slice(0, 2);
  const href = await logoHref(db);
  let n = 0;
  for (const format of formats) {
    const f = DESIGN_FORMATS[format];
    const variants = formats.length > 1 ? 2 : 3;
    for (let v = 1; v <= variants; v++) {
      const params = await baseParams(db, post, v);
      await db.insert(designs).values({
        postId: post.id,
        variant: v,
        format,
        width: f.w,
        height: f.h,
        params,
        svg: renderDesignSvg({ format, params, logoHref: href }),
        source: "ai",
        status: "proposed",
      });
      n++;
    }
  }
  return n;
}

const AiDesignDelta = z.object({
  headline: z.string().nullable(),
  emphasis: z.string().nullable(),
  layout: z.enum(["poster", "editorial", "quote", "stripe", "arch"]).nullable(),
  lead: z.enum(["signal", "hot", "tangerine"]).nullable(),
  canvas: z.enum(["blush", "shell", "roseMist", "candy", "peach", "peachCream"]).nullable(),
  headlineScale: z.number().nullable(),
  logoScale: z.number().nullable(),
  textDensity: z.number().nullable(),
  explanation: z.string(),
});

/** Interpret owner feedback into a revised design (rules first, AI for anything else). */
export async function reviseDesign(db: Db, designId: string, feedback: string): Promise<{ id: string; explanation: string }> {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d || !d.params) throw new Error("Only AI-generated designs can be regenerated from feedback.");
  const keys = extractSignals(feedback, ["visual"]).map((s) => s.key);
  let params = applyVisualSignals(d.params, keys);
  let explanation = keys.length ? `Applied: ${keys.join(", ").replace(/_/g, " ")}.` : "";
  if (aiEnabled()) {
    try {
      const delta = await structured({
        schema: AiDesignDelta,
        system: SBF_BRAND_BRIEF,
        task: "You are the SBF creative director. Translate the owner's design feedback into parameter changes for the design engine. Only change what the feedback asks for; return null for anything unchanged. Keep every change within the brand rules (scales between 0.6 and 1.8; density 0.5–1.5).",
        input: `Current parameters:\n${JSON.stringify(params)}\n\nFeedback: ${feedback}`,
        effort: "low",
        maxTokens: 4000,
      });
      params = {
        ...params,
        ...Object.fromEntries(Object.entries(delta).filter(([k, v]) => v !== null && k !== "explanation")),
      } as DesignParams;
      explanation = delta.explanation || explanation;
    } catch {
      /* rules-only fallback */
    }
  }
  if (!explanation) explanation = "No specific change recognised. Try phrases like 'make the headline larger' or 'use more pink'.";
  const href = await logoHref(db);
  await db.update(designs).set({ status: "superseded", feedback }).where(eq(designs.id, d.id));
  const [nd] = await db
    .insert(designs)
    .values({
      postId: d.postId,
      variant: d.variant,
      format: d.format,
      width: d.width,
      height: d.height,
      params,
      svg: renderDesignSvg({ format: d.format, params, logoHref: href }),
      source: "ai",
      status: "proposed",
      parentId: d.id,
    })
    .returning();
  return { id: nd.id, explanation };
}

export async function regenerateDesign(db: Db, designId: string) {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d?.params || !d.postId) throw new Error("Design not found");
  const layouts: DesignParams["layout"][] = ["editorial", "poster", "arch", "quote", "stripe"];
  const leads: DesignParams["lead"][] = ["signal", "hot", "tangerine"];
  const params: DesignParams = {
    ...d.params,
    layout: layouts[(layouts.indexOf(d.params.layout) + 1) % layouts.length],
    lead: leads[(leads.indexOf(d.params.lead) + 1) % leads.length],
  };
  await db.update(designs).set({ status: "superseded" }).where(eq(designs.id, d.id));
  await db.insert(designs).values({
    postId: d.postId,
    variant: d.variant,
    format: d.format,
    width: d.width,
    height: d.height,
    params,
    svg: renderDesignSvg({ format: d.format, params, logoHref: await logoHref(db) }),
    source: "ai",
    status: "proposed",
    parentId: d.id,
  });
}

export async function liveDesignsForPost(db: Db, postId: string) {
  return db.select().from(designs).where(and(eq(designs.postId, postId))).orderBy(designs.format, designs.variant, desc(designs.createdAt));
}
