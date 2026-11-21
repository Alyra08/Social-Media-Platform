import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { designs } from "@/db/schema";
import { readStored } from "../files";

/** Font files used when rasterising designs (place TTF/OTF files in ./fonts). */
function fontFiles(): string[] {
  const dirs = [path.join(process.cwd(), "fonts"), path.join(process.cwd(), "src", "app")];
  return dirs.flatMap((d) => (fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => path.join(d, f)) : []));
}

/** Rasterise a design to PNG (uploaded PNG/JPEG designs are returned as-is). */
export async function designPng(db: Db, designId: string): Promise<{ bytes: Buffer; mime: string }> {
  const d = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  if (!d) throw new Error("Design not found");
  if (d.uploadPath && d.uploadMime && d.uploadMime !== "image/svg+xml") return { bytes: readStored(d.uploadPath), mime: d.uploadMime };
  const svg = d.uploadPath ? readStored(d.uploadPath).toString("utf8") : d.svg;
  if (!svg) throw new Error("Design has no artwork");
  const { Resvg } = await import("@resvg/resvg-js");
  // Remote @import fonts can't load server-side; strip and rely on local font files.
  const clean = svg.replace(/<style>@import[^<]*<\/style>/, "");
  const r = new Resvg(clean, {
    fitTo: { mode: "width", value: d.width },
    font: { fontFiles: fontFiles(), loadSystemFonts: true, defaultFontFamily: "Nunito Sans" },
  });
  return { bytes: Buffer.from(r.render().asPng()), mime: "image/png" };
}
