import { getDb } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { designPng } from "@/lib/design/png";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorised", { status: 401 });
  const { id } = await params;
  try {
    const { bytes, mime } = await designPng(await getDb(), id);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=60",
        ...(download ? { "Content-Disposition": `attachment; filename="sbf-design-${id.slice(0, 8)}.png"` } : {}),
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not found", { status: 404 });
  }
}
