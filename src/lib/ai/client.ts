import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * AI integration layer. All model calls go through here.
 * - No ANTHROPIC_API_KEY → `aiEnabled()` is false and callers use clearly-labelled demo generators.
 * - Refusal fallbacks are enabled server-side (`fallbacks: "default"`) so a declined request
 *   is retried on a suitable model inside the same call.
 */
export const DEFAULT_MODEL = "claude-opus-5-5";
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
let clientKey: string | undefined;
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}
export function getClient(): Anthropic {
  // Rebuilt when the key changes (keys can be added or replaced in Settings without a restart).
  const key = process.env.ANTHROPIC_API_KEY;
  if (!client || clientKey !== key) {
    client = new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
    clientKey = key;
  }
  return client;
}
export const model = () => process.env.SBF_AI_MODEL || DEFAULT_MODEL;

export class AiRefusalError extends Error {}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** One structured call: returns data validated against the zod schema. */
export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string; // stable prefix (brand brief etc.) — cached
  task: string; // task-specific instructions
  input: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const res = await getClient().beta.messages.parse({
    model: model(),
    max_tokens: opts.maxTokens ?? 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: [
      { type: "text", text: opts.system, cache_control: { type: "ephemeral" } },
      { type: "text", text: opts.task },
    ],
    output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.input }],
  });
  if (res.stop_reason === "refusal") throw new AiRefusalError("The model declined this request.");
  if (res.parsed_output == null) throw new Error(`AI response could not be parsed (stop_reason: ${res.stop_reason}).`);
  return res.parsed_output as z.infer<S>;
}

export type SearchHit = { url: string; title: string; pageAge?: string | null };

/**
 * Web research with Anthropic's server-side web search. Returns the model's notes plus
 * every URL the search tool actually returned, which is used to verify cited sources.
 */
export async function webResearch(opts: { system: string; prompt: string; maxSearches?: number; effort?: Effort }): Promise<{
  notes: string;
  hits: SearchHit[];
}> {
  const c = getClient();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  const hits = new Map<string, SearchHit>();
  let notes = "";
  for (let turn = 0; turn < 6; turn++) {
    const stream = c.beta.messages.stream({
      model: model(),
      max_tokens: 64000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      output_config: { effort: opts.effort ?? "high" },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: opts.maxSearches ?? 20,
          user_location: { type: "approximate", city: "Brisbane", region: "Queensland", country: "AU", timezone: "Australia/Brisbane" },
        },
      ],
      messages,
    });
    const msg = await stream.finalMessage();
    for (const block of msg.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === "web_search_result") hits.set(r.url, { url: r.url, title: r.title, pageAge: r.page_age ?? null });
        }
      } else if (block.type === "text") {
        notes += block.text;
      }
    }
    if (msg.stop_reason === "refusal") throw new AiRefusalError("The model declined the research request.");
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    break;
  }
  return { notes, hits: [...hits.values()] };
}

/** Normalise a URL for comparison (drop hash, trailing slash, utm params). */
export function normaliseUrl(u: string): string {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) if (k.startsWith("utm_")) url.searchParams.delete(k);
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}
