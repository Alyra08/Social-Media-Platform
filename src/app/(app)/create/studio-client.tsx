"use client";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { reviewCopyAction, studioCreateAction, type ReviewState } from "./actions";

const SIZES: { key: string; label: string; ratio: string }[] = [
  { key: "ig_portrait", label: "Instagram post", ratio: "4:5" },
  { key: "ig_square", label: "Square", ratio: "1:1" },
  { key: "story", label: "Story / Reel", ratio: "9:16" },
  { key: "carousel", label: "Carousel", ratio: "4:5" },
  { key: "linkedin", label: "LinkedIn", ratio: "1.91:1" },
  { key: "pinterest", label: "Pinterest", ratio: "2:3" },
  { key: "facebook", label: "Facebook", ratio: "1.91:1" },
];

const IDEAS = [
  "A soft, feminine quote post: choose yourself every single time, with hearts",
  "Poster for the next circle: we saved you a seat, warm and inviting",
  "Bold red stripe post about asking for the raise you're owed",
  "Retro 70s flower post celebrating friendship after 40",
];

function Generate() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal text-white transition-colors hover:bg-deepred disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      disabled={pending}
      aria-label={pending ? "Creating your design" : "Create design"}
    >
      {pending ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />
        </svg>
      )}
    </button>
  );
}

const chipCls =
  "inline-flex items-center gap-1.5 rounded-full border border-[rgb(42_26_29/0.16)] bg-white px-3.5 py-1.5 text-[13.5px] font-medium text-ink transition-colors hover:border-ink aria-expanded:border-ink aria-expanded:bg-shell";

function ChipIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-charcoal" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Create mode: a single prompt box (sparkle, prompt, then Size and Ideas chips and a round send button). */
export function StudioPrompt({ demo }: { demo: boolean }) {
  const [size, setSize] = useState("ig_portrait");
  const [open, setOpen] = useState<"size" | "ideas" | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const current = SIZES.find((s) => s.key === size) ?? SIZES[0];
  const toggle = (k: "size" | "ideas") => setOpen((o) => (o === k ? null : k));
  return (
    <form action={studioCreateAction} className="mx-auto w-full max-w-3xl">
      <div className="rounded-[24px] border border-[rgb(42_26_29/0.12)] bg-white p-3 shadow-[0_10px_30px_-18px_rgb(42_26_29/0.35)] focus-within:border-ink">
        <div className="flex gap-3 px-2 pt-2">
          <span className="mt-[3px] text-[18px] leading-none text-signal" aria-hidden>
            ✦
          </span>
          <label htmlFor="prompt" className="sr-only">
            Describe the post you want
          </label>
          <textarea
            ref={ref}
            id="prompt"
            name="prompt"
            required
            rows={3}
            maxLength={1200}
            placeholder="Describe the post you want. What it says, how it should feel, colours or motifs…"
            className="min-h-[84px] w-full resize-none bg-transparent text-[16.5px] leading-normal text-ink outline-none placeholder:text-charcoal/80"
          />
        </div>
        <input type="hidden" name="format" value={size} />
        <div className="mt-2 flex items-center gap-2">
          <div className="flex min-w-0 flex-wrap gap-2">
            <button type="button" className={chipCls} aria-expanded={open === "size"} aria-controls="studio-size" onClick={() => toggle("size")}>
              <ChipIcon d="M4 6h16v12H4zM4 10h16" />
              {current.label} <span className="text-charcoal">{current.ratio}</span>
            </button>
            <button type="button" className={chipCls} aria-expanded={open === "ideas"} aria-controls="studio-ideas" onClick={() => toggle("ideas")}>
              <ChipIcon d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
              Ideas
            </button>
          </div>
          <div className="ml-auto">
            <Generate />
          </div>
        </div>
        {open === "size" && (
          <div id="studio-size" role="radiogroup" aria-label="Size" className="mt-3 flex flex-wrap gap-1.5 border-t border-[rgb(42_26_29/0.08)] px-1 pt-3">
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={size === s.key}
                onClick={() => {
                  setSize(s.key);
                  setOpen(null);
                }}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${size === s.key ? "bg-deepred text-white" : "bg-shell text-ink hover:bg-rosemist"}`}
              >
                {s.label} <span className="font-normal opacity-80">{s.ratio}</span>
              </button>
            ))}
          </div>
        )}
        {open === "ideas" && (
          <ul id="studio-ideas" className="mt-3 grid gap-1 border-t border-[rgb(42_26_29/0.08)] pt-2">
            {IDEAS.map((i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => {
                    if (ref.current) {
                      ref.current.value = i;
                      ref.current.focus();
                    }
                    setOpen(null);
                  }}
                  className="w-full rounded-xl px-3 py-2 text-left text-[14px] text-ink hover:bg-shell"
                >
                  {i}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {demo && <p className="mt-4 text-center text-[13px] text-ink">Demo mode: the studio builds the design from your words and you write the caption. Add the AI key for full drafts.</p>}
    </form>
  );
}

/** Review mode: brand-check any copy. */
export function ReviewForm() {
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(reviewCopyAction, null);
  return (
    <form action={formAction} className="mx-auto w-full max-w-3xl">
      <div className="rounded-[26px] bg-shell p-2 ring-1 ring-inset ring-[rgb(158_9_98/0.12)] focus-within:ring-2 focus-within:ring-ink">
        <label htmlFor="copy" className="sr-only">
          Copy to check
        </label>
        <textarea id="copy" name="copy" rows={6} defaultValue={state?.text ?? ""} placeholder="Paste a caption, headline or email to check it against the brand brief…" className="w-full resize-none rounded-[20px] bg-white/60 px-5 py-4 text-[17px] leading-relaxed text-ink outline-none placeholder:text-charcoal" />
        <div className="flex justify-end px-2 pb-1 pt-2">
          <button className="btn btn-primary" disabled={pending}>
            {pending ? "Checking…" : "Check it"}
          </button>
        </div>
      </div>
      {state && (
        <div className="mt-4 rounded-[22px] bg-shell p-5 ring-1 ring-inset ring-[rgb(158_9_98/0.12)]" aria-live="polite">
          {state.issues.length === 0 ? (
            <p className="font-bold text-ink">✓ On brand. Nothing to fix.</p>
          ) : (
            <ul className="space-y-2 text-[15px]">
              {state.issues.map((i, k) => (
                <li key={k} className="flex gap-3">
                  <span className={`${i.severity === "block" ? "pill-red" : "pill-ok"} pill shrink-0 text-[0.68rem]`}>{i.severity === "block" ? "Must fix" : "Consider"}</span>
                  <span>{i.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
