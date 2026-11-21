import { getDb } from "@/db";
import { unsubscribe } from "@/lib/newsletter";

/** RFC 8058 one-click unsubscribe (List-Unsubscribe-Post), used by Gmail and Apple Mail. */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  await unsubscribe(await getDb(), token);
  return new Response(null, { status: 200 });
}
