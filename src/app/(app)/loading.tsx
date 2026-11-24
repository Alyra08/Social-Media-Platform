/** Shown while a studio page loads: soft brand-tinted placeholders in the shape of a page. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-8" role="status" aria-label="Loading">
      <div className="space-y-3 border-b border-rosemist pb-6">
        <div className="h-3 w-32 rounded-full bg-rosemist" />
        <div className="h-10 w-2/3 max-w-xl rounded-full bg-blush" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-3">
            <div className="aspect-[16/11] rounded-[20px] bg-blush" />
            <div className="h-4 w-3/4 rounded-full bg-rosemist" />
            <div className="h-3 w-1/2 rounded-full bg-blush" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
