"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/app/(app)/overview-ui";
import { AvaAvatar } from "./ava";

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
      { href: "/create", label: "Design studio" },
      { href: "/ava", label: "Ava, captions" },
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

const RAIL_ICON: Record<string, string> = {
  "/": "home",
  "/news": "news",
  "/editorial": "brief",
  "/competitors": "eye",
  "/create": "plus",
  "/content": "check",
  "/design": "palette",
  "/website": "globe",
  "/brand": "book",
  "/planner": "calendar",
  "/publishing": "send",
  "/inbox": "chat",
  "/analytics": "chart",
  "/intelligence": "spark",
  "/archive": "archive",
  "/integrations": "plug",
  "/settings": "sliders",
};

export function Nav({ badges, footer, railFooter }: { badges: Record<string, number>; footer?: React.ReactNode; railFooter?: React.ReactNode }) {
  const path = usePathname();
  const [, setOpen] = useState(false); // kept so closing still works if a menu returns
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <>
      {/* Narrow screens: a slim icon rail beside the page (names show on hover and to screen readers). */}
      <nav aria-label="Main" className="md:hidden">
        <ul className="flex flex-col items-center gap-1">
          {NAV_GROUPS.map((g, gi) => (
            <li key={g.title || "home"} className={`flex w-full flex-col items-center gap-1 ${gi > 0 ? "mt-1 border-t border-rosemist pt-2" : ""}`}>
              {g.items.map((n) => {
                const on = active(n.href);
                const count = n.badgeKey ? badges[n.badgeKey] : 0;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={n.label}
                    aria-label={count ? `${n.label}, ${count}` : n.label}
                    aria-current={on ? "page" : undefined}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full no-underline transition-colors ${on ? "bg-signal text-white" : "text-deepred hover:bg-shell"}`}
                  >
                    {n.href === "/ava" ? (
                      <AvaAvatar size="sm" inverted={on} />
                    ) : (
                      <Icon name={RAIL_ICON[n.href] ?? "spark"} className="h-5 w-5" />
                    )}
                    {count ? <span className="absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-signal text-[10px] font-bold text-white ring-2 ring-blush">{count}</span> : null}
                  </Link>
                );
              })}
            </li>
          ))}
        </ul>
        {railFooter}
      </nav>
      {/* Tablet and up: the full sidebar. */}
      <nav id="sbf-nav" className="hidden md:block" aria-label="Main">
        <div className="mt-4 space-y-4 md:mt-0">
          {NAV_GROUPS.map((g) => (
            <div key={g.title || "home"}>
              {g.title && <p className="mb-1.5 px-4 font-serif text-[1.3rem] font-semibold italic leading-none text-deepred">{g.title}</p>}
              <ul className="space-y-0.5">
                {g.items.map((n) => {
                  const on = active(n.href);
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={() => setOpen(false)}
                        className={`relative flex min-h-10 items-center justify-between gap-2 rounded-full px-4 text-[14.5px] font-medium no-underline transition-colors ${
                          on ? "text-deepred" : "text-ink hover:bg-shell/70"
                        }`}
                        aria-current={on ? "page" : undefined}
                      >
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${on ? "bg-signal" : "bg-transparent"}`} />
                          {n.label}
                        </span>
                        {n.badgeKey && badges[n.badgeKey] ? (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-signal text-[12px] font-bold tracking-normal text-white">{badges[n.badgeKey]}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        {footer}
      </nav>
    </>
  );
}
