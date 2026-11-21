import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { formatBrisbane } from "@/lib/scheduling";
import { markNotifications } from "../actions";

type Row = typeof notifications.$inferSelect;

function NotificationList({ items }: { items: Row[] }) {
  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.id} className={`card flex flex-wrap items-start justify-between gap-3 py-3 ${n.read ? "opacity-75" : ""}`}>
          <div className="min-w-0">
            <p className="font-bold text-ink">
              {!n.read && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full bg-deepred" aria-label="Unread" />}
              {n.link ? <Link href={n.link}>{n.title}</Link> : n.title}
            </p>
            {n.body && <p className="text-[15px]">{n.body}</p>}
            <p className="text-sm">{formatBrisbane(n.createdAt)}</p>
          </div>
          {!n.read && (
            <form action={markNotifications}>
              <input type="hidden" name="id" value={n.id} />
              <button className="btn btn-sm">Mark read</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function NotificationsPage() {
  const db = await getDb();
  const rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(150);
  const attention = rows.filter((r) => r.requiresAttention);
  const background = rows.filter((r) => !r.requiresAttention);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Notifications" title="What needs you, and what just happened." emphasis="needs you">
        <form action={markNotifications}>
          <button className="btn btn-sm">Mark all read</button>
        </form>
      </PageHeader>
      <section>
        <h2 className="mb-3 text-2xl">Needs your attention.</h2>
        {attention.length ? <NotificationList items={attention} /> : <Empty title="Nothing needs you right now." />}
      </section>
      <section>
        <h2 className="mb-3 text-2xl">Background activity.</h2>
        {background.length ? <NotificationList items={background} /> : <p className="text-[15px]">Nothing yet.</p>}
      </section>
    </div>
  );
}
