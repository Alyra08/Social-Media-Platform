import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { colours, textOnColourViolation, type ColourName } from "@/lib/brand/tokens";
import { formatBrisbane } from "@/lib/scheduling";
import { deleteAsset, updateAssetContent, uploadAsset } from "../actions";

const KINDS: Record<string, string> = {
  guideline: "Brand guidelines",
  strategy: "Brand strategy",
  logo: "Logos and variations",
  colour: "Colours",
  font: "Typography",
  template: "Approved templates",
  photo: "Photography and imagery",
  example: "Design examples",
  campaign: "Previous campaigns",
  messaging: "Messaging and positioning",
  tone: "Tone of voice examples",
  language: "Approved and prohibited language",
  reference: "Visual references and inspiration",
};

const SWATCHES: { name: ColourName; label: string; role: string }[] = [
  { name: "signal", label: "Signal Red", role: "Primary. Headlines, poster type, colour fields" },
  { name: "hot", label: "Hot Pink", role: "Feature cards, italic accents" },
  { name: "rose", label: "Rose", role: "Decoration only. Never text" },
  { name: "tangerine", label: "Tangerine", role: "Badges, quote banners, stickers" },
  { name: "blush", label: "Blush", role: "Main background" },
  { name: "shell", label: "Shell", role: "Cards, forms, panels" },
  { name: "roseMist", label: "Rose Mist", role: "Section tint" },
  { name: "candy", label: "Candy", role: "Section tint" },
  { name: "peach", label: "Peach", role: "Section tint, success" },
  { name: "peachCream", label: "Peach Cream", role: "Section tint" },
  { name: "deepRed", label: "Deep Red", role: "Buttons, links, small red text" },
  { name: "charcoal", label: "Charcoal", role: "All body text" },
  { name: "deepInk", label: "Deep Ink", role: "Emphasis, success, focus" },
];

export default async function BrandPage() {
  const db = await getDb();
  const rows = await db.select().from(assets).orderBy(desc(assets.isSourceOfTruth), desc(assets.createdAt));
  const brief = rows.find((r) => r.kind === "guideline" && r.isSourceOfTruth);

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Brand guidelines and asset library" title="The source of truth." emphasis="source of truth" />

      <section>
        <h2 className="mb-4">Colour, with the rules built in.</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7">
          {SWATCHES.map((s) => {
            const bright = ["signal", "hot", "tangerine"].includes(s.name);
            const textOk = !textOnColourViolation(s.name, bright ? "white" : "charcoal", { sizePx: 24 });
            return (
              <figure key={s.name} className="card p-3">
                <div className="flex h-20 items-end rounded-[14px] p-2" style={{ background: colours[s.name] }}>
                  {s.name !== "rose" && textOk && (
                    <span className={`font-serif text-2xl ${bright || ["deepRed", "charcoal", "deepInk"].includes(s.name) ? "text-white" : "text-charcoal"}`}>Aa</span>
                  )}
                </div>
                <figcaption className="mt-2 text-sm">
                  <strong className="text-ink">{s.label}</strong> {colours[s.name]}
                  <br />
                  {s.role}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="label text-deepred">Typography</p>
          <p className="mt-3 font-serif text-4xl font-light text-signal">
            Headlines are <em className="text-hot">light</em>.
          </p>
          <p className="poster mt-3 text-4xl">One big statement</p>
          <p className="poster poster-outline text-4xl">outlined beneath</p>
          <p className="script mt-2 text-5xl">together.</p>
          <p className="mt-3">Body copy is Nunito Sans at 17px, in Charcoal on the lights.</p>
          <p className="label mt-3 text-deepred">Labels are Brolia, uppercase and tracked</p>
          <p className="mt-3 text-sm">Silk Serif ExtraLight is shown with its fallback, Cormorant Garamond, until its licence file is added.</p>
        </div>
        <div className="card-tint">
          <p className="label text-deepred">Fixed lines (never rewritten)</p>
          <p className="mt-2 font-serif text-2xl font-light text-deepred">Unapologetically fierce. Beautifully imperfect.</p>
          <p className="mt-2 font-serif text-xl font-light text-ink">A space for the unapologetically fierce, beautifully imperfect woman.</p>
          <p className="label mt-5 text-deepred">Calls to action</p>
          <p>Get the Sunday note · See the next circle · Join the circle · Read the full story</p>
          <p className="label mt-5 text-deepred">Words to avoid (checked automatically)</p>
          <p>empower (as a verb), journey, unlock, elevate, game-changing, girl boss, slay, queen, &quot;we&apos;re on a mission&quot;, war and army language. No exclamation marks, no emoji.</p>
        </div>
      </section>

      {brief && (
        <section>
          <h2 className="mb-2">Brand brief.</h2>
          <p className="mb-3 text-[15px]">Every piece of AI-generated research, copy, design and reply is written against this brief. Editing it creates a new version (v{brief.version}).</p>
          <form action={updateAssetContent} className="card space-y-3">
            <input type="hidden" name="id" value={brief.id} />
            <textarea name="content" defaultValue={brief.content ?? ""} className="textarea min-h-[420px] text-[15px]" aria-label="Brand brief" />
            <button className="btn btn-primary">Save brand brief</button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-4">Add to the library.</h2>
        <form action={uploadAsset} className="card grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Type
            <select name="kind" className="select">
              {Object.entries(KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Name
            <input name="name" className="input" placeholder="e.g. Primary wordmark, red" />
          </label>
          <label className="text-sm md:col-span-2">
            File (images, video, PDF, Word, fonts — up to 200 MB)
            <input type="file" name="file" className="mt-1 block text-sm" />
          </label>
          <label className="text-sm md:col-span-2">
            Or text (tone of voice examples, approved language, messaging)
            <textarea name="content" className="textarea" />
          </label>
          <label className="text-sm md:col-span-2">
            Tags (comma separated)
            <input name="tags" className="input" placeholder="circle, retreat, founder" />
          </label>
          <p className="text-sm md:col-span-2">Upload the logo as type “Logos”: the design engine uses the newest one on every design.</p>
          <button className="btn md:justify-self-start">Add to library</button>
        </form>
      </section>

      {Object.entries(KINDS).map(([kind, label]) => {
        const list = rows.filter((r) => r.kind === kind && !(r.kind === "guideline" && r.isSourceOfTruth));
        if (!list.length) return null;
        return (
          <section key={kind}>
            <h3 className="mb-3">{label}</h3>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((a) => (
                <li key={a.id} className="card">
                  {a.path && a.mime?.startsWith("image/") && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/files/${a.id}`} alt={a.name} className="mb-2 max-h-40 rounded-[14px] object-contain" />
                  )}
                  <p className="font-bold text-ink">{a.name}</p>
                  {a.content && <p className="mt-1 line-clamp-4 whitespace-pre-line text-sm">{a.content}</p>}
                  <p className="mt-1 text-sm">
                    {a.tags.join(", ")} {a.path && <a href={`/api/files/${a.id}`}>Open file</a>} · {formatBrisbane(a.createdAt)}
                  </p>
                  {!a.isSourceOfTruth && (
                    <form action={deleteAsset} className="mt-2">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn btn-sm">Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
