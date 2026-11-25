import Link from "next/link";
import type { ReactNode } from "react";

/* Visual building blocks for the Overview: line icons, round shortcuts and thumbnail tiles.
   Brand rules kept: one bright per thumbnail (plus the signature stripe), white text on brights
   only when large, nothing written on Rose, no gradients, no shadows. */

const PATHS: Record<string, ReactNode> = {
  search: (<><circle cx="11" cy="11" r="7" /><path d="M16.5 16.5 21 21" /></>),
  news: (<><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9h3v8a2 2 0 0 1-2 2M7 9h6M7 13h6M7 17h4" /></>),
  brief: (<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>),
  eye: (<><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.5 2.5L16 9.5" /></>),
  palette: (<><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.5 0-.9-.7-1.2-.7-2 0-.8.6-1.5 1.5-1.5H17a4 4 0 0 0 4-4c0-5-4-9-9-9z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7" r="1" /></>),
  globe: (<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z" /></>),
  book: (<><path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM19 19v2H6" /></>),
  calendar: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  event: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /><circle cx="12" cy="15.5" r="1.6" fill="currentColor" /></>),
  send: (<><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4z" /></>),
  plug: (<><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4" /></>),
  chat: (<><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" /></>),
  mail: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>),
  chart: (<><path d="M4 20V10M10 20V4M16 20v-7M3 20h18" /></>),
  spark: (<><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></>),
  archive: (<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></>),
  key: (<><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M15 8l2 2" /></>),
  sliders: (<><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>),
  bell: (<><path d="M6 16v-5a6 6 0 1 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>),
  home: (<><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5M10 20v-5h4v5" /></>),
  logout: (<><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
};

export function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {PATHS[name] ?? PATHS.spark}
    </svg>
  );
}


/**
 * Round quick action: a soft Blush circle with a Deep Red icon that fills Signal Red on hover.
 * Tints at rest keep the row calm; colour arrives on intent.
 */
export function ShortcutFace({ icon, label }: { i?: number; icon: string; label: string }) {
  return (
    <>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blush text-deepred ring-1 ring-inset ring-[rgb(200_0_20/0.10)] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:bg-signal group-hover:text-white group-hover:ring-signal sm:h-16 sm:w-16">
        <Icon name={icon} className="h-6 w-6 sm:h-7 sm:w-7" />
      </span>
      <span className="text-center text-[12.5px] font-bold leading-tight text-ink sm:text-[13px]">{label}</span>
    </>
  );
}

/*
 * Thumbnails. Balance rule: the soft tints carry the page; the first tile in each section is the
 * one bright "feature" (Signal Red). Brights elsewhere appear only as small motifs.
 * Numbers: white on Signal Red (large type, 4:1), Deep Red on tints (4.9:1 or better).
 */
const FEATURE = { bg: "bg-signal", num: "text-white", motif: "arch", ring: "" };
const TINTS = [
  { bg: "bg-blush", num: "text-deepred", motif: "hearts", ring: "ring-1 ring-inset ring-[rgb(200_0_20/0.06)]" },
  { bg: "bg-peachcream", num: "text-deepred", motif: "rosearch", ring: "ring-1 ring-inset ring-[rgb(251_101_38/0.12)]" },
  { bg: "bg-candy", num: "text-deepred", motif: "flower", ring: "ring-1 ring-inset ring-[rgb(255_0_108/0.08)]" },
  { bg: "bg-rosemist", num: "text-deepred", motif: "stripe", ring: "ring-1 ring-inset ring-[rgb(200_0_20/0.06)]" },
] as const;

function Motif({ kind }: { kind: string }) {
  switch (kind) {
    case "arch":
      return (
        <>
          <span aria-hidden className="absolute -bottom-8 right-5 h-28 w-24 rounded-t-full bg-shell opacity-20 sm:h-32 sm:w-28" />
          <span aria-hidden className="absolute -bottom-10 right-14 h-20 w-16 rounded-t-full bg-shell opacity-10 sm:h-24 sm:w-20" />
        </>
      );
    case "rosearch":
      return <span aria-hidden className="absolute -bottom-6 right-5 h-24 w-20 rounded-t-full bg-rose opacity-70 sm:h-28 sm:w-24" />;
    case "flower":
      return (
        <svg aria-hidden viewBox="0 0 100 100" className="absolute -bottom-6 -right-4 h-24 w-24 opacity-90 sm:h-28 sm:w-28">
          {[0, 60, 120, 180, 240, 300].map((r) => (
            <ellipse key={r} cx="50" cy="26" rx="14" ry="24" fill="var(--color-hot)" transform={`rotate(${r} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="13" fill="var(--color-peach)" />
        </svg>
      );
    case "hearts":
      return (
        <svg aria-hidden viewBox="0 0 100 60" className="absolute bottom-2 right-2 h-14 w-24 sm:h-16 sm:w-28">
          {[
            [70, 18, 1],
            [44, 38, 0.7],
            [84, 44, 0.5],
          ].map(([x, y, s], k) => (
            <path key={k} transform={`translate(${x} ${y}) scale(${s})`} d="M0 6C-8-6-22 4 0 20 22 4 8-6 0 6z" fill="var(--color-signal)" />
          ))}
        </svg>
      );
    case "stripe":
      return (
        <span aria-hidden className="absolute inset-x-0 bottom-0 flex h-2">
          <span className="flex-1 bg-signal" />
          <span className="flex-1 bg-hot" />
          <span className="flex-1 bg-tangerine" />
          <span className="flex-1 bg-shell" />
        </span>
      );
    default:
      return null;
  }
}

export type TileProps = { i: number; href: string; icon: string; title: string; blurb: string; value: number | string; unit: string; pill?: { label: string; cls: string } };

/** Picture-style tile: thumbnail (colour field, motif, icon, big number), then the name underneath. i = position within its section. */
export function Tile({ i, href, icon, title, blurb, value, unit, pill }: TileProps) {
  const t = i === 0 ? FEATURE : TINTS[(i - 1) % TINTS.length];
  return (
    <Link href={href} title={blurb} className="group flex flex-col gap-3 text-charcoal no-underline">
      <div className={`relative aspect-[16/11] overflow-hidden rounded-[20px] ${t.bg} ${t.ring} p-3.5 transition-transform duration-300 group-hover:-translate-y-1 sm:p-4`}>
        <Motif kind={t.motif} />
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-shell text-deepred">
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        {pill && <span className={`${pill.cls} absolute right-3 top-3 text-[0.68rem]`}>{pill.label}</span>}
        <span className={`absolute bottom-3 left-3.5 font-serif text-[2.6rem] leading-none sm:bottom-4 sm:left-4 sm:text-6xl ${t.num}`} style={{ fontWeight: 500 }}>
          {value}
        </span>
      </div>
      <div className="px-0.5">
        <p className="font-serif text-[1.35rem] font-normal leading-tight text-deepred decoration-1 underline-offset-4 group-hover:underline">{title}</p>
        <p className="mt-0.5 text-[13px] font-bold leading-snug text-ink">{unit}</p>
        <p className="mt-1 hidden text-[13.5px] leading-snug md:block">{blurb}</p>
      </div>
    </Link>
  );
}

/*
 * Quick-action tiles as tinted colour blocks. The first tile is the one Signal Red feature
 * (white text set large and bold, per the brief); the rest rotate through soft tints.
 * A large faint icon sits in the corner; the name and hint sit at the bottom.
 */
const ACTION_TINTS = ["bg-blush", "bg-peachcream", "bg-candy", "bg-peachcream", "bg-blush", "bg-blush", "bg-candy", "bg-peachcream"];
export function actionTileCls(i: number) {
  const bg = i === 0 ? "bg-signal" : ACTION_TINTS[(i - 1) % ACTION_TINTS.length];
  return `group relative flex h-full min-h-[104px] w-full flex-col justify-end overflow-hidden rounded-[18px] p-3.5 text-left no-underline transition-transform duration-200 hover:-translate-y-0.5 sm:min-h-[120px] sm:p-4 ${bg}`;
}
export function ActionTileFace({ icon, label, hint, feature = false }: { icon: string; label: string; hint: string; feature?: boolean }) {
  return (
    <>
      <span aria-hidden className={`absolute -right-3 -top-3 transition-transform duration-300 group-hover:scale-110 ${feature ? "text-white/25" : "text-deepred/15"}`}>
        <Icon name={icon} className="h-20 w-20 sm:h-24 sm:w-24" />
      </span>
      <span className="relative min-w-0">
        {feature ? (
          <span className="block text-[19px] font-extrabold leading-tight text-white">{label}</span>
        ) : (
          <>
            <span className="block text-[14px] font-bold leading-tight text-ink">{label}</span>
            <span className="mt-0.5 block text-[12px] leading-tight text-charcoal">{hint}</span>
          </>
        )}
      </span>
    </>
  );
}
