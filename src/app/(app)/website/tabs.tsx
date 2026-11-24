import Link from "next/link";

const TABS = [
  { href: "/website", label: "Articles" },
  { href: "/website/newsletter", label: "Sunday note" },
  { href: "/website/events", label: "Events" },
];

export function WebsiteTabs({ current }: { current: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <nav className="segmented" aria-label="Website sections">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="seg" aria-current={current === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <a href="/site" target="_blank" rel="noopener" className="btn btn-sm ml-auto">
        View the public website ↗
      </a>
    </div>
  );
}

export function BrandIssues({ issues }: { issues: { severity: string; detail: string }[] }) {
  if (!issues.length) return <p className="pill-ok pill">Brand check passed</p>;
  return (
    <ul className="space-y-1 text-sm">
      {issues.map((i, n) => (
        <li key={n} className={i.severity === "block" ? "font-bold text-deepred" : ""}>
          {i.severity === "block" ? "✕ " : "· "}
          {i.detail}
        </li>
      ))}
    </ul>
  );
}

export const ISSUE_STATUS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved, not sent",
  sending: "Sending",
  sent: "Sent",
  sent_manually: "Sent from another tool",
};

export const EVENT_STATUS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved, not live",
  published: "Live, taking RSVPs",
  cancelled: "Cancelled",
};
