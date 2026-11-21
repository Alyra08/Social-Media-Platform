import { describe, it, expect } from "vitest";
import { checkBrandCopy } from "@/lib/brand/check";
import { textOnColourViolation, contrastRatio, colours } from "@/lib/brand/tokens";
import { extractSignals } from "@/lib/learning";
import { applyVisualSignals } from "@/lib/design/engine";
import { renderDesignSvg } from "@/lib/design/render";
import type { DesignParams } from "@/db/schema";

describe("brand copy checker", () => {
  it("passes on-brand copy", () => {
    const issues = checkBrandCopy({ hook: "They said too much. Turns out they miscounted.", caption: "Who taught you to ask for less? ✦", callToAction: "Join the circle" });
    expect(issues.filter((i) => i.severity === "block")).toEqual([]);
  });
  it("blocks emoji, exclamation marks, avoid-list and war words", () => {
    const rules = checkBrandCopy({ caption: "Unlock your inner queen 💪 and win the battle!" }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["no-emoji", "no-exclamation", "avoid-word", "no-war-language"]));
  });
  it("blocks vague CTAs and rewritten taglines", () => {
    const rules = checkBrandCopy({ caption: "Unapologetically fierce and fabulous.", callToAction: "Click here" }).map((i) => i.rule);
    expect(rules).toEqual(expect.arrayContaining(["cta", "fixed-tagline"]));
  });
  it("allows the fixed tagline verbatim", () => {
    expect(checkBrandCopy({ caption: "Unapologetically fierce. Beautifully imperfect." }).filter((i) => i.rule === "fixed-tagline")).toEqual([]);
  });
  it("allows figures only when backed by a verified source", () => {
    expect(checkBrandCopy({ caption: "The gap is 21.7% nationally." }).some((i) => i.rule === "unverified-figure")).toBe(true);
    expect(checkBrandCopy({ caption: "The gap is 21.7% nationally.", sourcedStatements: ["Total remuneration gap of 21.7%"] }).some((i) => i.rule === "unverified-figure")).toBe(false);
  });
  it("warns on American spelling", () => {
    expect(checkBrandCopy({ caption: "My favorite color." }).some((i) => i.rule === "british-spelling")).toBe(true);
  });
});

describe("colour rules", () => {
  it("enforces text-on-colour rules from the brief", () => {
    expect(textOnColourViolation("rose", "white", { sizePx: 40 })).toMatch(/Rose/);
    expect(textOnColourViolation("signal", "charcoal", { sizePx: 40 })).toMatch(/white/);
    expect(textOnColourViolation("hot", "white", { sizePx: 14 })).toMatch(/pill/);
    expect(textOnColourViolation("signal", "white", { sizePx: 30 })).toBeNull();
    expect(textOnColourViolation("blush", "charcoal", { sizePx: 17 })).toBeNull();
    expect(contrastRatio(colours.deepRed, colours.white)).toBeGreaterThan(4.5);
  });
});

describe("design intelligence", () => {
  const base: DesignParams = { layout: "editorial", lead: "signal", canvas: "blush", headline: "Who decided that was our job.", emphasis: "our job", motifs: ["stripe", "heart", "flower"] as DesignParams["motifs"], headlineScale: 1, logoScale: 1, textDensity: 1 };
  it("interprets owner feedback into design changes", () => {
    const keys = extractSignals("Make the headline larger, logo more prominent and use more pink", ["visual"]).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(["headline_larger", "logo_larger", "more_pink"]));
    const p = applyVisualSignals(base, keys);
    expect(p.headlineScale).toBeGreaterThan(1);
    expect(p.logoScale).toBeGreaterThan(1);
    expect(p.lead).toBe("hot");
  });
  it("renders correct dimensions and never more than two motifs", () => {
    const svg = renderDesignSvg({ format: "story", params: base });
    expect(svg).toContain('viewBox="0 0 1080 1920"');
    const flowers = (svg.match(/fill="#FEE0D4"\/><\/g>/g) ?? []).length; // flower centres
    expect(flowers).toBe(0); // third motif (flower) dropped
  });
  it("puts poster-layout headlines in white on the bright field", () => {
    const svg = renderDesignSvg({ format: "ig_square", params: { ...base, layout: "poster" } });
    expect(svg).toMatch(/font-size="\d+" fill="#FFFFFF"/);
  });
});
