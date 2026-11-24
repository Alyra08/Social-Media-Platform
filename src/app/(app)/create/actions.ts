"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { DesignParams } from "@/db/schema";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { act } from "@/lib/flash";
import { checkBrandCopy } from "@/lib/brand/check";
import { refineWithPrompt, saveFromEditor, sendDesignForApproval, studioCreate, type EditorSave } from "@/lib/design/studio";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** AI studio: description + size → draft post and design → open in the editor. */
export async function studioCreateAction(f: FormData) {
  let id = "";
  await act(
    "editor",
    async ({ db, user }) => {
      id = await studioCreate(db, user, { prompt: String(f.get("prompt") ?? ""), format: String(f.get("format") ?? "ig_portrait") });
    },
    ["/create"],
  );
  if (id) redirect(`/create/${id}`);
}

export async function saveEditorAction(designId: string, payload: EditorSave): Promise<{ ok: boolean; id?: string; message: string }> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    const r = await saveFromEditor(db, user, designId, payload);
    revalidatePath("/design");
    revalidatePath("/content");
    return { ok: true, id: r.id, message: r.copyReset ? "Saved. The copy changed after approval, so it needs approving again." : r.id !== designId ? "Saved as a new version. The approved design is unchanged." : "Saved." };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function sendForApprovalAction(designId: string, payload: EditorSave): Promise<{ ok: boolean; id?: string; message: string }> {
  try {
    const user = await requireUser("editor");
    const db = await getDb();
    const r = await saveFromEditor(db, user, designId, payload);
    const message = await sendDesignForApproval(db, user, r.id);
    revalidatePath("/", "layout");
    return { ok: true, id: r.id, message };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}

export async function refineAction(params: DesignParams, prompt: string): Promise<{ ok: boolean; params?: DesignParams; changes: string[]; message?: string }> {
  try {
    await requireUser("editor");
    const r = await refineWithPrompt(params, prompt.slice(0, 600));
    return { ok: true, params: r.params, changes: r.changes };
  } catch (e) {
    return { ok: false, changes: [], message: msg(e) };
  }
}

export type ReviewState = { text: string; issues: { severity: string; detail: string }[] } | null;

/** Review mode: brand-check any copy before it goes anywhere. */
export async function reviewCopyAction(_prev: ReviewState, f: FormData): Promise<ReviewState> {
  await requireUser("viewer");
  const text = String(f.get("copy") ?? "").slice(0, 5000);
  if (!text.trim()) return { text, issues: [] };
  return { text, issues: checkBrandCopy({ caption: text }).map((i) => ({ severity: i.severity, detail: i.detail })) };
}

/** "Write with Ava": a fresh caption for this post in the brand voice (needs the AI key). */
export async function avaCaptionAction(input: { platform: string; format: string; headline: string; caption: string; idea: string }): Promise<{ ok: boolean; copy?: { hook: string; caption: string; callToAction: string; hashtags: string[]; altText: string }; message?: string }> {
  try {
    await requireUser("editor");
    const { writeCaptionAsAva } = await import("@/lib/ava-writer");
    const db = await getDb();
    const copy = await writeCaptionAsAva(db, input);
    return { ok: true, copy };
  } catch (e) {
    return { ok: false, message: msg(e) };
  }
}
