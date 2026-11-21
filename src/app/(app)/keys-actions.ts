"use server";
import { redirect } from "next/navigation";
import { act } from "@/lib/flash";
import { removeKey, saveKey } from "@/lib/keys";
import { beginCanvaAuth, disconnectCanva, importFromCanva, openInCanva, reopenInCanva } from "@/lib/canva";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/* ───────────── Keys and connections (owner only) ───────────── */

export async function saveKeyAction(f: FormData) {
  await act("owner", async ({ db, user }) => {
    const name = s(f, "name");
    if (f.get("remove") === "1") {
      await removeKey(db, user, name);
      return "Removed. The studio now uses the value from .env.local, if there is one.";
    }
    await saveKey(db, user, name, String(f.get("value") ?? ""));
    return "Saved and switched on. No restart needed.";
  }, ["/settings", "/integrations", "/"]);
}

/* ───────────── Canva ───────────── */

export async function connectCanvaAction() {
  let url = "";
  await act("owner", async ({ db }) => {
    url = await beginCanvaAuth(db);
  }, ["/integrations"]);
  if (url) redirect(url);
}

export async function disconnectCanvaAction() {
  await act("owner", async ({ db, user }) => {
    await disconnectCanva(db, user);
    return "Canva disconnected.";
  }, ["/integrations", "/design"]);
}

export async function openInCanvaAction(f: FormData) {
  let url = "";
  await act("editor", async ({ db, user }) => {
    const designId = s(f, "designId");
    url = s(f, "reopen") === "1" ? await reopenInCanva(db, user, designId) : await openInCanva(db, user, s(f, "postId"), { fromDesignId: designId || undefined, format: s(f, "format") || undefined });
  }, ["/design"]);
  if (url) redirect(url);
}

export async function importFromCanvaAction(f: FormData) {
  await act("editor", async ({ db, user }) => {
    await importFromCanva(db, user, s(f, "designId"));
    return "Brought back from Canva. It's ready for approval.";
  }, ["/design"]);
}
