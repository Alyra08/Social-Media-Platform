import type { DesignParams } from "@/db/schema";
import { colours } from "../brand/tokens";
import { fontByKey } from "./fonts";

/** Platform formats and their exact pixel dimensions. */
export const DESIGN_FORMATS: Record<string, { label: string; w: number; h: number }> = {
  ig_square: { label: "Instagram square", w: 1080, h: 1080 },
  ig_portrait: { label: "Instagram portrait", w: 1080, h: 1350 },
  carousel: { label: "Carousel slide", w: 1080, h: 1350 },
  story: { label: "Instagram Story", w: 1080, h: 1920 },
  reel_cover: { label: "Reel / TikTok / Shorts cover", w: 1080, h: 1920 },
  facebook: { label: "Facebook graphic", w: 1200, h: 630 },
  pinterest: { label: "Pinterest pin", w: 1000, h: 1500 },
  linkedin: { label: "LinkedIn graphic", w: 1200, h: 627 },
  x: { label: "X / Bluesky / Threads image", w: 1600, h: 900 },
  quote: { label: "Quote card", w: 1080, h: 1080 },
  infographic: { label: "Infographic / educational", w: 1080, h: 1350 },
};

export function formatsForPost(platform: string, format: string): string[] {
  if (platform === "instagram") {
    if (format === "carousel") return ["carousel"];
    if (format === "reel") return ["reel_cover"];
    if (format === "story") return ["story"];
    return ["ig_portrait", "ig_square"];
  }
  if (platform === "tiktok" || platform === "youtube") return ["reel_cover"];
  if (platform === "facebook") return ["facebook", "ig_square"];
  if (platform === "pinterest") return ["pinterest"];
  if (platform === "linkedin") return ["linkedin"];
  if (["x", "bluesky", "threads"].includes(platform)) return ["x"];
  if (platform === "community") return ["quote"];
  return ["ig_square"];
}

const BRIGHT = { signal: colours.signal, hot: colours.hot, tangerine: colours.tangerine } as const;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap using an average glyph width. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

/** Render a headline where the `emphasis` words are set in Hot Pink italic. */
function headlineTspans(line: string, emphasis: string, baseFill: string, accentFill: string) {
  if (!emphasis) return esc(line);
  const idx = line.toLowerCase().indexOf(emphasis.toLowerCase());
  if (idx < 0) {
    // emphasis may span lines: italicise any emphasis words present on this line
    const ew = new Set(emphasis.toLowerCase().split(/\s+/));
    return line
      .split(" ")
      .map((w) => (ew.has(w.toLowerCase().replace(/[.,]/g, "")) ? `<tspan font-style="italic" fill="${accentFill}">${esc(w)}</tspan>` : `<tspan fill="${baseFill}">${esc(w)}</tspan>`))
      .join(" ");
  }
  return `<tspan fill="${baseFill}">${esc(line.slice(0, idx))}</tspan><tspan font-style="italic" fill="${accentFill}">${esc(line.slice(idx, idx + emphasis.length))}</tspan><tspan fill="${baseFill}">${esc(line.slice(idx + emphasis.length))}</tspan>`;
}

function stripe(x: number, y: number, w: number, h: number) {
  const seg = w / 4;
  return [colours.signal, colours.hot, colours.tangerine, colours.shell]
    .map((c, i) => `<rect x="${x + i * seg}" y="${y}" width="${seg + 0.5}" height="${h}" fill="${c}"/>`)
    .join("");
}

function flower(cx: number, cy: number, r: number, petal: string) {
  const petals = Array.from({ length: 6 }, (_, i) => {
    const a = (i * Math.PI) / 3;
    return `<circle cx="${cx + Math.cos(a) * r * 0.62}" cy="${cy + Math.sin(a) * r * 0.62}" r="${r * 0.45}" fill="${petal}"/>`;
  }).join("");
  return `<g>${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.36}" fill="${colours.peach}"/></g>`;
}

function heart(cx: number, cy: number, s: number) {
  return `<path transform="translate(${cx - s / 2} ${cy - s / 2}) scale(${s / 24})" d="M12 21s-7.5-4.6-10-9.3C.3 8.4 2.3 4 6.4 4c2.3 0 3.9 1.3 5.6 3.4C13.7 5.3 15.3 4 17.6 4 21.7 4 23.7 8.4 22 11.7 19.5 16.4 12 21 12 21z" fill="${colours.signal}"/>`;
}

function badge(cx: number, cy: number, r: number) {
  return `<g><circle cx="${cx}" cy="${cy}" r="${r}" fill="${colours.tangerine}"/><text x="${cx}" y="${cy + r * 0.2}" text-anchor="middle" font-family="Anton, 'Nunito Sans', sans-serif" font-size="${r * 0.62}" fill="#FFFFFF" letter-spacing="2">SBF</text></g>`;
}

/** The uploaded logo (Brand Library, type "Logos"). Left blank until the real logo is uploaded; the zone stays reserved. */
function wordmark(x: number, y: number, scale: number, logoHref?: string) {
  if (logoHref) return `<image href="${esc(logoHref)}" x="${x}" y="${y - 50 * scale}" width="${260 * scale}" height="${90 * scale}" preserveAspectRatio="xMinYMid meet"/>`;
  return "";
}

export type RenderOptions = { format: string; params: DesignParams; logoHref?: string };

export function renderDesignSvg({ format, params: p, logoHref }: RenderOptions): string {
  const hf = fontByKey(p.headlineFont, "brand-serif");
  const pf = fontByKey(p.posterFont, "brand-poster");
  const bf = fontByKey(p.bodyFont, "brand-sans");
  const extraFonts = [...new Set([hf, pf, bf].map((f) => f.google).filter(Boolean))].map((g) => `&amp;family=${g}`).join("");
  const f = DESIGN_FORMATS[format] ?? DESIGN_FORMATS.ig_square;
  const { w, h } = f;
  const landscape = w > h;
  const pad = Math.round(Math.min(w, h) * 0.08);
  const lead = BRIGHT[p.lead];
  const canvas = colours[p.canvas] ?? colours.blush;
  const accent = p.lead === "hot" ? colours.signal : colours.hot;
  const density = Math.max(0.5, Math.min(1.5, p.textDensity));
  const motifs = p.motifs.slice(0, 2); // brief: two motifs per piece at most
  const parts: string[] = [];

  parts.push(`<rect width="${w}" height="${h}" fill="${canvas}"/>`);

  // Layout-specific bold block (generous space → bold block → space).
  let headSize = Math.round((landscape ? h * 0.1 : w * 0.085) * p.headlineScale);
  const archH = h / w > 1.5 ? h * 0.38 : h * 0.3;
  const headWidth = p.layout === "quote" ? w - pad * 3 : (landscape ? w * 0.55 : w) - pad * 2;
  // Never drop words: shrink the type until the whole headline fits in five lines.
  const allLines = (size: number) => wrap(p.headline, Math.max(10, Math.floor(headWidth / (size * (hf.width ?? 0.5)))));
  for (let i = 0; i < 12 && allLines(headSize).length > 5; i++) headSize = Math.round(headSize * 0.92);
  const linesFor = (size: number) => allLines(size);
  let headLines = linesFor(headSize);

  // Reserve the logo zone (with clear space) so no block ever overlaps it.
  const logoScale = Math.max(0.6, Math.min(2, p.logoScale)) * (Math.min(w, h) / 1080) * 1.6;
  const stripeH = motifs.includes("stripe") || p.layout === "stripe" ? Math.round(h * 0.03) : 0;
  const logoY = h - pad - 40 * logoScale - (motifs.includes("stripe") ? stripeH : 0);
  const fieldBottom = p.layout === "poster" ? (landscape ? h : h * 0.78) : 0;
  const quoteBottom = p.layout === "quote" ? h * 0.78 : 0;
  const limit = fieldBottom ? fieldBottom - pad * 0.5 : quoteBottom ? quoteBottom - pad * 0.4 : logoY - 40 * logoScale - pad * 0.6;
  const fits = (endY: number) => endY <= limit;
  let headlineFill: string = lead;
  let headlineOnBright = false;

  if (p.layout === "poster") {
    // Bright colour field with white type; label pill sits on canvas, not on the bright.
    const fieldH = h * (landscape ? 1 : 0.58);
    const fieldW = landscape ? w * 0.62 : w;
    parts.push(`<rect x="0" y="${landscape ? 0 : h * 0.2}" width="${fieldW}" height="${fieldH}" fill="${lead}"/>`);
    headlineFill = "#FFFFFF";
    headlineOnBright = true;
  } else if (p.layout === "arch") {
    const tall = h / w > 1.5;
    const aw = landscape ? h * 0.75 : w * (tall ? 0.62 : 0.42);
    const ax = landscape ? w - aw - pad : (w - aw) / 2;
    const ay = landscape ? pad : pad * 1.6;
    const ah = landscape ? h - pad * 2 : archH;
    parts.push(
      `<path d="M${ax} ${ay + ah} V${ay + aw / 2} A${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${ay + aw / 2} V${ay + ah} Z" fill="${p.imageUrl ? colours.roseMist : colours.rose}"/>`,
    );
    if (p.imageUrl) {
      parts.push(
        `<clipPath id="arch"><path d="M${ax} ${ay + ah} V${ay + aw / 2} A${aw / 2} ${aw / 2} 0 0 1 ${ax + aw} ${ay + aw / 2} V${ay + ah} Z"/></clipPath><image href="${esc(p.imageUrl)}" x="${ax}" y="${ay}" width="${aw}" height="${ah}" preserveAspectRatio="xMidYMid slice" clip-path="url(#arch)"/>`,
      );
    }
  } else if (p.layout === "stripe") {
    parts.push(stripe(0, 0, w, Math.round(h * 0.035)));
  } else if (p.layout === "quote") {
    const bw = w - pad * 2;
    parts.push(`<rect x="${pad}" y="${h * 0.22}" width="${bw}" height="${h * 0.56}" rx="22" fill="${colours.shell}"/>`);
    parts.push(`<rect x="${pad}" y="${h * 0.22 - 36}" width="${Math.min(bw * 0.55, 420)}" height="72" rx="36" fill="${colours.tangerine}"/>`);
    parts.push(`<text x="${pad + 36}" y="${h * 0.22 + 12}" font-family="'Nunito Sans', sans-serif" font-weight="800" font-size="30" fill="#FFFFFF">${esc(p.label || "Say it out loud.")}</text>`);
  }

  // Headline block.
  let hx = pad;
  let anchor = "start";
  if (p.layout === "arch" && !landscape) {
    hx = w / 2;
    anchor = "middle";
  }
  const hyFor = (size: number) => {
    if (p.layout === "poster") return landscape ? pad + size : h * 0.2 + pad + size;
    if (p.layout === "arch") return landscape ? pad + size * 1.2 : pad * 1.6 + archH + pad + size;
    if (p.layout === "quote") return h * 0.22 + pad + size;
    return landscape ? pad * 2.2 + size * 0.6 : h * 0.3 + size;
  };
  let hy = hyFor(headSize);
  // Shrink the headline until it fits above the logo zone (readability over size).
  for (let i = 0; i < 8 && !fits(hy + headSize * 1.12 * (headLines.length - 1) + headSize * 0.3); i++) {
    headSize = Math.round(headSize * 0.9);
    headLines = linesFor(headSize);
    hy = hyFor(headSize);
  }

  const headTspans = headLines
    .map((line, i) => `<tspan x="${hx}" dy="${i === 0 ? 0 : headSize * 1.12}">${headlineOnBright ? esc(line) : headlineTspans(line, p.emphasis, headlineFill, accent)}</tspan>`)
    .join("");
  const italicOnBright = headlineOnBright && p.emphasis ? ` font-style="normal"` : "";
  parts.push(
    `<text x="${hx}" y="${hy}" text-anchor="${anchor}" font-family="${esc(hf.family)}" font-weight="${hf.weight ?? 400}" font-size="${headSize}" fill="${headlineFill}"${italicOnBright}>${headTspans}</text>`,
  );
  let cursor = hy + headSize * 1.12 * (headLines.length - 1) + headSize * 0.35;

  // Script accent: one handwritten word at most.
  if (p.script && density >= 0.7) {
    const sSize = Math.round(headSize * 1.1);
    if (fits(cursor + sSize * 0.9)) {
      parts.push(
        `<text x="${hx}" y="${cursor + sSize * 0.75}" text-anchor="${anchor}" font-family="'Mrs Saint Delafield', cursive" font-size="${sSize}" fill="${headlineOnBright ? "#FFFFFF" : colours.hot}">${esc(p.script.split(/\s+/)[0])}</text>`,
      );
      cursor += sSize * 0.95;
    }
  }

  // Poster statement in Anton: solid line + outlined line beneath (on the light canvas).
  if (p.poster && p.layout !== "poster" && density >= 0.8) {
    const ps = Math.round((landscape ? h : w) * 0.07);
    const words = p.poster.toUpperCase().split(/\s+/);
    const half = Math.ceil(words.length / 2);
    const [l1, l2] = [words.slice(0, half).join(" "), words.slice(half).join(" ")];
    const py = cursor + ps * 1.25;
    const end = py + (l2 ? ps * 1.05 : 0) + ps * 0.25;
    if (fits(end)) {
      parts.push(`<text x="${hx}" y="${py}" text-anchor="${anchor}" font-family="${esc(pf.family)}" font-size="${ps}" fill="${colours.signal}" letter-spacing="1">${esc(l1)}</text>`);
      if (l2) parts.push(`<text x="${hx}" y="${py + ps * 1.05}" text-anchor="${anchor}" font-family="${esc(pf.family)}" font-size="${ps}" fill="none" stroke="${colours.signal}" stroke-width="2" letter-spacing="1">${esc(l2)}</text>`);
      cursor = end;
    }
  }

  // Body copy in Charcoal on lights only.
  if (p.body && density >= 0.9 && p.layout !== "poster") {
    const bs = Math.round(Math.min(w, h) * 0.032);
    const all = wrap(p.body, Math.floor(headWidth / (bs * (bf.width ?? 0.56))));
    let lines = all.slice(0, Math.round(3 * density));
    const by = cursor + bs * 1.8;
    while (lines.length && !fits(by + (lines.length - 1) * bs * 1.4 + bs * 0.4)) lines = lines.slice(0, -1);
    if (lines.length && lines.length < all.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/[\s,.;:]*$/, "…");
    if (lines.length) {
      parts.push(
        `<text x="${hx}" y="${by}" text-anchor="${anchor}" font-family="${esc(bf.family)}" font-size="${bs}" fill="${colours.charcoal}">${lines.map((l, i) => `<tspan x="${hx}" dy="${i === 0 ? 0 : bs * 1.4}">${esc(l)}</tspan>`).join("")}</text>`,
      );
    }
  }

  // Small label: always white on a Deep Red pill, never directly on a bright.
  if (p.label && p.layout !== "quote") {
    const ls = Math.round(Math.min(w, h) * 0.024);
    const lw = p.label.length * ls * 0.72 + ls * 2.4;
    const ly = p.layout === "poster" && !landscape ? h * 0.2 - ls * 3.2 : pad;
    parts.push(`<rect x="${pad}" y="${ly}" width="${lw}" height="${ls * 2.2}" rx="${ls * 1.1}" fill="${colours.deepRed}"/>`);
    parts.push(`<text x="${pad + ls * 1.2}" y="${ly + ls * 1.5}" font-family="Brolia, 'Nunito Sans', sans-serif" font-size="${ls}" letter-spacing="${ls * 0.18}" fill="#FFFFFF">${esc(p.label.toUpperCase())}</text>`);
  }

  // Motifs (max two).
  for (const m of motifs) {
    if (m === "stripe" && p.layout !== "stripe") parts.push(stripe(0, h - Math.round(h * 0.03), w, Math.round(h * 0.03)));
    if (m === "flower") parts.push(flower(w - pad * 1.4, pad * 1.6, pad * 0.9, p.lead === "tangerine" ? colours.hot : colours.tangerine));
    if (m === "heart") parts.push(heart(w - pad * 1.3, h - pad * 2.6, pad * 0.9));
    if (m === "badge") parts.push(badge(w - pad * 1.6, pad * 1.7, pad * 0.95));
  }

  // Logo on the light canvas, with clear space (never on the bright field or busy photos).
  const lx = p.layout === "poster" && landscape ? w * 0.66 : pad;
  parts.push(wordmark(lx, logoY, logoScale, logoHref));

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><style>@import url('https://fonts.googleapis.com/css2?family=Anton&amp;family=Cormorant+Garamond:ital,wght@0,300;1,300&amp;family=Mrs+Saint+Delafield&amp;family=Nunito+Sans:wght@400;800${extraFonts}&amp;display=swap');</style>${parts.join("")}</svg>`;
}
