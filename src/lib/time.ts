/** Request-time clock helpers (kept out of components so render stays pure). */
export const now = () => new Date();
export const nowMs = () => Date.now();
export const daysSince = (d: Date | null | undefined) => (d ? Math.round((Date.now() - d.getTime()) / 86400_000) : 0);
