/**
 * Ava's mark: a very basic outline of a woman (head, long hair, shoulders), like a profile icon, in Confetti Red line.
 * She is an AI persona, so this is an illustration, not a photo. `inverted` draws it in white for red backgrounds.
 */
export function AvaAvatar({ size = "md", inverted = false }: { size?: "sm" | "md" | "lg"; inverted?: boolean }) {
  const s = size === "lg" ? "h-24 w-24" : size === "md" ? "h-10 w-10" : "h-6 w-6";
  const colour = inverted ? "text-white" : "text-signal";
  const stroke = size === "lg" ? 1.2 : size === "md" ? 1.6 : 1.9;
  return (
    <span aria-hidden className={`inline-flex shrink-0 ${colour} ${s}`}>
      <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {/* head */}
        <circle cx="12" cy="8.5" r="3.6" />
        {/* long hair falling to the shoulders */}
        <path d="M8.4 8.5c0 3-.6 5-1.6 6.3M15.6 8.5c0 3 .6 5 1.6 6.3" />
        {/* shoulders */}
        <path d="M4.5 21c.6-3.6 3.6-6 7.5-6s6.9 2.4 7.5 6" />
      </svg>
    </span>
  );
}
