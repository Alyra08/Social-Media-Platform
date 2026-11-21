"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/site/articles", label: "Stories" },
  { href: "/site/events", label: "Events" },
  { href: "/site/newsletter", label: "Sunday note" },
];

export function SiteNav() {
  const path = usePathname();
  return (
    <nav aria-label="Website">
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="site-link label text-[0.8rem]" aria-current={path.startsWith(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
