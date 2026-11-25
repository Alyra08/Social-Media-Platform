"use client";

/** Welcome search: soft pill, white icon circle on the left, Enter to search, options icon on the right (opens Quick find). */
export function HeroSearch() {
  return (
    <form action="/search" role="search" className="mt-6 flex w-full max-w-xl items-center gap-2 rounded-full bg-white/70 p-1.5 pr-2 text-left ring-1 ring-inset ring-[rgb(158_9_98/0.14)] backdrop-blur-sm focus-within:bg-white focus-within:ring-2 focus-within:ring-ink">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-ink ring-1 ring-inset ring-[rgb(158_9_98/0.1)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>
      </span>
      <label htmlFor="hero-q" className="sr-only">
        Search the studio
      </label>
      <input id="hero-q" name="q" placeholder="Search stories, posts, designs…" className="min-w-0 flex-1 bg-transparent py-2 text-[15.5px] text-ink outline-none placeholder:text-charcoal" />
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("sbf:command"))}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink hover:bg-blush"
        aria-label="Search options and shortcuts (Ctrl+K)"
        title="Search options and shortcuts (Ctrl+K)"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
          <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
          <circle cx="15" cy="7" r="2" />
          <circle cx="9" cy="17" r="2" />
        </svg>
      </button>
    </form>
  );
}
