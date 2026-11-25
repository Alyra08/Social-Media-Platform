"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { reports } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { audit, setSetting } from "@/lib/system";
import { cleanContentTypes, cleanPillars, DEFAULT_CONTENT_TYPES, DEFAULT_PILLARS } from "@/lib/ava-defaults";
import type { TrendBriefing } from "@/lib/ava";

type Result = { ok: boolean; message: string };
const fail = (e: unknown): Result => ({ ok: false, message: e instanceof Error ? e.message : String(e) });

export async function savePillarsAction(rows: unknown): Promise<Result> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    const clean = cleanPillars(rows);
    await setSetting(db, "avaPillars", clean);
    await audit(db, user, "ava.pillars", "settings", null, clean.map((p) => p.label).join(", "));
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved ${clean.length} pillars. Ava uses them from her next draft.` };
  } catch (e) {
    return fail(e);
  }
}

export async function saveContentTypesAction(rows: unknown): Promise<Result> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    const clean = cleanContentTypes(rows);
    await setSetting(db, "avaContentTypes", clean);
    await audit(db, user, "ava.content_types", "settings", null, clean.map((t) => t.label).join(", "));
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved ${clean.length} content types.` };
  } catch (e) {
    return fail(e);
  }
}

export async function resetAvaListAction(which: "pillars" | "types"): Promise<Result> {
  try {
    const user = await requireUser("owner");
    const db = await getDb();
    if (which === "pillars") await setSetting(db, "avaPillars", DEFAULT_PILLARS);
    else await setSetting(db, "avaContentTypes", DEFAULT_CONTENT_TYPES);
    await audit(db, user, `ava.reset_${which}`, "settings");
    revalidatePath("/", "layout");
    return { ok: true, message: "Back to the starting list." };
  } catch (e) {
    return fail(e);
  }
}

export async function saveInstructionsAction(text: string): Promise<Result> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    await setSetting(db, "avaInstructions", String(text ?? "").slice(0, 4000));
    await audit(db, user, "ava.instructions", "settings");
    revalidatePath("/ava");
    return { ok: true, message: "Saved. Ava follows these from her next draft." };
  } catch (e) {
    return fail(e);
  }
}

const lines = (s: unknown) =>
  String(s ?? "")
    .split(/\n+/)
    .map((x) => x.replace(/^[-•✦*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((x) => x.slice(0, 300));

/** Save an edited trend briefing; it becomes the one Ava uses until her next weekly research. */
export async function saveBriefingAction(input: Record<string, string>): Promise<Result> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    const sources = lines(input.sources)
      .map((l) => {
        const [title, url] = l.includes("|") ? l.split("|").map((x) => x.trim()) : [l, l];
        return /^https?:\/\//.test(url) ? { title: title || url, url } : null;
      })
      .filter(Boolean) as TrendBriefing["sources"];
    const briefing: TrendBriefing = {
      summary: String(input.summary ?? "").trim().slice(0, 600),
      platformChanges: lines(input.platformChanges),
      formatsWorking: lines(input.formatsWorking),
      conversations: lines(input.conversations),
      taglineAngles: lines(input.taglineAngles),
      doThis: lines(input.doThis),
      avoid: lines(input.avoid),
      sources,
    };
    if (!briefing.summary) throw new Error("Add a short summary first.");
    const today = new Date().toISOString().slice(0, 10);
    await db.insert(reports).values({ kind: "trends", periodStart: today, periodEnd: today, title: `Trend briefing edited by ${user.name ?? user.email}`, data: briefing as unknown as Record<string, unknown> });
    await audit(db, user, "ava.briefing_edit", "report");
    revalidatePath("/ava");
    return { ok: true, message: "Saved. Ava uses this briefing until her next weekly research." };
  } catch (e) {
    return fail(e);
  }
}
