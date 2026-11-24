import Link from "next/link";
import { subscribeAction } from "@/app/site/actions";
import { CATEGORY_LABELS } from "@/lib/brand/brief";
import { readingMinutes } from "@/lib/website";

const SIGNUP_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  pending: { ok: true, text: "Nearly there. Check your inbox and tap the link to confirm." },
  resent: { ok: true, text: "We've sent the confirmation link again. Check your inbox (and the promotions folder)." },
  already: { ok: true, text: "You're already on the list. See you on Sunday." },
  invalid: { ok: false, text: "That email address doesn't look right. Try again?" },
  slow: { ok: false, text: "Lots of sign-ups from here just now. Try again in a few minutes." },
};

export function SignupForm({ status, back, source = "website", compact = false }: { status?: string; back: string; source?: string; compact?: boolean }) {
  const msg = status ? SIGNUP_MESSAGES[status] : undefined;
  return (
    <div id="signup">
      {msg ? (
        <p role="status" className={`rounded-[18px] px-4 py-3 text-[15px] ${msg.ok ? "bg-peach text-ink" : "bg-deepred text-white"}`}>
          {msg.text}
        </p>
      ) : null}
      {!msg?.ok && (
        <form action={subscribeAction} className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-[1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]"}`}>
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="source" value={source} />
          <label className="hp" aria-hidden>
            Leave this empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {!compact && (
            <>
              <label className="sr-only" htmlFor={`name-${source}`}>
                First name (optional)
              </label>
              <input id={`name-${source}`} name="name" className="input" placeholder="First name (optional)" autoComplete="given-name" />
            </>
          )}
          <label className="sr-only" htmlFor={`email-${source}`}>
            Email
          </label>
          <input id={`email-${source}`} name="email" type="email" required className="input" placeholder="Your email" autoComplete="email" />
          <button className="btn btn-primary">Get the Sunday note</button>
        </form>
      )}
    </div>
  );
}

type CardArticle = { slug: string | null; title: string; excerpt: string | null; category: string | null; body: string; publishedAt: Date | null };

export function ArticleCard({ a, large = false }: { a: CardArticle; large?: boolean }) {
  return (
    <article className={`card flex h-full flex-col ${large ? "md:p-8" : ""}`}>
      {a.category && <p className="label mb-2 text-deepred">{CATEGORY_LABELS[a.category] ?? a.category}</p>}
      <h3 className={`font-serif font-light text-signal ${large ? "text-4xl" : "text-2xl"}`}>
        <Link href={`/site/articles/${a.slug}`} className="text-deepred no-underline hover:underline">
          {a.title}
        </Link>
      </h3>
      {a.excerpt && <p className="mt-3 flex-1">{a.excerpt}</p>}
      <p className="mt-4 text-sm">
        {a.publishedAt ? a.publishedAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : ""} · {readingMinutes(a.body)} min read
      </p>
    </article>
  );
}

export const eventWhen = (d: Date) =>
  d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
