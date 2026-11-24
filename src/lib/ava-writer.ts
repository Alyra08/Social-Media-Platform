import { z } from "zod";
import type { Db } from "@/db/client";
import { aiEnabled, structured } from "./ai/client";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { avaGuidance } from "./ava";

const Copy = z.object({
  hook: z.string().describe("Opening line, under 125 characters"),
  caption: z.string(),
  callToAction: z.string(),
  hashtags: z.array(z.string()).max(12),
  altText: z.string(),
});

/** Ava writes (or rewrites) one caption for a post made in the design studio. */
export async function writeCaptionAsAva(db: Db, input: { platform: string; format: string; headline: string; caption: string; idea: string }) {
  if (!aiEnabled()) throw new Error("Ava needs the Anthropic key to write. Add it in Settings → Keys and connections.");
  const c = await structured({
    schema: Copy,
    system: SBF_BRAND_BRIEF,
    task: `${await avaGuidance(db)}\n\nAs Ava, write the caption for this ${input.platform} ${input.format}. The image says the headline below. Never invent statistics, names, prices or dates; use a marked placeholder like [real date].`,
    input: `Headline on the image: ${input.headline}\nIdea: ${input.idea}\nCurrent caption (improve or replace): ${input.caption}`,
    effort: "medium",
    maxTokens: 3000,
  });
  return { ...c, hashtags: c.hashtags.map((h) => h.replace(/^#/, "")) };
}
