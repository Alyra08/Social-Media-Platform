/**
 * Ava's mark: a simple woman's portrait (long hair, shoulders) in white on a Confetti Red arch.
 * She is an AI persona, so this is an illustration, not a photo.
 */
export function AvaAvatar({ size = "md", inverted = false }: { size?: "sm" | "md" | "lg"; inverted?: boolean }) {
  const s = size === "lg" ? "h-28 w-24" : size === "md" ? "h-12 w-10" : "h-7 w-6";
  const bg = inverted ? "bg-white" : "bg-signal";
  const fg = inverted ? "var(--color-signal)" : "#FFFFFF";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-end justify-center overflow-hidden rounded-t-full ${bg} ${s}`}>
      <svg viewBox="0 0 40 48" className="h-[88%] w-[88%]">
        {/* long hair behind the head */}
        <path d="M20 9c-7.2 0-11 5.4-11 12.4 0 5.6-1.6 9.6-3.6 12.8 3.4 1.2 6.9 1.4 9.6.8L20 33l5 2c2.7.6 6.2.4 9.6-.8-2-3.2-3.6-7.2-3.6-12.8C31 14.4 27.2 9 20 9z" fill={fg} opacity="0.55" />
        {/* face */}
        <ellipse cx="20" cy="21" rx="6.6" ry="7.6" fill={fg} />
        {/* fringe sweep */}
        <path d="M13.2 19.5c1.8-5 5.2-7 9.6-6.4 2.6.4 4.4 2 5 4.8-3.6-.4-8.2.4-14.6 1.6z" fill={fg} />
        {/* neck and shoulders */}
        <path d="M16.6 28.4h6.8v3.4c5.6 1 10 4.4 11.6 9.6V48H5v-6.6c1.6-5.2 6-8.6 11.6-9.6z" fill={fg} />
      </svg>
    </span>
  );
}
