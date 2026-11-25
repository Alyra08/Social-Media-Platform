import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, auditLog, jobLocks, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { getAllSettings } from "@/lib/system";
import { JOBS } from "@/lib/jobs";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { formatBrisbane } from "@/lib/scheduling";
import { aiEnabled, model } from "@/lib/ai/client";
import { addTeamMember, changeOwnPassword, runJobNow, saveFooterAction, saveSettings, updateOwnName, updateTeamMember } from "../actions";
import { saveKeyAction } from "../keys-actions";
import { KEY_GROUPS, keyStatuses } from "@/lib/keys";

const NOTIFY: Record<string, string> = {
  research_ready: "New daily research is ready",
  breaking_story: "Important breaking story",
  brief_ready: "Article brief ready",
  content_awaiting: "Social content awaiting approval",
  design_awaiting: "Designs awaiting approval",
  post_scheduled: "Post scheduled",
  post_published: "Post published",
  publish_failed: "Publishing failed",
  manual_publish_needed: "Manual publishing needed",
  interaction: "Meaningful comment or message",
  report_ready: "Report ready",
  system: "System and morning summary",
};

export default async function SettingsPage() {
  const db = await getDb();
  const s = await getAllSettings(db);
  const me = await requireUser();
  const keys = me.role === "owner" ? await keyStatuses(db) : [];
  const [activity, audits, locks, team] = await Promise.all([
    db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(80),
    db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(60),
    db.select().from(jobLocks),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).orderBy(users.createdAt),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader eyebrow="Platform settings and automation" title="How the studio runs." emphasis="runs" />

      <form action={saveSettings} className="space-y-6">
        <section className="card grid gap-4 md:grid-cols-2">
          <div>
            <p className="label text-deepred">AI</p>
            <p className="mt-1 text-[15px]">{aiEnabled() ? `Live. Model: ${model()} with web search and refusal fallbacks.` : "Demo mode. Add the Anthropic API key under Keys and connections below."}</p>
          </div>
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" name="automationEnabled" defaultChecked={s.automationEnabled} className="h-5 w-5 accent-deepred" />
            Automation on (scheduled research, publishing, syncing and reports)
          </label>
          <label className="text-[15px]">
            Most posts per day, per platform
            <input type="number" min={1} max={10} name="maxPostsPerDayPerPlatform" defaultValue={s.maxPostsPerDayPerPlatform} className="input mt-1 max-w-[120px]" />
          </label>
          <label className="text-[15px]">
            Hours between similar topics on a platform
            <input type="number" min={0} max={240} name="minHoursBetweenSimilarTopics" defaultValue={s.minHoursBetweenSimilarTopics} className="input mt-1 max-w-[120px]" />
          </label>
        </section>

        <section className="card">
          <p className="label mb-2 text-deepred">Editorial balance (starting points, %)</p>
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <label key={k} className="text-[15px]">
                {v}
                <input type="number" min={0} max={100} name={`balance_${k}`} defaultValue={s.editorialBalance[k] ?? 0} className="input mt-1 max-w-[120px]" />
              </label>
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <p className="label text-deepred">Community auto-replies</p>
          <p className="text-[15px]">
            Off by default. When on, the studio may reply automatically <strong className="text-ink">only</strong> to the low-risk categories you tick. It never auto-replies to direct messages, sensitive disclosures, allegations, medical or legal questions, threats, domestic violence or personal situations.
          </p>
          <label className="flex items-center gap-3 text-[15px]">
            <input type="checkbox" name="autoReplyEnabled" defaultChecked={s.autoReplyEnabled} className="h-5 w-5 accent-deepred" />I authorise automatic replies in my voice for:
          </label>
          <div className="flex flex-wrap gap-4 pl-8 text-[15px]">
            {["positive", "general"].map((c) => (
              <label key={c} className="flex items-center gap-2">
                <input type="checkbox" name="autoReplyCategories" value={c} defaultChecked={s.autoReplyCategories.includes(c)} className="accent-deepred" />
                {c === "positive" ? "Positive feedback" : "General comments"}
              </label>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="label mb-2 text-deepred">Notifications</p>
          <div className="grid gap-2 md:grid-cols-2">
            {Object.entries(NOTIFY).map(([k, v]) => (
              <label key={k} className="flex items-center gap-2 text-[15px]">
                <input type="checkbox" name={`notify_${k}`} defaultChecked={s.notificationPreferences[k as keyof typeof s.notificationPreferences] !== false} className="accent-deepred" />
                {v}
              </label>
            ))}
          </div>
        </section>

        <button className="btn btn-primary">Save settings</button>
      </form>

      {me.role === "owner" && (
        <section id="keys" aria-labelledby="keys-h">
          <h2 id="keys-h" className="mb-2">
            Keys and connections.
          </h2>
          <p className="mb-4 text-[15px]">
            Add these whenever you&apos;re ready. Each one switches on as soon as you save it, with no restart. Keys are encrypted before they&apos;re stored, only the last four characters are ever shown, and every change is recorded in the audit log. A key saved here is used instead of the same key in <code>.env.local</code>.
          </p>
          <div className="space-y-5">
            {KEY_GROUPS.map((g) => {
              const items = keys.filter((k) => k.group === g.id);
              const on = items.filter((k) => k.source !== "none").length;
              return (
                <details key={g.id} className="card" open={g.id === "ai" && on === 0}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                    <span className="font-serif text-2xl font-light text-deepred">{g.title}</span>
                    <span className={on === items.length ? "pill-ok pill" : on ? "pill" : "pill"}>
                      {on === items.length ? "All added" : on ? `${on} of ${items.length} added` : "Not added yet"}
                    </span>
                  </summary>
                  <p className="mt-2 text-[15px]">{g.intro}</p>
                  <ul className="mt-3 divide-y divide-rosemist">
                    {items.map((k) => (
                      <li key={k.name} className="py-3">
                        <form action={saveKeyAction} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center">
                          <input type="hidden" name="name" value={k.name} />
                          <div className="text-[15px]">
                            <label htmlFor={`key-${k.name}`} className="font-bold text-ink">
                              {k.label}
                            </label>
                            <p className="text-sm">
                              {k.source === "app" ? `Added here: ${k.display}` : k.source === "env" ? `From .env.local: ${k.display}` : "Not added"}
                              {k.help ? ` · ${k.help}` : ""}
                            </p>
                          </div>
                          <input
                            id={`key-${k.name}`}
                            name="value"
                            type={k.secret ? "password" : "text"}
                            autoComplete="off"
                            spellCheck={false}
                            className="input"
                            placeholder={k.source === "none" ? (k.placeholder ?? "Paste it here") : "Paste a new value to replace it"}
                          />
                          <div className="flex gap-2">
                            <button className="btn btn-sm">Save</button>
                            {k.source === "app" && (
                              <button name="remove" value="1" formNoValidate className="btn btn-sm">
                                Remove
                              </button>
                            )}
                          </div>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {me.role === "owner" && (
        <section id="footer" aria-labelledby="footer-h" className="scroll-mt-6">
          <h2 id="footer-h" className="mb-1">
            Website <em>footer</em>.
          </h2>
          <p className="mb-4 text-[15px]">What appears at the bottom of every page of the public website. Anything left empty is simply not shown.</p>
          <form action={saveFooterAction} className="card grid gap-4 md:grid-cols-2">
            {(
              [
                ["headline", "Big line", "Come as you are. Leave louder.", "text"],
                ["emphasis", "Words in italics (from the big line)", "Leave louder.", "text"],
                ["subline", "Line underneath", "A space for the unapologetically fierce, beautifully imperfect woman.", "text"],
                ["email", "Contact email", "hello@yourdomain.com", "email"],
                ["location", "Location", "Brisbane, Australia", "text"],
                ["instagram", "Instagram link", "https://instagram.com/…", "url"],
                ["tiktok", "TikTok link", "https://tiktok.com/@…", "url"],
                ["facebook", "Facebook link", "https://facebook.com/…", "url"],
                ["linkedin", "LinkedIn link", "https://linkedin.com/company/…", "url"],
                ["youtube", "YouTube link", "https://youtube.com/@…", "url"],
                ["pinterest", "Pinterest link", "https://pinterest.com/…", "url"],
                ["threads", "Threads link", "https://threads.net/@…", "url"],
              ] as const
            ).map(([k, label, ph, type]) => (
              <label key={k} className={k === "subline" || k === "headline" ? "md:col-span-2" : ""}>
                <span className="mb-1 block text-[13px] font-bold text-ink">{label}</span>
                <input name={k} type={type} defaultValue={s.siteFooter?.[k] ?? ""} placeholder={ph} className="input" />
              </label>
            ))}
            <div className="md:col-span-2">
              <button className="btn btn-primary btn-sm">Save footer</button>
            </div>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-3">Team and access.</h2>
        <p className="mb-3 text-[15px]">Owners approve, publish and change settings. Editors research, draft, edit and upload. Viewers can look but not change anything.</p>
        <ul className="card mb-4 divide-y divide-rosemist">
          {team.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[15px]">
              <span>
                <strong className="text-ink">{u.name}</strong> · {u.email}
                {u.id === me.id && " (you)"}
              </span>
              {u.id === me.id ? (
                <form action={updateOwnName} className="flex flex-wrap items-center gap-2">
                  <label htmlFor="own-name" className="sr-only">
                    Your name
                  </label>
                  <input id="own-name" name="name" defaultValue={u.name} maxLength={60} className="input max-w-[220px]" />
                  <button className="btn btn-sm">Save your name</button>
                  <span className="pill">{u.role}</span>
                </form>
              ) : me.role !== "owner" ? (
                <span className="pill">{u.role}</span>
              ) : (
                <form action={updateTeamMember} className="flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="select max-w-[140px]" aria-label={`Role for ${u.email}`}>
                    <option value="owner">Owner</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button className="btn btn-sm">Save role</button>
                  <button name="remove" value="1" className="btn btn-sm">
                    Remove access
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
        <div className="grid gap-4 lg:grid-cols-2">
          {me.role === "owner" && (
            <form action={addTeamMember} className="card space-y-2">
              <p className="label text-deepred">Give someone access</p>
              <input name="name" className="input" placeholder="Name" aria-label="Name" />
              <input name="email" type="email" required className="input" placeholder="Email" aria-label="Email" />
              <input name="password" type="password" required minLength={12} autoComplete="new-password" className="input" placeholder="Starting password (12+ characters)" aria-label="Starting password" />
              <select name="role" className="select" aria-label="Role" defaultValue="editor">
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
                <option value="owner">Owner</option>
              </select>
              <button className="btn btn-sm">Add to the team</button>
            </form>
          )}
          <form action={changeOwnPassword} className="card space-y-2">
            <p className="label text-deepred">Change your password</p>
            <input name="current" type="password" required autoComplete="current-password" className="input" placeholder="Current password" aria-label="Current password" />
            <input name="next" type="password" required minLength={12} autoComplete="new-password" className="input" placeholder="New password (12+ characters)" aria-label="New password" />
            <button className="btn btn-sm">Change password</button>
          </form>
        </div>
      </section>

      <section>
        <h2 className="mb-3">Scheduled jobs.</h2>
        <ul className="card divide-y divide-rosemist">
          {Object.entries(JOBS).map(([name, j]) => {
            const lock = locks.find((l) => l.name === name);
            return (
              <li key={name} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[15px]">
                <span>
                  <strong className="text-ink">{j.description}</strong>
                  <br />
                  <code className="text-sm">{j.cron}</code> Brisbane · last run {lock?.lastRunAt ? formatBrisbane(lock.lastRunAt) : "never"}
                </span>
                <form action={runJobNow}>
                  <input type="hidden" name="job" value={name} />
                  <button className="btn btn-sm">Run now</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="activity">
        <h2 className="mb-3">Automation activity log.</h2>
        <ul className="card max-h-[520px] divide-y divide-rosemist overflow-y-auto text-[15px]">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <span className={a.status === "failed" ? "font-bold text-deepred" : "font-bold text-ink"}>
                  {a.status === "ok" ? "✓" : a.status === "failed" ? "✕" : "·"} {a.job}
                </span>{" "}
                {a.detail}
              </span>
              <span className="text-sm">{formatBrisbane(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3">Approval and audit record.</h2>
        <ul className="card max-h-[420px] divide-y divide-rosemist overflow-y-auto text-[15px]">
          {audits.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
              <span>
                <strong className="text-ink">{a.actor}</strong> {a.action.replace(/\./g, " ").replace(/_/g, " ")} {a.subjectType}
                {a.detail ? `: ${a.detail.slice(0, 120)}` : ""}
              </span>
              <span className="text-sm">{formatBrisbane(a.createdAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
