import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { assets, users } from "@/db/schema";
import { hashPassword } from "./crypto";
import { SBF_BRAND_BRIEF } from "./brand/brief";
import { colours } from "./brand/tokens";

/** Idempotent first-run setup: owner account + brand brief as the source of truth. */
export async function ensureSeed(db: Db) {
  const email = (process.env.SBF_OWNER_EMAIL ?? "").toLowerCase().trim();
  const password = process.env.SBF_OWNER_PASSWORD;
  if (email && password) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!existing) await db.insert(users).values({ email, name: process.env.SBF_OWNER_NAME ?? "SBF owner", role: "owner", passwordHash: hashPassword(password) });
  }
  const brief = await db.query.assets.findFirst({ where: eq(assets.kind, "guideline") });
  if (!brief) {
    await db.insert(assets).values([
      { kind: "guideline", name: "SBF brand brief (voice, colour, type, design)", content: SBF_BRAND_BRIEF, isSourceOfTruth: true, tags: ["source of truth", "voice", "colour", "typography"] },
      {
        kind: "colour",
        name: "Brand colours",
        content: Object.entries(colours).map(([k, v]) => `${k}: ${v}`).join("\n"),
        isSourceOfTruth: true,
        tags: ["colour"],
      },
      { kind: "font", name: "Brolia (labels and navigation)", path: null, content: "BroliaRegular.otf is bundled with the app. Add BroliaLigature.otf and Silk Serif ExtraLight licence files here.", tags: ["typography"] },
    ]);
  }
}
