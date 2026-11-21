import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { brandPreferences, feedbackEvents } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { LEARN_THRESHOLD } from "@/lib/learning";
import { formatBrisbane } from "@/lib/scheduling";
import { addPreference, preferenceAction } from "../actions";

const AREAS: Record<string, string> = {
  voice: "Brand voice",
  editorial: "Editorial preferences",
  visual: "Visual design",
  seo: "SEO",
  audience: "Audience interests",
  performance: "Content performance",
  community: "Community response style",
};

const STATE: Record<string, string> = { candidate: "Noticed once", learned: "Learned (applied)", confirmed: "Confirmed by you (applied)", dismissed: "Dismissed" };

export default async function IntelligencePage() {
  const db = await getDb();
  const prefs = await db.select().from(brandPreferences).orderBy(desc(brandPreferences.evidenceCount));
  const events = await db.select().from(feedbackEvents).orderBy(desc(feedbackEvents.createdAt)).limit(25);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="AI brand intelligence and learning" title="What the studio has learned about you." emphasis="learned" />
      <div className="card-tint text-[15px]">
        Every approval, denial, edit and note teaches the studio. A one-off change stays as <strong className="text-ink">noticed once</strong>. After {LEARN_THRESHOLD} similar signals it becomes <strong className="text-ink">learned</strong> and is applied to new research, captions, designs and replies. You can confirm, rewrite or dismiss anything. Learned preferences never override the brand brief or invent new brand values.
      </div>

      {Object.entries(AREAS).map(([area, label]) => {
        const list = prefs.filter((p) => p.area === area);
        return (
          <section key={area}>
            <h2 className="mb-3 text-2xl">{label}</h2>
            {list.length === 0 ? (
              <p className="text-[15px]">Nothing learned yet.</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {list.map((p) => (
                  <li key={p.id} className={`card ${p.state === "dismissed" ? "opacity-70" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={p.state === "learned" || p.state === "confirmed" ? "pill-ink pill" : "pill"}>{STATE[p.state]}</span>
                      <span className="text-sm">
                        {p.evidenceCount} signal{p.evidenceCount === 1 ? "" : "s"} · {formatBrisbane(p.updatedAt)}
                      </span>
                    </div>
                    <form action={preferenceAction} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={p.id} />
                      <input name="description" defaultValue={p.description} className="input" aria-label="Preference" />
                      {p.lastEvidence && <p className="text-sm">Latest evidence: {p.lastEvidence}</p>}
                      <div className="flex flex-wrap gap-2">
                        {p.state !== "confirmed" && (
                          <button name="state" value="confirmed" className="btn btn-sm">
                            Confirm
                          </button>
                        )}
                        {p.state !== "dismissed" && (
                          <button name="state" value="dismissed" className="btn btn-sm">
                            Dismiss
                          </button>
                        )}
                        {p.state === "dismissed" && (
                          <button name="state" value="learned" className="btn btn-sm">
                            Restore
                          </button>
                        )}
                        <button name="state" value={p.state} className="btn btn-sm">
                          Save wording
                        </button>
                      </div>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section>
        <h2 className="mb-3 text-2xl">Teach it directly.</h2>
        <form action={addPreference} className="card flex flex-wrap gap-2">
          <select name="area" className="select max-w-[240px]" aria-label="Area">
            {Object.entries(AREAS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input name="description" required className="input min-w-[260px] flex-1" placeholder="e.g. Always mention the Sunday note in newsletter-friendly posts" aria-label="Preference" />
          <button className="btn btn-primary">Add preference</button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-2xl">Recent signals.</h2>
        <ul className="card divide-y divide-rosemist text-[15px]">
          {events.map((e) => (
            <li key={e.id} className="py-2">
              {formatBrisbane(e.createdAt)} · {e.action} {e.subjectType}
              {e.feedback && `: “${e.feedback}”`}
              {e.signals.length > 0 && <span className="ml-2 text-sm">→ {e.signals.join(", ")}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
