import Link from "next/link";
import type { ReactNode } from "react";

export function Stripe({ className = "" }: { className?: string }) {
  return (
    <div className={`stripe ${className}`} aria-hidden>
      <span className="bg-signal" />
      <span className="bg-hot" />
      <span className="bg-tangerine" />
      <span className="bg-shell" />
    </div>
  );
}

/**
 * Logo slot, left blank on purpose until the real logo file is supplied.
 * Keeps the brand name for screen readers so links stay labelled.
 */
export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`block ${small ? "h-6" : "h-2"}`}>
      <span className="sr-only">Simply Being Female</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, emphasis, children }: { eyebrow?: string; title: string; emphasis?: string; children?: ReactNode }) {
  const parts = emphasis && title.includes(emphasis) ? title.split(emphasis) : null;
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="label mb-2 text-deepred">{eyebrow}</p>}
        <h1>
          {parts ? (
            <>
              {parts[0]}
              <em>{emphasis}</em>
              {parts[1]}
            </>
          ) : (
            title
          )}
        </h1>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Awaiting news approval", cls: "pill" },
  approved: { label: "Editorial approved", cls: "pill-ok pill" },
  denied: { label: "Denied", cls: "pill" },
  saved: { label: "Saved for later", cls: "pill" },
  more_research: { label: "Researching", cls: "pill" },
  awaiting_content: { label: "Awaiting content approval", cls: "pill-red pill" },
  revision_requested: { label: "Revision requested", cls: "pill" },
  awaiting_design: { label: "Awaiting design approval", cls: "pill-red pill" },
  approved_for_publishing: { label: "Approved for publishing", cls: "pill-ok pill" },
  scheduled: { label: "Scheduled", cls: "pill-ink pill" },
  publishing: { label: "Publishing", cls: "pill-ink pill" },
  manual_required: { label: "Manual publish needed", cls: "pill-red pill" },
  published: { label: "✓ Published", cls: "pill-ok pill" },
  failed: { label: "Publishing failed", cls: "pill-red pill" },
  archived: { label: "Archived", cls: "pill" },
  proposed: { label: "Proposed", cls: "pill" },
  changes_requested: { label: "Changes requested", cls: "pill" },
  superseded: { label: "Superseded", cls: "pill" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status.replace(/_/g, " "), cls: "pill" };
  return <span className={s.cls}>{s.label}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-serif text-2xl font-light text-signal">{title}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function DemoBadge() {
  return <span className="pill" title="Sample content from demo mode. Not real research.">Sample</span>;
}

export function Stat({ label, value, href, note }: { label: string; value: ReactNode; href?: string; note?: string }) {
  const body = (
    <div className="card h-full">
      <p className="label text-deepred">{label}</p>
      <p className="kpi mt-2">{value}</p>
      {note && <p className="mt-1 text-sm">{note}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  threads: "Threads",
  x: "X",
  bluesky: "Bluesky",
  youtube: "YouTube",
  newsletter: "Sunday note",
  community: "Community",
  sandbox: "Sandbox",
};
