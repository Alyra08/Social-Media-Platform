"use client";
import { useState, useTransition } from "react";
import type { ContentType, Pillar } from "@/lib/ava-defaults";
import type { TrendBriefing } from "@/lib/ava";
import { resetAvaListAction, saveBriefingAction, saveContentTypesAction, saveInstructionsAction, savePillarsAction } from "./actions";

const input = "w-full rounded-[12px] border border-rosemist bg-white px-3 py-2 text-[14.5px] text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-ink";

function useSaver() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
    });
  const note = msg && (
    <p role="status" className={`text-[13px] font-bold ${msg.ok ? "text-ink" : "text-deepred"}`}>
      {msg.ok ? "✓ " : ""}
      {msg.text}
    </p>
  );
  return { pending, run, note };
}

function RowTools({ i, n, move, remove, label }: { i: number; n: number; move: (from: number, to: number) => void; remove: (i: number) => void; label: string }) {
  const b = "inline-flex h-8 w-8 items-center justify-center rounded-full text-ink hover:bg-blush disabled:opacity-30";
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button type="button" className={b} onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move ${label} up`}>
        ↑
      </button>
      <button type="button" className={b} onClick={() => move(i, i + 1)} disabled={i === n - 1} aria-label={`Move ${label} down`}>
        ↓
      </button>
      <button type="button" className={`${b} text-deepred`} onClick={() => remove(i)} aria-label={`Remove ${label}`}>
        ✕
      </button>
    </div>
  );
}

function useRows<T>(initial: T[]) {
  const [rows, setRows] = useState(initial);
  const set = (i: number, patch: Partial<T>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (from: number, to: number) =>
    setRows((r) => {
      if (to < 0 || to >= r.length) return r;
      const n = [...r];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });
  const remove = (i: number) => setRows((r) => r.filter((_, k) => k !== i));
  return { rows, setRows, set, move, remove };
}

/** Edit content pillars: name, what it covers, and its share of the feed. */
export function PillarsEditor({ initial, isOwner }: { initial: Pillar[]; isOwner: boolean }) {
  const { rows, setRows, set, move, remove } = useRows(initial.map((p) => ({ ...p, targetPct: Math.round(p.target * 100) })));
  const { pending, run, note } = useSaver();
  const total = rows.reduce((a, r) => a + (Number(r.targetPct) || 0), 0);
  return (
    <div className="space-y-3">
      <ul className="space-y-2.5">
        {rows.map((p, i) => (
          <li key={p.key || `new-${i}`} className="rounded-[16px] bg-shell p-3 ring-1 ring-inset ring-[rgb(200_0_20/0.08)]">
            <div className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem]">
                <label className="block">
                  <span className="sr-only">Pillar name</span>
                  <input value={p.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Pillar name" className={`${input} font-bold`} maxLength={50} />
                </label>
                <label className="flex items-center gap-1.5">
                  <span className="sr-only">Target share</span>
                  <input type="number" min={0} max={100} value={p.targetPct} onChange={(e) => set(i, { targetPct: Number(e.target.value) })} className={`${input} text-right`} />
                  <span className="text-[13px] font-bold text-ink">%</span>
                </label>
                <label className="block sm:col-span-2">
                  <span className="sr-only">What it covers</span>
                  <input value={p.about} onChange={(e) => set(i, { about: e.target.value })} placeholder="What this pillar covers" className={input} maxLength={220} />
                </label>
              </div>
              <RowTools i={i} n={rows.length} move={move} remove={remove} label={p.label || "pillar"} />
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, { key: "", label: "", about: "", target: 0, targetPct: 10 }])} disabled={rows.length >= 15}>
          + Add a pillar
        </button>
        <span className={`text-[13px] font-bold ${total === 100 ? "text-ink" : "text-deepred"}`}>Targets add up to {total}%{total === 100 ? " ✓" : " (aim for 100%)"}</span>
        <div className="ml-auto flex gap-2">
          {isOwner && (
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => confirm("Put the pillars back to the starting list?") && run(() => resetAvaListAction("pillars"))}>
              Reset
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => savePillarsAction(rows))}>
            {pending ? "Saving…" : "Save pillars"}
          </button>
        </div>
      </div>
      {note}
    </div>
  );
}

/** Edit content types: name and the signal each earns best. */
export function TypesEditor({ initial, isOwner }: { initial: ContentType[]; isOwner: boolean }) {
  const { rows, setRows, set, move, remove } = useRows(initial);
  const { pending, run, note } = useSaver();
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 md:grid-cols-2">
        {rows.map((t, i) => (
          <li key={t.key || `new-${i}`} className="flex items-center gap-2 rounded-[16px] bg-shell p-2.5 ring-1 ring-inset ring-[rgb(200_0_20/0.08)]">
            <div className="grid min-w-0 flex-1 gap-1.5">
              <label>
                <span className="sr-only">Content type name</span>
                <input value={t.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Content type" className={`${input} font-bold`} maxLength={50} />
              </label>
              <label>
                <span className="sr-only">Best for</span>
                <input value={t.best} onChange={(e) => set(i, { best: e.target.value })} placeholder="Best for, e.g. saves" className={`${input} text-[13.5px]`} maxLength={80} />
              </label>
            </div>
            <RowTools i={i} n={rows.length} move={move} remove={remove} label={t.label || "content type"} />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={() => setRows((r) => [...r, { key: "", label: "", best: "" }])} disabled={rows.length >= 30}>
          + Add a content type
        </button>
        <div className="ml-auto flex gap-2">
          {isOwner && (
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => confirm("Put the content types back to the starting list?") && run(() => resetAvaListAction("types"))}>
              Reset
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => saveContentTypesAction(rows))}>
            {pending ? "Saving…" : "Save content types"}
          </button>
        </div>
      </div>
      {note}
    </div>
  );
}

/** Ava's extra instructions from the owner. */
export function InstructionsEditor({ initial }: { initial: string }) {
  const [text, setText] = useState(initial);
  const { pending, run, note } = useSaver();
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Instructions for Ava</span>
        <textarea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          placeholder={"For example:\nKeep captions under 150 words on Instagram.\nAlways mention the next circle date when there is one.\nUse Australian examples first."}
          className={`${input} leading-snug`}
        />
      </label>
      <div className="flex items-center gap-3">
        <span className="text-[12.5px]">{text.length}/4000 · The brand brief still comes first.</span>
        <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={pending} onClick={() => run(() => saveInstructionsAction(text))}>
          {pending ? "Saving…" : "Save instructions"}
        </button>
      </div>
      {note}
    </div>
  );
}

const SECTIONS: [keyof TrendBriefing, string][] = [
  ["platformChanges", "Platform changes"],
  ["formatsWorking", "Formats working"],
  ["conversations", "Conversations"],
  ["taglineAngles", "Tagline angles"],
  ["doThis", "Do this"],
  ["avoid", "Avoid"],
];

/** Edit this week's trend briefing (one point per line). */
export function BriefingEditor({ initial }: { initial: TrendBriefing }) {
  const [form, setForm] = useState<Record<string, string>>(() => ({
    summary: initial.summary,
    ...Object.fromEntries(SECTIONS.map(([k]) => [k, (initial[k] as string[]).join("\n")])),
    sources: initial.sources.map((s) => `${s.title} | ${s.url}`).join("\n"),
  }));
  const { pending, run, note } = useSaver();
  const setF = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-ink">Summary</span>
        <textarea rows={3} value={form.summary} onChange={(e) => setF("summary", e.target.value)} className={`${input} leading-snug`} />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        {SECTIONS.map(([k, label]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-[13px] font-bold text-ink">{label} · one per line</span>
            <textarea rows={4} value={form[k]} onChange={(e) => setF(k, e.target.value)} className={`${input} leading-snug`} />
          </label>
        ))}
      </div>
      <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-ink">Sources · one per line, as Title | https://link</span>
        <textarea rows={3} value={form.sources} onChange={(e) => setF("sources", e.target.value)} className={`${input} text-[13px] leading-snug`} />
      </label>
      <div className="flex items-center gap-3">
        <span className="text-[12.5px]">Ava uses your edited briefing until her next weekly research.</span>
        <button type="button" className="btn btn-primary btn-sm ml-auto" disabled={pending} onClick={() => run(() => saveBriefingAction(form))}>
          {pending ? "Saving…" : "Save briefing"}
        </button>
      </div>
      {note}
    </div>
  );
}
