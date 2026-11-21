import type { events } from "@/db/schema";

type EventRow = typeof events.$inferSelect;

/** Brisbane-local value for <input type="datetime-local"> (Brisbane is UTC+10 all year). */
const local = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 16) : "");

export function EventFields({ e }: { e?: EventRow }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block md:col-span-2">
        <span className="label mb-1 block text-deepred">Title</span>
        <input name="title" defaultValue={e?.title} required className="input" placeholder="Sunday circle: the mental load." />
      </label>
      <label className="block md:col-span-2">
        <span className="label mb-1 block text-deepred">Summary (one or two sentences)</span>
        <textarea name="summary" defaultValue={e?.summary} className="textarea min-h-[70px]" maxLength={400} />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Starts (Brisbane time)</span>
        <input name="startsAt" type="datetime-local" defaultValue={local(e?.startsAt)} required className="input" />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Ends (optional)</span>
        <input name="endsAt" type="datetime-local" defaultValue={local(e?.endsAt)} className="input" />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Where</span>
        <input name="location" defaultValue={e?.location ?? ""} className="input" placeholder="Venue and suburb, or Online" />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Online link (sent only to people who RSVP)</span>
        <input name="onlineUrl" type="url" defaultValue={e?.onlineUrl ?? ""} className="input" placeholder="https://…" />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Places (empty for no limit)</span>
        <input name="capacity" type="number" min={1} defaultValue={e?.capacity ?? ""} className="input" />
      </label>
      <label className="block">
        <span className="label mb-1 block text-deepred">Cost</span>
        <input name="priceNote" defaultValue={e?.priceNote ?? ""} className="input" placeholder="Free, or $25 at the door" />
      </label>
      <label className="block md:col-span-2">
        <span className="label mb-1 block text-deepred">Description</span>
        <textarea name="body" defaultValue={e?.body} className="textarea min-h-[200px]" placeholder="What happens, who it's for, what to bring." />
      </label>
      {e && (
        <label className="block md:col-span-2">
          <span className="label mb-1 block text-deepred">Web address</span>
          <span className="flex items-center gap-1">
            <span className="text-sm">/events/</span>
            <input name="slug" defaultValue={e.slug} className="input" pattern="[a-z0-9\-]*" title="Lowercase letters, numbers and hyphens" />
          </span>
        </label>
      )}
    </div>
  );
}
