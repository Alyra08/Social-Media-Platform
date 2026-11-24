import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets, designs, posts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/client";
import { logoHref } from "@/lib/design/studio";
import { Editor } from "./editor";

export const dynamic = "force-dynamic";

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("editor");
  const { id } = await params;
  const db = await getDb();
  const d = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!d?.params || !d.postId) notFound();
  const p = await db.query.posts.findFirst({ where: eq(posts.id, d.postId) });
  if (!p) notFound();
  const photos = await db.select({ id: assets.id, name: assets.name }).from(assets).where(eq(assets.kind, "photo")).orderBy(desc(assets.createdAt)).limit(40);

  return (
    <Editor
      key={d.id}
      designId={d.id}
      status={d.status}
      postStatus={p.status}
      platform={p.platform}
      initial={{
        format: d.format,
        params: d.params,
        copy: { hook: p.hook, caption: p.caption, callToAction: p.callToAction, hashtags: p.hashtags, altText: p.altText ?? "" },
      }}
      logoHref={await logoHref(db)}
      photos={photos}
      ai={aiEnabled()}
    />
  );
}
