"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { reschedule } from "@/app/(app)/actions";

export type CalItem = {
  id: string;
  date: string; // YYYY-MM-DD Brisbane
  time: string;
  platform: string;
  platformLabel: string;
  status: string;
  statusLabel: string;
  hook: string;
  caption: string;
  category: string;
  thumbId: string | null;
};

const STATUS_STYLE: Record<string, string> = {
  scheduled: "bg-ink text-white",
  published: "bg-peach text-ink",
  failed: "bg-deepred text-white",
  manual_required: "bg-deepred text-white",
  approved_for_publishing: "bg-candy text-ink",
  awaiting_content: "bg-rosemist text-ink",
  awaiting_design: "bg-rosemist text-ink",
};

export function Calendar({ days, items, view, todayIso }: { days: { iso: string; label: string; inMonth: boolean }[]; items: CalItem[]; view: string; todayIso: string }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const byDay = new Map<string, CalItem[]>();
  for (const i of items) byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]);
  const compact = view === "quarter";
  const cols = view === "day" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-7";

  return (
    <div aria-busy={pending}>
      {view !== "day" && (
        <div className="hidden grid-cols-7 gap-2 sm:grid" aria-hidden>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <p key={d} className="label px-2 text-deepred">
              {d}
            </p>
          ))}
        </div>
      )}
      <div className={`grid gap-2 ${cols}`}>
        {days.map((d) => {
          const list = byDay.get(d.iso) ?? [];
          return (
            <div
              key={d.iso}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(d.iso);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragging;
                setOver(null);
                setDragging(null);
                if (id) start(() => reschedule(id, d.iso));
              }}
              className={`min-h-[110px] rounded-[18px] p-2 ${d.inMonth ? "bg-shell" : "bg-peachcream"} ${over === d.iso ? "outline-2 outline-ink" : ""} ${compact ? "min-h-[64px]" : ""}`}
            >
              <p className={`mb-1 text-sm font-bold ${d.iso === todayIso ? "text-deepred" : "text-ink"}`}>{d.label}</p>
              {compact ? (
                list.length > 0 && <p className="text-sm">{list.length} post{list.length > 1 ? "s" : ""}</p>
              ) : (
                <ul className="space-y-1.5">
                  {list.map((i) => (
                    <li
                      key={i.id}
                      draggable={!["published", "publishing"].includes(i.status)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", i.id);
                        setDragging(i.id);
                      }}
                      className={`cursor-grab rounded-[12px] p-1.5 text-xs ${STATUS_STYLE[i.status] ?? "bg-rosemist text-ink"}`}
                      title={`${i.platformLabel} · ${i.statusLabel}\n${i.caption}`}
                    >
                      <Link href={`/content?post=${i.id}#${i.id}`} className="flex gap-1.5 text-inherit no-underline">
                        {i.thumbId && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/designs/${i.thumbId}/image`} alt="" className="h-9 w-9 shrink-0 rounded-[8px] object-cover" loading="lazy" />
                        )}
                        <span className="min-w-0">
                          <span className="block font-bold">
                            {i.time} {i.platformLabel}
                          </span>
                          <span className="line-clamp-2">{i.hook}</span>
                          <span className="block opacity-90">{i.statusLabel}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-sm">Drag a post to another day to reschedule it. The time stays the same. Published posts can&apos;t be moved.</p>
    </div>
  );
}
