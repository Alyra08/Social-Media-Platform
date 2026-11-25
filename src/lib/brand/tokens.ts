/** SBF colour system — from the brand brief. Never change without the owner's approval. */
export const colours = {
  // Brights (~30%)
  signal: "#D90F2A", // Confetti Red: primary. White text.
  hot: "#D9087F", // Magenta: second bright. White text.
  rose: "#D75DAB", // Rose — decoration only. NEVER text on it.
  tangerine: "#F08A1C", // Marigold: warm accent. Deep Ink text only (white is 2.5:1).
  // Lights (~60%)
  blush: "#F6DDF1", // main canvas
  shell: "#FCEEF8", // cards, forms, panels (instead of white)
  roseMist: "#F1D2EC",
  candy: "#F9E4F4",
  peach: "#FCE6CB",
  peachCream: "#FEF4E8",
  // Deeps (~10%)
  deepRed: "#9E0962", // buttons, links, small red text, pills, footer
  charcoal: "#4A4544", // all body text on lights
  deepInk: "#2A1A1D", // emphasis, success, focus
  white: "#FFFFFF",
} as const;

export type ColourName = keyof typeof colours;

export const brights = ["signal", "hot", "tangerine"] as const;
export const lights = ["blush", "shell", "roseMist", "candy", "peach", "peachCream"] as const;

/** Fixed lines that must never be rewritten. */
export const FIXED_TAGLINE = "Unapologetically fierce. Beautifully imperfect.";
export const FIXED_MANIFESTO = "A space for the unapologetically fierce, beautifully imperfect woman.";

export const APPROVED_LINES = [
  "Come as you are. Leave louder.",
  "I left the room first. Now I'm holding the door.",
  "We saved you a seat. It's been warm for a while.",
  "The letter you'd write if you weren't being polite.",
  "I stopped leaving honey on the table.",
];

export const APPROVED_CTAS = [
  "Get the Sunday note",
  "See the next circle",
  "Join the circle",
  "Read the full story",
];

export const WORDS_TO_USE = [
  "out loud", "room", "seat", "table", "door", "together", "honest", "owed", "no gatekeepers", "refuse", "take up space",
];

/** Relative luminance contrast (WCAG 2.x). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [a, b] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** Text-on-colour rules from the brief. Returns null when allowed, else the reason. */
export function textOnColourViolation(
  background: ColourName,
  text: ColourName,
  opts: { sizePx: number; bold?: boolean },
): string | null {
  if (background === "rose") return "Never put any text on Orchid.";
  if (background === "tangerine") {
    if (text !== "deepInk") return "Text on Marigold must be Deep Ink.";
  } else if ((brights as readonly string[]).includes(background)) {
    if (text !== "white") return "Text on Confetti Red or Magenta must be white.";
    const bigEnough = opts.sizePx >= 24 || (opts.bold && opts.sizePx >= 19);
    if (!bigEnough) return "Small text must not sit on a bright. Use a Berry pill with white text.";
  }
  const ratio = contrastRatio(colours[background], colours[text]);
  const large = opts.sizePx >= 24 || (opts.bold && opts.sizePx >= 19);
  if (ratio < (large ? 3 : 4.5)) return `Contrast ${ratio.toFixed(2)}:1 is below WCAG ${large ? "3" : "4.5"}:1.`;
  return null;
}
