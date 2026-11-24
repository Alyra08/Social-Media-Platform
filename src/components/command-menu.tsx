"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { NAV_GROUPS } from "./nav";

type Cmd = { id: string; label: string; hint: string; group: "Actions" | "Go to" | "Search"; href: string; keywords?: string };

const ACTIONS: Cmd[] = [
  { id: "a-create", label: "Create a post", hint: "Design studio", group: "Actions", href: "/create", keywords: "new design studio canva make" },
  { id: "a-review", label: "Brand-check some copy", hint: "Brand review", group: "Actions", href: "/create?mode=review", keywords: "check caption brief voice" },
  { id: "a-restyle", label: "Restyle a design", hint: "Visual editor", group: "Actions", href: "/create?mode=restyle", keywords: "edit change" },
  { id: "a-news", label: "Review today's stories", hint: "Daily news", group: "Actions", href: "/news", keywords: "research approve" },
  { id: "a-content", label: "Approve captions", hint: "Content approval", group: "Actions", href: "/content", keywords: "copy posts" },
  { id: "a-article", label: "Write a website article", hint: "Website", group: "Actions", href: "/website", keywords: "blog new" },
  { id: "a-event", label: "Add an event or circle", hint: "Events", group: "Actions", href: "/website/events", keywords: "rsvp new" },
  { id: "a-note", label: "Draft the Sunday note", hint: "Newsletter", group: "Actions", href: "/website/newsletter", keywords: "email" },
  { id: "a-grid", label: "Preview the Instagram grid", hint: "Planner", group: "Actions", href: "/planner?view=grid", keywords: "feed profile" },
  { id: "a-keys", label: "Add an API key", hint: "Settings", group: "Actions", href: "/settings#keys", keywords: "anthropic resend canva connect" },
  { id: "a-ava", label: "See Ava's trend briefing", hint: "Ava", group: "Actions", href: "/ava", keywords: "trends pillars captions" },
];
const PLACES: Cmd[] = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ id: `p-${i.href}`, label: i.label, hint: g.title || "Home", group: "Go to" as const, href: i.href })));

/** Ctrl/Cmd+K: one box to go anywhere, do anything or search everything. */
export function CommandMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQ("");
        setI(0);
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => {
      setQ("");
      setI(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("sbf:command", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("sbf:command", onOpen);
    };
  }, []);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const match = (c: Cmd) => !t || `${c.label} ${c.hint} ${c.keywords ?? ""}`.toLowerCase().includes(t);
    const list = [...ACTIONS.filter(match), ...PLACES.filter(match)];
    if (t) list.push({ id: "search", label: `Search everything for “${q.trim()}”`, hint: "Stories, posts, briefs, assets, comments", group: "Search", href: `/search?q=${encodeURIComponent(q.trim())}` });
    return list.slice(0, 14);
  }, [q]);

  if (!open) return null;
  const go = (c: Cmd | undefined) => {
    if (!c) return;
    setOpen(false);
    router.push(c.href);
  };
  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]" onMouseDown={() => setOpen(false)} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Quick find" className="w-full max-w-xl overflow-hidden rounded-[22px] bg-white ring-1 ring-[rgb(200_0_20/0.15)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-rosemist px-5 py-3.5">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-deepred" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5 21 21" />
          </svg>
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setI((n) => Math.min(items.length - 1, n + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setI((n) => Math.max(0, n - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[i]);
              }
            }}
            placeholder="Go to, do or search anything…"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-charcoal"
            aria-label="Quick find"
            aria-controls="cmd-list"
            aria-activedescendant={items[i] ? `cmd-${items[i].id}` : undefined}
          />
          <kbd className="rounded-md bg-blush px-1.5 py-0.5 text-[11px] font-bold text-charcoal">Esc</kbd>
        </div>
        <ul id="cmd-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-[14px]">Nothing matches. Try another word.</li>}
          {items.map((c, n) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {head && <p className="px-3 pb-1 pt-3 font-serif text-[14px] italic text-deepred">{head}</p>}
                <button
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={n === i}
                  type="button"
                  onMouseEnter={() => setI(n)}
                  onClick={() => go(c)}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left ${n === i ? "bg-blush" : ""}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${n === i ? "bg-signal" : "bg-rose"}`} aria-hidden />
                  <span className="flex-1 text-[14.5px] font-bold text-ink">{c.label}</span>
                  <span className="text-[12px] text-charcoal">{c.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-rosemist px-5 py-2.5 text-[12px] text-charcoal">
          <kbd className="font-bold">↑</kbd> <kbd className="font-bold">↓</kbd> to move · <kbd className="font-bold">Enter</kbd> to open · <kbd className="font-bold">Ctrl K</kbd> anywhere
        </p>
      </div>
    </div>
  );
}

/** Top-bar button that opens the command menu. */
export function QuickFindButton() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("sbf:command"))} className="inline-flex h-9 items-center gap-2 rounded-full bg-shell px-3.5 text-[13px] font-bold text-ink ring-1 ring-inset ring-[rgb(200_0_20/0.14)] hover:bg-blush" aria-keyshortcuts="Control+K">
      Quick find <kbd className="rounded-md bg-white px-1.5 text-[11px] text-charcoal ring-1 ring-rosemist">Ctrl K</kbd>
    </button>
  );
}
