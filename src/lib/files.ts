import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * File storage. Local disk under .data/uploads by default; swap `saveFile`/`readFile` for
 * S3/R2/Azure Blob in production (see README → Storage).
 */
const ROOT = (): string => process.env.UPLOAD_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), ".data", "uploads");

export const ALLOWED_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "application/pdf": ".pdf",
  "font/otf": ".otf",
  "font/ttf": ".ttf",
  "font/woff2": ".woff2",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
  "text/markdown": ".md",
};
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function saveUpload(file: File): Promise<{ relPath: string; mime: string; size: number }> {
  const mime = file.type || "application/octet-stream";
  const ext = ALLOWED_MIME[mime] ?? (/\.(otf|ttf|woff2)$/i.test(file.name) ? path.extname(file.name).toLowerCase() : null);
  if (!ext) throw new Error(`File type ${mime} isn't supported.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 200 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Basic content sniffing for images so a renamed file can't masquerade as an image.
  if (mime === "image/png" && buf.subarray(0, 4).toString("hex") !== "89504e47") throw new Error("File isn't a valid PNG.");
  if (mime === "image/jpeg" && buf.subarray(0, 2).toString("hex") !== "ffd8") throw new Error("File isn't a valid JPEG.");
  if (mime === "image/svg+xml" && /<script|on\w+=/i.test(buf.toString("utf8"))) throw new Error("SVG files with scripts aren't allowed.");
  const rel = path.join(/* turbopackIgnore: true */ new Date().toISOString().slice(0, 7), `${crypto.randomUUID()}${ext}`);
  const abs = path.join(/* turbopackIgnore: true */ ROOT(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { relPath: rel.replace(/\\/g, "/"), mime, size: buf.length };
}

export function writeBytes(rel: string, buf: Buffer) {
  const abs = path.join(/* turbopackIgnore: true */ ROOT(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
}

export function readStored(rel: string): Buffer {
  const abs = path.resolve(/* turbopackIgnore: true */ ROOT(), rel);
  if (!abs.startsWith(path.resolve(/* turbopackIgnore: true */ ROOT()))) throw new Error("Invalid path");
  return fs.readFileSync(abs);
}

/** HMAC-signed public URLs so social networks can fetch approved creatives without a login. */
export function signPublic(id: string): string {
  const secret = process.env.ENCRYPTION_KEY ?? "dev";
  return crypto.createHmac("sha256", secret).update(id).digest("base64url").slice(0, 32);
}
export function verifyPublic(id: string, sig: string): boolean {
  const a = Buffer.from(signPublic(id));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function publicDesignUrl(designId: string): string | null {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/api/public/designs/${designId}.png?sig=${signPublic(designId)}`;
}
