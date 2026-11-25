import Link from "next/link";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { FIXED_TAGLINE } from "@/lib/brand/tokens";
import { Stripe } from "./ui";

/**
 * Public website footer in the confetti palette: Deep Ink field, big serif call to action with a Gold italic,
 * Confetti Red primary button, then brand, link columns and socials. Contact and social details come from
 * Settings → Website footer; anything left empty is not shown (nothing is invented).
 */

const SOCIALS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: "instagram", label: "Instagram", icon: (<><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.6" /><circle cx="17" cy="7" r="0.9" fill="currentColor" stroke="none" /></>) },
  { key: "tiktok", label: "TikTok", icon: (<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.6 2.6 2.4 4.2 5 4.5" />) },
  { key: "facebook", label: "Facebook", icon: (<path d="M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2.5H8V14h2.5v6H14v-6h2.5l.5-3.5h-3V8.6c0-.3.3-.6.6-.6z" />) },
  { key: "linkedin", label: "LinkedIn", icon: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 10.5V16M8.5 8v.01M12 16v-5.5M12 13c0-1.6 1-2.5 2.2-2.5 1.3 0 1.8.9 1.8 2.5V16" /></>) },
  { key: "youtube", label: "YouTube", icon: (<><rect x="3.5" y="6" width="17" height="12" rx="4" /><path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" /></>) },
  { key: "pinterest", label: "Pinterest", icon: (<><circle cx="12" cy="12" r="8.5" /><path d="M11 9.5c2.5-1 5 .3 4.6 3-.3 2-2.4 3-3.9 2M12 11l-2 9" /></>) },
  { key: "threads", label: "Threads", icon: (<path d="M16.5 11.3c-.4-2.3-2-3.5-4.3-3.5-2.6 0-4.4 1.8-4.4 4.7 0 3 1.9 4.8 4.6 4.8 2.4 0 4.1-1.4 4.1-3.4 0-2.2-2-3.1-4.4-2.8-1.6.2-2.5 1-2.4 2 .1 1 1.1 1.5 2.3 1.4 2-.2 2.8-2 2.6-4.5" />) },
];

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const linkCls = "text-[14.5px] text-white/80 no-underline transition-colors hover:text-white hover:underline hover:underline-offset-4";

export function SiteFooter({ footer }: { footer: Record<string, string> }) {
  const headline = footer.headline || "Come as you are. Leave louder.";
  const emphasis = footer.emphasis && headline.includes(footer.emphasis) ? footer.emphasis : "";
  const [before, after] = emphasis ? headline.split(emphasis) : [headline, ""];
  const socials = SOCIALS.filter((s) => footer[s.key]);
  const categories = Object.entries(CATEGORY_LABELS).slice(0, 4);

  return (
    <footer className="mt-20 bg-ink text-white">
      <Stripe />
      {/* Call to action */}
      <div className="mx-auto max-w-4xl px-4 pb-14 pt-16 text-center md:px-6 md:pt-20">
        <h2 className="text-[2.3rem] font-medium leading-[1.05] text-white sm:text-5xl">
          {before}
          {emphasis && <em className="text-gold">{emphasis}</em>}
          {after}
        </h2>
        {footer.subline && <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/80">{footer.subline}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/site/newsletter" className="btn btn-primary">
            Get the Sunday note
          </Link>
          <Link href="/site/events" className="btn border-white/70 text-white hover:border-white hover:bg-white hover:text-ink">
            See the next circle
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="h-px bg-white/15" aria-hidden />
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand and contact */}
          <div>
            <p className="font-serif text-[1.9rem] font-medium leading-none text-white">Simply Being Female</p>
            <p className="mt-2 font-serif text-[1.1rem] italic text-gold">{FIXED_TAGLINE}</p>
            <ul className="mt-5 space-y-2.5">
              {footer.location && (
                <li className="flex items-start gap-2.5 text-[14.5px] text-white/80">
                  <Svg>
                    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
                    <circle cx="12" cy="10" r="2.3" />
                  </Svg>
                  {footer.location}
                </li>
              )}
              {footer.email && (
                <li>
                  <a href={`mailto:${footer.email}`} className={`${linkCls} flex items-center gap-2.5`}>
                    <Svg>
                      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                      <path d="m4 7 8 6 8-6" />
                    </Svg>
                    {footer.email}
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Read */}
          <nav aria-label="Read">
            <p className="mb-4 text-[15px] font-bold text-white">Read</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/site/articles" className={linkCls}>
                  All stories
                </Link>
              </li>
              {categories.map(([k, v]) => (
                <li key={k}>
                  <Link href={`/site/articles?category=${k}`} className={linkCls}>
                    {v.split(",")[0].split(" and ")[0]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Join in */}
          <nav aria-label="Join in">
            <p className="mb-4 text-[15px] font-bold text-white">Join in</p>
            <ul className="space-y-2.5">
              <li>
                <Link href="/site/events" className={linkCls}>
                  Circles and events
                </Link>
              </li>
              <li>
                <Link href="/site/newsletter" className={linkCls}>
                  The Sunday note
                </Link>
              </li>
              <li>
                <Link href="/site" className={linkCls}>
                  Home
                </Link>
              </li>
            </ul>
          </nav>

          {/* Socials */}
          {socials.length > 0 && (
            <nav aria-label="Socials">
              <p className="mb-4 text-[15px] font-bold text-white">Socials</p>
              <ul className="space-y-2.5">
                {socials.map((s) => (
                  <li key={s.key}>
                    <a href={footer[s.key]} target="_blank" rel="noopener noreferrer" className={`${linkCls} flex items-center gap-2.5`}>
                      <Svg>{s.icon}</Svg>
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 py-6 text-[13px] text-white/70">
          <p>© {new Date().getFullYear()} Simply Being Female</p>
          <p>{footer.subline ? "Made with care in Australia." : FIXED_TAGLINE}</p>
        </div>
      </div>
    </footer>
  );
}
