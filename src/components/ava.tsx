/** Ava's mark: a Signal Red arch with a serif "A" (no photo; she is an AI persona). */
export function AvaAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "h-28 w-24 text-6xl" : size === "md" ? "h-12 w-10 text-2xl" : "h-7 w-6 text-[15px]";
  return (
    <span aria-hidden className={`inline-flex shrink-0 items-end justify-center rounded-t-full bg-signal pb-[0.12em] font-serif text-white ${s}`}>
      A
    </span>
  );
}
