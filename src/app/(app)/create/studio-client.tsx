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
    <button className="btn btn-primary gap-2" disabled={pending} aria-live="polite">
      {pending ? "Creating…" : "Create"}
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}

/** Create mode: the big prompt box, size chips and idea starters. */
export function StudioPrompt({ demo }: { demo: boolean }) {
  const [size, setSize] = useState("ig_portrait");
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={studioCreateAction} className="mx-auto w-full max-w-3xl">
      <div className="rounded-[26px] bg-shell p-2 ring-1 ring-inset ring-[rgb(200_0_20/0.12)] focus-within:ring-2 focus-within:ring-ink">
        <label htmlFor="prompt" className="sr-only">
          Describe the post you want
        </label>
        <textarea
          ref={ref}
          id="prompt"
          name="prompt"
          required
          rows={4}
          maxLength={1200}
          placeholder="Describe the post you want. What it says, how it should feel, colours or motifs…"
          className="w-full resize-none rounded-[20px] bg-white/60 px-5 py-4 text-[17px] leading-relaxed text-ink outline-none placeholder:text-charcoal"
        />
        <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-2">
          <input type="hidden" name="format" value={size} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Size">
            {SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={size === s.key}
                onClick={() => setSize(s.key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${size === s.key ? "bg-ink text-white" : "bg-blush text-ink hover:bg-rosemist"}`}
              >
                {s.label} <span className="font-normal opacity-80">{s.ratio}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Generate />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {IDEAS.map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (ref.current) {
                ref.current.value = i;
                ref.current.focus();
              }
            }}
            className="rounded-full bg-shell/80 px-3.5 py-1.5 text-[13px] text-ink ring-1 ring-inset ring-[rgb(200_0_20/0.12)] hover:bg-shell"
          >
            {i}
          </button>
        ))}
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
      <div className="rounded-[26px] bg-shell p-2 ring-1 ring-inset ring-[rgb(200_0_20/0.12)] focus-within:ring-2 focus-within:ring-ink">
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
        <div className="mt-4 rounded-[22px] bg-shell p-5 ring-1 ring-inset ring-[rgb(200_0_20/0.12)]" aria-live="polite">
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
