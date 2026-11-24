"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; badgeKey?: string };

/** Navigation grouped by the same six stages as the Overview, so the studio reads as one flow. */
export const NAV_GROUPS: { title: string; items: Item[] }[] = [
  { title: "", items: [{ href: "/", label: "Overview" }] },
  {
    title: "Find",
    items: [
      { href: "/news", label: "Daily news", badgeKey: "news" },
      { href: "/editorial", label: "Editorial" },
      { href: "/competitors", label: "Competitors" },
    ],
  },
  {
    title: "Create",
    items: [
      { href: "/content", label: "Content approval", badgeKey: "content" },
      { href: "/design", label: "Design approval", badgeKey: "design" },
      { href: "/website", label: "Website", badgeKey: "website" },
      { href: "/brand", label: "Brand library" },
    ],
  },
  {
    title: "Publish",
    items: [
      { href: "/planner", label: "Planner" },
      { href: "/publishing", label: "Publishing", badgeKey: "publishing" },
    ],
  },
  { title: "Community", items: [{ href: "/inbox", label: "Community inbox", badgeKey: "inbox" }] },
  {
    title: "Learn",
    items: [
      { href: "/analytics", label: "Analytics" },
      { href: "/intelligence", label: "Brand intelligence" },
      { href: "/archive", label: "Archive" },
    ],
  },
  {
    title: "Set up",
    items: [
      { href: "/integrations", label: "Integrations" },
      { href: "/settings", label: "Settings and automation" },
    ],
  },
];
export const NAV: Item[] = NAV_GROUPS.flatMap((g) => g.items);

export function Nav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      <button className="btn btn-sm lg:hidden" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="sbf-nav">
        {open ? "Close menu" : "Menu"}
      </button>
      <nav id="sbf-nav" className={`${open ? "block" : "hidden"} lg:block`} aria-label="Main">
        <div className="mt-4 space-y-4 lg:mt-0">
          {NAV_GROUPS.map((g) => (
            <div key={g.title || "home"}>
              {g.title && <p className="mb-1 px-4 font-serif text-[15px] italic text-deepred">{g.title}</p>}
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const on = active(n.href);
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className={`label relative flex min-h-10 items-center justify-between gap-2 rounded-full px-4 no-underline transition-colors ${
                          on ? "bg-shell text-deepred ring-1 ring-inset ring-[rgb(200_0_20/0.18)]" : "text-ink hover:bg-shell/70"
                        }`}
                        aria-current={on ? "page" : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? "bg-signal" : "bg-transparent"}`} />
                          {n.label}
                        </span>
                        {n.badgeKey && badges[n.badgeKey] ? (
                          <span className="min-w-6 rounded-full bg-deepred px-2 text-center text-[0.7rem] tracking-normal text-white">{badges[n.badgeKey]}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
