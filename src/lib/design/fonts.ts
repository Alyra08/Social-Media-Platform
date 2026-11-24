/**
 * Fonts offered in the post designer. "brand" entries are the brand brief's fonts (the defaults).
 * The others are familiar standard fonts: open-licence Google Fonts (files in ./fonts for PNG export)
 * and common system fonts. Pure module: used by the renderer and the editor.
 */
export type FontDef = {
  key: string;
  label: string;
  family: string; // CSS / SVG font-family stack
  group: "Brand" | "Serif" | "Sans" | "Display" | "Script";
  google?: string; // Google Fonts css2 family spec for live preview
  weight?: number; // weight to draw headlines at
  width?: number; // average character width as a share of font size (for line wrapping)
  brand?: boolean;
};

export const FONTS: FontDef[] = [
  { key: "brand-serif", label: "Silk Serif (brand)", family: "'Silk Serif', 'Cormorant Garamond', serif", group: "Brand", weight: 300, brand: true, width: 0.47 },
  { key: "brand-poster", label: "Anton (brand poster)", family: "Anton, sans-serif", group: "Brand", brand: true, width: 0.42 },
  { key: "brand-sans", label: "Nunito Sans (brand)", family: "'Nunito Sans', sans-serif", group: "Brand", brand: true, width: 0.56 },

  { key: "playfair", label: "Playfair Display", family: "'Playfair Display', Georgia, serif", group: "Serif", google: "Playfair+Display:ital,wght@0,400;1,400", weight: 400, width: 0.55 },
  { key: "dmserif", label: "DM Serif Display", family: "'DM Serif Display', Georgia, serif", group: "Serif", google: "DM+Serif+Display:ital@0;1", weight: 400, width: 0.55 },
  { key: "baskerville", label: "Libre Baskerville", family: "'Libre Baskerville', Georgia, serif", group: "Serif", google: "Libre+Baskerville:ital@0;1", weight: 400, width: 0.6 },
  { key: "georgia", label: "Georgia", family: "Georgia, serif", group: "Serif", weight: 400, width: 0.58 },
  { key: "times", label: "Times New Roman", family: "'Times New Roman', Times, serif", group: "Serif", weight: 400, width: 0.5 },

  { key: "montserrat", label: "Montserrat", family: "Montserrat, Arial, sans-serif", group: "Sans", google: "Montserrat:wght@400;700", weight: 400, width: 0.64 },
  { key: "poppins", label: "Poppins", family: "Poppins, Arial, sans-serif", group: "Sans", google: "Poppins:wght@400;600", weight: 400, width: 0.62 },
  { key: "inter", label: "Inter", family: "Inter, Arial, sans-serif", group: "Sans", google: "Inter:wght@400;700", weight: 400, width: 0.57 },
  { key: "lato", label: "Lato", family: "Lato, Arial, sans-serif", group: "Sans", google: "Lato:wght@400;700", weight: 400, width: 0.55 },
  { key: "opensans", label: "Open Sans", family: "'Open Sans', Arial, sans-serif", group: "Sans", google: "Open+Sans:wght@400;700", weight: 400, width: 0.58 },
  { key: "arial", label: "Arial", family: "Arial, Helvetica, sans-serif", group: "Sans", weight: 400, width: 0.56 },
  { key: "verdana", label: "Verdana", family: "Verdana, sans-serif", group: "Sans", weight: 400, width: 0.66 },

  { key: "bebas", label: "Bebas Neue", family: "'Bebas Neue', Impact, sans-serif", group: "Display", google: "Bebas+Neue", weight: 400, width: 0.4 },
  { key: "abril", label: "Abril Fatface", family: "'Abril Fatface', Georgia, serif", group: "Display", google: "Abril+Fatface", weight: 400, width: 0.6 },
  { key: "fraunces", label: "Fraunces (retro serif)", family: "Fraunces, Georgia, serif", group: "Display", google: "Fraunces:ital,wght@0,600;1,600", weight: 600, width: 0.6 },

  { key: "pacifico", label: "Pacifico", family: "Pacifico, cursive", group: "Script", google: "Pacifico", weight: 400, width: 0.62 },
  { key: "dancing", label: "Dancing Script", family: "'Dancing Script', cursive", group: "Script", google: "Dancing+Script:wght@400;700", weight: 400, width: 0.48 },
  { key: "greatvibes", label: "Great Vibes", family: "'Great Vibes', cursive", group: "Script", google: "Great+Vibes", weight: 400, width: 0.45 },
];

export const fontByKey = (k: string | undefined, fallback: string) => FONTS.find((f) => f.key === k) ?? FONTS.find((f) => f.key === fallback)!;
export const isFontKey = (k: unknown): k is string => typeof k === "string" && FONTS.some((f) => f.key === k);
