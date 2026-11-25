import Link from "next/link";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import { designs, posts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai/client";
import { DESIGN_FORMATS } from "@/lib/design/render";
import { ConfettiBackdrop, PLATFORM_LABEL } from "@/components/ui";
import { ReviewForm, StudioPrompt } from "./studio-client";

export const dynamic = "force-dynamic";

const MODES = [
  { key: "create", label: "Create a post" },
  { key: "restyle", label: "Restyle a design" },
  { key: "review", label: "Brand review" },
] as const;

/** Flat brand field behind the prompt: tints, arches and hearts (no gradients). */
function Field({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[32px] bg-blush px-4 py-12 sm:px-8 sm:py-16">
      <span aria-hidden className="absolute -left-10 bottom-[-4rem] h-64 w-48 rounded-t-full bg-peach" />
      <span aria-hidden className="absolute -right-8 -top-10 h-56 w-44 rounded-b-full bg-candy" />
      <span aria-hidden className="absolute bottom-[-3rem] right-16 hidden h-40 w-28 rounded-t-full bg-rose opacity-70 md:block" />
      <svg aria-hidden viewBox="0 0 100 60" className="absolute left-[12%] top-8 hidden h-12 w-20 md:block">
        {[
          [50, 14, 1],
          [24, 34, 0.6],
          [78, 36, 0.6],
        ].map(([x, y, s], k) => (
          <path key={k} transform={`translate(${x} ${y}) scale(${s})`} d="M0 6C-8-6-22 4 0 20 22 4 8-6 0 6z" fill="var(--color-signal)" />
        ))}
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}

type Row = { d: typeof designs.$inferSelect; hook: string; platform: string };

function Thumbs({ rows }: { rows: Row[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
      {rows.map(({ d, hook, platform }) => (
        <li key={d.id}>
          <Link href={`/create/${d.id}`} className="group block text-charcoal no-underline">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[18px] bg-blush p-3 ring-1 ring-inset ring-[rgb(200_0_20/0.06)] transition-transform group-hover:-translate-y-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/designs/${d.id}/image`} alt="" className="max-h-full max-w-full rounded-[8px] object-contain" loading="lazy" />
            </div>
            <p className="mt-2 line-clamp-2 text-[14px] font-bold leading-snug text-ink group-hover:underline">{hook}</p>
            <p className="text-[12px]">
              {PLATFORM_LABEL[platform] ?? platform} · {DESIGN_FORMATS[d.format]?.label ?? d.format} · {d.status === "draft" ? "Draft" : d.status.replace(/_/g, " ")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DesignStudio({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  await requireUser("editor");
  const mode = (await searchParams).mode ?? "create";
  const db = await getDb();
  const demo = !aiEnabled();

  const [drafts, recent] = await Promise.all([
    db
      .select({ d: designs, hook: posts.hook, platform: posts.platform })
      .from(designs)
      .innerJoin(posts, eq(posts.id, designs.postId))
      .where(and(eq(designs.source, "studio"), eq(designs.status, "draft")))
      .orderBy(desc(designs.createdAt))
      .limit(8),
    mode === "restyle"
      ? db
          .select({ d: designs, hook: posts.hook, platform: posts.platform })
          .from(designs)
          .innerJoin(posts, eq(posts.id, designs.postId))
          .where(and(isNotNull(designs.params), inArray(designs.status, ["proposed", "approved", "changes_requested", "draft"])))
          .orderBy(desc(designs.createdAt))
          .limit(24)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-12">
      <header className="relative isolate grid gap-6 overflow-hidden rounded-t-[32px] px-6 pb-8 pt-48 sm:px-10 sm:pt-60 xl:pt-64 md:grid-cols-[minmax(0,1fr)_22rem] md:items-end">
        <ConfettiBackdrop fade="55%" />
        <div>
          <p className="label text-deepred">Design studio</p>
          <h1 className="mt-3 text-[2.6rem] font-medium leading-[1.02] text-ink sm:text-6xl">
            Your AI design{" "}
            <span className="script inline-block text-[1.2em] font-normal leading-none text-deepred" style={{ transform: "translateY(0.08em)" }}>
              studio.
            </span>
          </h1>
        </div>
        <p className="text-[15.5px] leading-relaxed">Describe a post in your own words. The studio drafts the copy and the design in your brand, then opens it in the editor so you can change anything before it goes for approval.</p>
      </header>

      <nav aria-label="Studio mode" className="flex justify-center">
        <ul className="segmented justify-center">
          {MODES.map((m) => (
            <li key={m.key}>
              <Link
                href={`/create?mode=${m.key}`}
                aria-current={mode === m.key ? "page" : undefined}
                className="seg"
              >
                {m.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {mode === "review" ? (
        <Field>
          <ReviewForm />
        </Field>
      ) : mode === "restyle" ? (
        <section aria-labelledby="restyle">
          <h2 id="restyle" className="mb-2 text-3xl">
            Pick a design to <em>restyle</em>.
          </h2>
          <p className="mb-6 text-[15px]">It opens in the editor. Changing an approved design makes a new version that needs approving again; the approved one stays as it is.</p>
          {recent.length === 0 ? <p className="card text-[15px]">No designs yet. Create one first.</p> : <Thumbs rows={recent} />}
        </section>
      ) : (
        <Field>
          <StudioPrompt demo={demo} />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              { href: "/brand", label: "Brand library" },
              { href: "/design", label: "Design approval" },
              { href: "/create?mode=restyle", label: "Visual editor" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 rounded-full bg-peachcream px-3.5 py-1.5 text-[13px] font-bold text-ink no-underline ring-1 ring-inset ring-[rgb(251_101_38/0.2)] hover:bg-shell">
                {l.label} <span aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </Field>
      )}

      {mode === "create" && drafts.length > 0 && (
        <section aria-labelledby="drafts">
          <h2 id="drafts" className="mb-5 text-3xl">
            Your <em>drafts</em>.
          </h2>
          <Thumbs rows={drafts} />
        </section>
      )}
    </div>
  );
}
