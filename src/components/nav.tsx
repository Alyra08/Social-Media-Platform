"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export const NAV: { href: string; label: string; badgeKey?: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/news", label: "Daily news", badgeKey: "news" },
  { href: "/editorial", label: "Editorial" },
  { href: "/website", label: "Website", badgeKey: "website" },
  { href: "/content", label: "Content approval", badgeKey: "content" },
  { href: "/design", label: "Design approval", badgeKey: "design" },
  { href: "/planner", label: "Planner" },
  { href: "/publishing", label: "Publishing", badgeKey: "publishing" },
  { href: "/inbox", label: "Community inbox", badgeKey: "inbox" },
  { href: "/analytics", label: "Analytics" },
  { href: "/archive", label: "Archive" },
  { href: "/brand", label: "Brand library" },
  { href: "/intelligence", label: "Brand intelligence" },
  { href: "/competitors", label: "Competitors" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings and automation" },
];

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
        <ul className="mt-4 space-y-1 lg:mt-0">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={() => setOpen(false)}
                className={`label flex min-h-11 items-center justify-between rounded-full px-4 no-underline transition-colors ${
                  active(n.href) ? "bg-deepred text-white" : "text-ink hover:bg-rosemist"
                }`}
                aria-current={active(n.href) ? "page" : undefined}
              >
                <span>{n.label}</span>
                {n.badgeKey && badges[n.badgeKey] ? (
                  <span className={`rounded-full px-2 text-[0.7rem] ${active(n.href) ? "bg-white text-deepred" : "bg-deepred text-white"}`}>{badges[n.badgeKey]}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
