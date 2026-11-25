"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import type { DesignParams } from "@/db/schema";
import { DESIGN_FORMATS, renderDesignSvg } from "@/lib/design/render";
import { CANVASES, LAYOUTS, LEADS, MOTIFS, checkDesign, postScore, tidyParams } from "@/lib/design/editor-rules";
import { FONTS, fontByKey } from "@/lib/design/fonts";
import { checkBrandCopy } from "@/lib/brand/check";
import { avaCaptionAction, refineAction, saveEditorAction, sendForApprovalAction } from "../actions";
import { Icon } from "../../overview-ui";

type Copy = { hook: string; caption: string; callToAction: string; hashtags: string[]; altText: string };
type Doc = { format: string; params: DesignParams; copy: Copy };
type LayerKey = "canvas" | "headline" | "emphasis" | "poster" | "script" | "body" | "label" | "motifs" | "photo" | "logo" | "fonts";

const CAPTION_LIMIT: Record<string, number> = { instagram: 2200, tiktok: 2200, facebook: 5000, linkedin: 3000, x: 280, threads: 500, bluesky: 300, pinterest: 500 };
const OPTIONAL: LayerKey[] = ["poster", "script", "body", "label"];

const LAYERS: { key: LayerKey; label: string; icon: string }[] = [
  { key: "canvas", label: "Background", icon: "palette" },
  { key: "headline", label: "Headline", icon: "brief" },
  { key: "emphasis", label: "Italic words", icon: "spark" },
  { key: "poster", label: "Poster line", icon: "news" },
  { key: "script", label: "Script word", icon: "spark" },
  { key: "body", label: "Body text", icon: "brief" },
  { key: "label", label: "Label pill", icon: "check" },
  { key: "motifs", label: "Motifs", icon: "spark" },
  { key: "fonts", label: "Fonts", icon: "brief" },
  { key: "photo", label: "Photo", icon: "globe" },
  { key: "logo", label: "Logo", icon: "book" },
];

/* Undo history. Quick successive edits (typing) group into one step; clicks are their own step. */
type Hist = { doc: Doc; undo: Doc[]; redo: Doc[]; last: number };
type HistAction = { type: "update"; fn: (d: Doc) => Doc; group: boolean; at: number } | { type: "undo" } | { type: "redo" };
function histReducer(s: Hist, a: HistAction): Hist {
  if (a.type === "update") {
    const push = !a.group || a.at - s.last > 700;
    return { doc: a.fn(s.doc), undo: push ? [...s.undo, s.doc].slice(-100) : s.undo, redo: [], last: a.at };
  }
  const from = a.type === "undo" ? s.undo : s.redo;
  if (!from.length) return s;
  const prev = from[from.length - 1];
  return a.type === "undo"
    ? { doc: prev, undo: s.undo.slice(0, -1), redo: [...s.redo, s.doc], last: 0 }
    : { doc: prev, undo: [...s.undo, s.doc], redo: s.redo.slice(0, -1), last: 0 };
}
function useHistory(initial: Doc) {
  const [s, dispatch] = useReducer(histReducer, { doc: initial, undo: [], redo: [], last: 0 });
  const update = useCallback((fn: (d: Doc) => Doc, group = true) => dispatch({ type: "update", fn, group, at: Date.now() }), []);
  const step = useCallback((dir: "undo" | "redo") => dispatch({ type: dir }), []);
  return { doc: s.doc, update, step, canUndo: s.undo.length > 0, canRedo: s.redo.length > 0 };
}

/* Accordion cards: one open at a time, each with a tinted icon, a short status and a chevron. */
const OpenCtx = createContext<{ open: string; setOpen: (id: string) => void }>({ open: "", setOpen: () => {} });

function Section({ title, children, id, icon = "spark", status, tone = "quiet" }: { title: string; children: React.ReactNode; id: string; icon?: string; status?: React.ReactNode; tone?: "ok" | "warn" | "quiet"; active?: boolean }) {
  const { open, setOpen } = useContext(OpenCtx);
  const isOpen = open === id;
  return (
    <section id={id} className={`mx-3 mb-2.5 scroll-mt-4 overflow-hidden rounded-[18px] bg-white ring-1 ring-inset transition-shadow ${isOpen ? "ring-[rgb(158_9_98/0.22)]" : "ring-[rgb(158_9_98/0.08)]"}`}>
      <h3 className="font-sans text-[15px] leading-normal tracking-normal">
        <button type="button" onClick={() => setOpen(isOpen ? "" : id)} aria-expanded={isOpen} aria-controls={`${id}-body`} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isOpen ? "bg-signal text-white" : "bg-blush text-deepred"}`}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1 text-[15px] font-bold text-ink">{title}</span>
          {status != null && <span className={`shrink-0 text-[12.5px] font-bold ${tone === "ok" ? "text-ink" : tone === "warn" ? "text-deepred" : "text-charcoal"}`}>{status}</span>}
          <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-charcoal transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      {isOpen && (
        <div id={`${id}-body`} className="border-t border-rosemist px-4 pb-4 pt-3.5">
          {children}
        </div>
      )}
    </section>
  );
}
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="mb-3 block">
    <span className="mb-1 block text-[12.5px] font-bold text-ink">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-[12px]">{hint}</span>}
  </label>
);
const inputCls = "w-full rounded-[12px] border border-rosemist bg-white px-3 py-2 text-[14.5px] text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-ink";

export function Editor(props: {
  designId: string;
  status: string;
  postStatus: string;
  platform: string;
  initial: Doc;
  logoHref?: string;
  photos: { id: string; name: string }[];
  ai: boolean;
}) {
  const router = useRouter();
  const { doc, update, step, canUndo, canRedo } = useHistory(props.initial);
  const [sel, setSel] = useState<LayerKey>("headline");
  const [leftTab, setLeftTab] = useState<"layers" | "sizes">("layers");
  const [rightTab, setRightTab] = useState<"design" | "caption">("design");
  const [zoom, setZoom] = useState<"fit" | number>("fit");
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(JSON.stringify(props.initial));
  const [pending, start] = useTransition();
  const stash = useRef<Partial<DesignParams>>({});

  const p = doc.params;
  const f = DESIGN_FORMATS[doc.format] ?? DESIGN_FORMATS.ig_portrait;
  const svg = useMemo(() => renderDesignSvg({ format: doc.format, params: tidyParams(p), logoHref: props.logoHref }), [doc.format, p, props.logoHref]);
  const dirty = JSON.stringify(doc) !== saved;
  const designIssues = useMemo(() => checkDesign(p), [p]);
  const copyIssues = useMemo(() => checkBrandCopy({ hook: doc.copy.hook, caption: doc.copy.caption, callToAction: doc.copy.callToAction, hashtags: doc.copy.hashtags }), [doc.copy]);
  const issues = [...designIssues, ...copyIssues.map((i) => ({ severity: i.severity, detail: i.detail }))];
  const limit = CAPTION_LIMIT[props.platform] ?? 2200;
  const score = postScore(p, doc.copy, props.platform, issues);
  const nextFix = score.checks.find((c) => !c.ok);
  const [open, setOpen] = useState("panel-headline");

  const setP = (patch: Partial<DesignParams>, group = true) => update((d) => ({ ...d, params: { ...d.params, ...patch } }), group);
  const setCopy = (patch: Partial<Copy>) => update((d) => ({ ...d, copy: { ...d.copy, ...patch } }));

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text });
    window.setTimeout(() => setToast(null), 5000);
  };
  const payload = () => ({ format: doc.format, params: tidyParams(doc.params), copy: doc.copy });
  const save = () =>
    start(async () => {
      const r = await saveEditorAction(props.designId, payload());
      flash(r.ok, r.message);
      if (r.ok) {
        setSaved(JSON.stringify(doc));
        if (r.id && r.id !== props.designId) router.replace(`/create/${r.id}`);
      }
    });
  const send = () =>
    start(async () => {
      const r = await sendForApprovalAction(props.designId, payload());
      flash(r.ok, r.message);
      if (r.ok) {
        setSaved(JSON.stringify(doc));
        if (r.id && r.id !== props.designId) router.replace(`/create/${r.id}`);
        else router.refresh();
      }
    });
  const writeWithAva = () =>
    start(async () => {
      const r = await avaCaptionAction({ platform: props.platform, format: doc.format, headline: p.headline, caption: doc.copy.caption, idea: doc.copy.hook });
      if (!r.ok || !r.copy) return flash(false, r.message ?? "Ava couldn't write that.");
      update((d) => ({ ...d, copy: r.copy! }), false);
      flash(true, "Ava wrote a new caption. Undo to go back.");
    });
  const refine = () => {
    if (!prompt.trim()) return;
    start(async () => {
      const r = await refineAction(doc.params, prompt);
      if (!r.ok || !r.params) return flash(false, r.message ?? "That didn't work.");
      if (!r.changes.length) return flash(false, props.ai ? "No change needed." : 'Try plainer words, like "pinker", "bigger headline", "less text", "add hearts", "quote layout".');
      update((d) => ({ ...d, params: r.params! }), false);
      flash(true, r.changes.join(". ") + ".");
      setPrompt("");
    });
  };

  // Keyboard: undo, redo, save.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        step("undo");
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        step("redo");
      } else if (k === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const pick = (k: LayerKey) => {
    setSel(k);
    setRightTab("design");
    const card = k === "canvas" ? "panel-canvas" : ["headline", "emphasis", "poster", "script", "body", "label"].includes(k) ? "panel-headline" : `panel-${k}`;
    setOpen(card);
    window.setTimeout(() => document.getElementById(card)?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  };
  const visible = (k: LayerKey) => (k === "photo" ? !!p.imageUrl : k === "motifs" ? p.motifs.length > 0 : OPTIONAL.includes(k) ? !!p[k as "poster"] : true);
  const toggle = (k: LayerKey) => {
    if (!OPTIONAL.includes(k)) return;
    const key = k as "poster" | "script" | "body" | "label";
    if (p[key]) {
      stash.current[key] = p[key];
      setP({ [key]: undefined }, false);
    } else {
      setP({ [key]: (stash.current[key] as string) || { poster: "Say it out loud", script: "together.", body: "Write a line here.", label: "Join the circle" }[key] }, false);
    }
  };
  const preview = (k: LayerKey) =>
    ({
      canvas: CANVASES.find((c) => c.key === p.canvas)?.label,
      headline: p.headline,
      emphasis: p.emphasis,
      poster: p.poster,
      script: p.script,
      body: p.body,
      label: p.label,
      motifs: p.motifs.map((m) => MOTIFS.find((x) => x.key === m)?.label).join(", ") || "None",
      photo: p.imageUrl ? props.photos.find((x) => `/api/files/${x.id}` === p.imageUrl)?.name ?? "Photo" : "None",
      logo: props.logoHref ? `${Math.round(p.logoScale * 100)}%` : "Not uploaded",
      fonts: [fontByKey(p.headlineFont, "brand-serif"), fontByKey(p.posterFont, "brand-poster"), fontByKey(p.bodyFont, "brand-sans")].map((x) => x.label.replace(/ \(.*\)$/, "")).join(", "),
    })[k];

  const canvasW = zoom === "fit" ? `min(100%, calc((100vh - 15rem) * ${f.w} / ${f.h}))` : `${Math.round(f.w * zoom)}px`;
  const blockers = issues.filter((i) => i.severity === "block").length;

  return (
    <div className="-mx-4 -mt-4 flex min-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-[28px] bg-shell ring-1 ring-inset ring-[rgb(158_9_98/0.08)] lg:mx-0">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rosemist bg-white/70 px-3 py-2.5 sm:px-4">
        <Link href="/create" className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-blush" aria-label="Back to the design studio">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </Link>
        <p className="min-w-0 max-w-[16rem] truncate text-[14px]">
          <span className="text-charcoal">{props.status === "draft" ? "Draft" : props.status.replace(/_/g, " ")} / </span>
          <span className="font-bold text-ink">{doc.copy.hook || "Untitled"}</span>
        </p>
        <div className="mx-1 hidden h-6 w-px bg-rosemist sm:block" />
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step("undo")} disabled={!canUndo} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-blush disabled:opacity-30" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
            </svg>
          </button>
          <button type="button" onClick={() => step("redo")} disabled={!canRedo} className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-blush disabled:opacity-30" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
              <path d="m15 14 5-5-5-5" />
              <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
            </svg>
          </button>
        </div>
        <label className="sr-only" htmlFor="zoom">
          Zoom
        </label>
        <select id="zoom" value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))} className="h-9 rounded-full border border-rosemist bg-white px-3 text-[13px] font-bold text-ink">
          <option value="fit">Fit</option>
          <option value="0.25">25%</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setRightTab("design")} className={`hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold sm:inline-flex ${issues.length ? "bg-blush text-deepred" : "bg-peachcream text-ink"}`} title="Brand check">
            {issues.length ? `${issues.length} brand ${issues.length === 1 ? "note" : "notes"}` : "✓ On brand"}
          </button>
          <span className="hidden text-[12.5px] md:inline">{pending ? "Working…" : dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" onClick={save} disabled={pending || !dirty} className="btn btn-sm">
            Save
          </button>
          <button type="button" onClick={send} disabled={pending || blockers > 0} className="btn btn-primary btn-sm" title={blockers ? "Fix the must-fix brand notes first" : "Copy goes to Content approval; design follows"}>
            Send for approval
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        {/* Left: layers and sizes */}
        <aside className="no-scrollbar order-2 border-t border-rosemist lg:order-none lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:border-r lg:border-t-0">
          <div className="segmented segmented-sm m-3 grid grid-cols-2">
            {(["layers", "sizes"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setLeftTab(t)} className="seg" aria-pressed={leftTab === t}>
                {t === "layers" ? "Layers" : "Sizes"}
              </button>
            ))}
          </div>
          {leftTab === "layers" ? (
            <ul className="px-2 pb-4">
              {LAYERS.map((l) => {
                const on = visible(l.key);
                return (
                  <li key={l.key}>
                    <div className={`group flex items-center gap-2 rounded-[12px] pr-1 ${sel === l.key ? "bg-blush" : "hover:bg-blush/60"}`}>
                      <button type="button" onClick={() => pick(l.key)} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-3 text-left" aria-pressed={sel === l.key}>
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${sel === l.key ? "bg-signal text-white" : "bg-white text-deepred"}`}>
                          <Icon name={l.icon} className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className={`block text-[13.5px] font-bold ${on ? "text-ink" : "text-charcoal line-through decoration-1"}`}>{l.label}</span>
                          <span className="block truncate text-[11.5px]">{preview(l.key) || "Hidden"}</span>
                        </span>
                      </button>
                      {OPTIONAL.includes(l.key) && (
                        <button type="button" onClick={() => toggle(l.key)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-deepred hover:bg-white" aria-label={on ? `Hide ${l.label}` : `Show ${l.label}`} title={on ? "Hide" : "Show"}>
                          {on ? <Icon name="eye" className="h-4 w-4" /> : <span className="text-[16px] leading-none">+</span>}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-1 px-2 pb-4">
              {Object.entries(DESIGN_FORMATS).map(([k, v]) => (
                <li key={k}>
                  <button type="button" onClick={() => update((d) => ({ ...d, format: k }), false)} className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2 text-left ${doc.format === k ? "bg-blush" : "hover:bg-blush/60"}`} aria-pressed={doc.format === k}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center">
                      <span className={`block rounded-[3px] ${doc.format === k ? "bg-signal" : "bg-rose"}`} style={{ width: v.w >= v.h ? 30 : (30 * v.w) / v.h, height: v.h >= v.w ? 30 : (30 * v.h) / v.w }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-bold text-ink">{v.label}</span>
                      <span className="block text-[11.5px]">
                        {v.w} × {v.h}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Centre: ask-for-a-change bar and the live canvas */}
        <main className="order-1 flex min-w-0 flex-col items-center gap-4 bg-blush/50 px-3 py-5 sm:px-6 lg:order-none">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refine();
            }}
            className="flex w-full max-w-xl items-center gap-2 rounded-full bg-white py-1.5 pl-4 pr-1.5 ring-1 ring-inset ring-[rgb(158_9_98/0.12)] focus-within:ring-2 focus-within:ring-ink"
          >
            <Icon name="spark" className="h-5 w-5 shrink-0 text-hot" />
            <label htmlFor="ask" className="sr-only">
              Ask for a change
            </label>
            <input id="ask" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={props.ai ? "Ask for a change, e.g. softer and more feminine" : "Try: pinker, bigger headline, add hearts, quote layout"} className="min-w-0 flex-1 bg-transparent py-1.5 text-[14.5px] text-ink outline-none placeholder:text-charcoal" />
            <button className="btn btn-sm shrink-0 border-hot bg-hot text-white hover:border-deepred" disabled={pending || !prompt.trim()}>
              Apply
            </button>
          </form>

          {toast && (
            <p role="status" className={`max-w-xl rounded-full px-4 py-1.5 text-center text-[13px] font-bold ${toast.ok ? "bg-ink text-white" : "bg-white text-deepred ring-1 ring-inset ring-deepred"}`}>
              {toast.text}
            </p>
          )}

          <div className="flex w-full min-w-0 flex-1 flex-col items-center overflow-auto">
            <p className="mb-2.5 inline-flex items-center gap-2 self-start text-[12.5px] sm:self-center">
              <span className="font-bold text-ink">{f.label}</span>
              <span className="text-charcoal">{f.w} × {f.h}</span>
            </p>
            <div className="shrink-0 overflow-hidden rounded-[10px] bg-white ring-1 ring-[rgb(158_9_98/0.12)] [&>svg]:block [&>svg]:h-auto [&>svg]:w-full" style={{ width: canvasW }} dangerouslySetInnerHTML={{ __html: svg }} role="img" aria-label={`Preview: ${p.headline}`} />
          </div>
        </main>

        {/* Right: design and caption */}
        <OpenCtx.Provider value={{ open, setOpen }}>
        <aside className="no-scrollbar order-3 border-t border-rosemist bg-shell lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="m-3 rounded-[18px] bg-white p-4 ring-1 ring-inset ring-[rgb(158_9_98/0.08)]">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[12px] font-bold text-white ${score.score >= 80 ? "bg-ink" : "bg-deepred"}`}>{score.score}%</span>
              <span className="text-[14px] font-bold text-ink">Post score</span>
              <span className="ml-auto text-[12px]">
                {score.checks.filter((c) => c.ok).length}/{score.checks.length} checks
              </span>
            </div>
            <div className="mt-2.5 h-2 rounded-full bg-blush" aria-hidden>
              <div className="h-2 rounded-full bg-signal transition-all" style={{ width: `${score.score}%` }} />
            </div>
            {nextFix && (
              <p className="mt-2 text-[12.5px]">
                <strong className="text-ink">Next:</strong> {nextFix.tip}
              </p>
            )}
          </div>
          <div className="segmented segmented-sm mx-3 mb-3 grid grid-cols-2">
            {(["design", "caption"] as const).map((t) => (
              <button key={t} type="button" onClick={() => { setRightTab(t); setOpen(t === "design" ? "panel-headline" : "cap-caption"); }} className="seg" aria-pressed={rightTab === t}>
                {t === "design" ? "Design" : "Caption"}
              </button>
            ))}
          </div>

          {rightTab === "design" ? (
            <div>
              <Section title="Layout" id="panel-layout" icon="sliders" status={LAYOUTS.find((l) => l.key === p.layout)?.label}>
                <div className="grid grid-cols-5 gap-1.5">
                  {LAYOUTS.map((l) => (
                    <button key={l.key} type="button" onClick={() => setP({ layout: l.key }, false)} className={`rounded-[10px] px-1 py-2 text-[11.5px] font-bold ${p.layout === l.key ? "bg-signal text-white" : "bg-blush text-ink hover:bg-rosemist"}`} aria-pressed={p.layout === l.key}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section title="Colour" id="panel-canvas" icon="palette" status={<span className="inline-flex gap-1"><span className="h-3.5 w-3.5 rounded-full" style={{ background: LEADS.find((c) => c.key === p.lead)?.hex }} /><span className="h-3.5 w-3.5 rounded-full ring-1 ring-rosemist" style={{ background: CANVASES.find((c) => c.key === p.canvas)?.hex }} /></span>}>
                <p className="mb-1.5 text-[12.5px] font-bold text-ink">Lead bright</p>
                <div className="mb-4 flex gap-2">
                  {LEADS.map((c) => (
                    <button key={c.key} type="button" onClick={() => setP({ lead: c.key }, false)} className={`h-9 w-9 rounded-full ring-offset-2 ${p.lead === c.key ? "ring-2 ring-ink" : ""}`} style={{ background: c.hex }} aria-label={c.label} aria-pressed={p.lead === c.key} title={c.label} />
                  ))}
                </div>
                <p className="mb-1.5 text-[12.5px] font-bold text-ink">Background</p>
                <div className="flex flex-wrap gap-2">
                  {CANVASES.map((c) => (
                    <button key={c.key} type="button" onClick={() => setP({ canvas: c.key }, false)} className={`h-9 w-9 rounded-full border border-rosemist ring-offset-2 ${p.canvas === c.key ? "ring-2 ring-ink" : ""}`} style={{ background: c.hex }} aria-label={c.label} aria-pressed={p.canvas === c.key} title={c.label} />
                  ))}
                </div>
              </Section>

              <Section title="Words" id="panel-headline" icon="brief" status={designIssues.some((i) => /headline|italic|exclamation|emoji|sentence case/i.test(i.detail)) ? "Check" : "✓"} tone={designIssues.some((i) => /headline|italic|exclamation|emoji|sentence case/i.test(i.detail)) ? "warn" : "ok"}>
                <Field label="Headline" hint="Short and declarative, ending with a full stop.">
                  <textarea rows={3} value={p.headline} onChange={(e) => setP({ headline: e.target.value })} className={inputCls} />
                </Field>
                <div id="panel-emphasis">
                  <Field label="Italic words" hint="Two or three words from the headline.">
                    <input value={p.emphasis} onChange={(e) => setP({ emphasis: e.target.value })} className={inputCls} />
                  </Field>
                </div>
                <div id="panel-poster">
                  <Field label="Poster line (optional)" hint="One big Anton statement, five words or fewer.">
                    <input value={p.poster ?? ""} onChange={(e) => setP({ poster: e.target.value || undefined })} className={inputCls} />
                  </Field>
                </div>
                <div id="panel-script">
                  <Field label="Script word (optional)" hint="One handwritten word, e.g. together.">
                    <input value={p.script ?? ""} onChange={(e) => setP({ script: e.target.value.split(/\s+/)[0] || undefined })} className={inputCls} />
                  </Field>
                </div>
                <div id="panel-body">
                  <Field label="Body text (optional)">
                    <textarea rows={2} value={p.body ?? ""} onChange={(e) => setP({ body: e.target.value || undefined })} className={inputCls} />
                  </Field>
                </div>
                <div id="panel-label">
                  <Field label="Label pill (optional)">
                    <input value={p.label ?? ""} onChange={(e) => setP({ label: e.target.value || undefined })} className={inputCls} />
                  </Field>
                </div>
              </Section>

              <Section title="Fonts" id="panel-fonts" icon="news" status={[p.headlineFont, p.posterFont, p.bodyFont].some(Boolean) ? "Custom" : "Brand"}>
                {(
                  [
                    ["headlineFont", "Headline", "brand-serif"],
                    ["posterFont", "Poster line", "brand-poster"],
                    ["bodyFont", "Body and label", "brand-sans"],
                  ] as const
                ).map(([k, label, dflt]) => {
                  const cur = fontByKey(p[k], dflt);
                  return (
                    <Field key={k} label={label}>
                      <select value={cur.key} onChange={(e) => setP({ [k]: e.target.value === dflt ? undefined : e.target.value }, false)} className={inputCls} style={{ fontFamily: cur.family }}>
                        {(["Brand", "Serif", "Sans", "Display", "Script"] as const).map((g) => (
                          <optgroup key={g} label={g === "Brand" ? "Brand fonts" : `${g} fonts`}>
                            {FONTS.filter((x) => x.group === g).map((x) => (
                              <option key={x.key} value={x.key} style={{ fontFamily: x.family }}>
                                {x.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                  );
                })}
                <p className="text-[12px]">Brand fonts are the default. Others are standard fonts for one-off pieces.</p>
              </Section>

              <Section title="Size and density" id="panel-logo" icon="chart" status={`${Math.round(p.headlineScale * 100)}%`}>
                {(
                  [
                    ["headlineScale", "Headline size", 0.6, 1.8],
                    ["textDensity", "Text density", 0.5, 1.5],
                    ["logoScale", "Logo size", 0.6, 2],
                  ] as const
                ).map(([k, label, lo, hi]) => (
                  <Field key={k} label={`${label} · ${Math.round(p[k] * 100)}%`}>
                    <input type="range" min={lo} max={hi} step={0.05} value={p[k]} onChange={(e) => setP({ [k]: Number(e.target.value) })} className="w-full accent-[#9E0962]" />
                  </Field>
                ))}
                {!props.logoHref && <p className="text-[12px]">No logo yet. It appears once uploaded in Brand library as type Logos.</p>}
              </Section>

              <Section title="Motifs" id="panel-motifs" icon="spark" status={`${p.motifs.length}/2`}>
                <div className="flex flex-wrap gap-1.5">
                  {MOTIFS.map((m) => {
                    const on = p.motifs.includes(m.key);
                    const full = !on && p.motifs.length >= 2;
                    return (
                      <button key={m.key} type="button" disabled={full} onClick={() => setP({ motifs: on ? p.motifs.filter((x) => x !== m.key) : [...p.motifs, m.key] }, false)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold disabled:opacity-40 ${on ? "bg-ink text-white" : "bg-blush text-ink hover:bg-rosemist"}`} aria-pressed={on}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[12px]">Two at most, so each piece stays calm.</p>
              </Section>

              <Section title="Photo" id="panel-photo" icon="globe" status={p.imageUrl ? "Added" : "None"}>
                {props.photos.length === 0 ? (
                  <p className="text-[13px]">
                    No photos yet. <Link href="/brand">Upload photos in Brand library</Link> (type Photos). They sit inside the arch layout.
                  </p>
                ) : (
                  <select value={p.imageUrl ?? ""} onChange={(e) => setP({ imageUrl: e.target.value || undefined, layout: e.target.value ? "arch" : p.layout }, false)} className={inputCls}>
                    <option value="">No photo</option>
                    {props.photos.map((ph) => (
                      <option key={ph.id} value={`/api/files/${ph.id}`}>
                        {ph.name}
                      </option>
                    ))}
                  </select>
                )}
              </Section>

              <Section title="Brand check" id="panel-brand" icon="check" status={issues.length ? `${issues.length} ${issues.length === 1 ? "note" : "notes"}` : "✓ On brand"} tone={issues.some((i) => i.severity === "block") ? "warn" : issues.length ? "quiet" : "ok"}>
                {issues.length === 0 ? (
                  <p className="text-[14px] font-bold text-ink">✓ On brand.</p>
                ) : (
                  <ul className="space-y-2 text-[13.5px]">
                    {issues.map((i, k) => (
                      <li key={k} className="flex gap-2">
                        <span className={`${i.severity === "block" ? "pill-red" : "pill-ok"} pill shrink-0 text-[0.65rem]`}>{i.severity === "block" ? "Must fix" : "Consider"}</span>
                        <span>{i.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          ) : (
            <div>
              <Section title="Opening line" id="cap-hook" icon="spark" status={`${doc.copy.hook.length}/125`} tone={score.checks.find((c) => c.key === "hook")?.ok ? "ok" : "warn"}>
                <textarea rows={2} value={doc.copy.hook} onChange={(e) => setCopy({ hook: e.target.value })} className={inputCls} aria-label="Opening line" />
                <p className="mt-2 text-[12px]">Tip: the first 125 characters show before “more”. Lead with the specific detail.</p>
              </Section>
              <Section title="Caption" id="cap-caption" icon="brief" status={`${doc.copy.caption.length}/${limit}`} tone={score.checks.find((c) => c.key === "caption")?.ok ? "ok" : "warn"}>
                <div className="overflow-hidden rounded-[14px] border border-rosemist bg-white focus-within:ring-2 focus-within:ring-ink">
                  <div className="flex items-center gap-2 border-b border-rosemist bg-shell px-3 py-1.5">
                    <span className="text-[12px] font-bold text-charcoal">{props.platform[0].toUpperCase() + props.platform.slice(1)} caption</span>
                    <button type="button" onClick={writeWithAva} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold text-hot hover:bg-blush disabled:opacity-50" title={props.ai ? "Ava writes or improves the caption" : "Ava needs the AI key"}>
                      <Icon name="spark" className="h-4 w-4" /> Write with Ava
                    </button>
                  </div>
                  <textarea rows={10} value={doc.copy.caption} onChange={(e) => setCopy({ caption: e.target.value })} className="w-full resize-y px-3 py-2.5 text-[14.5px] leading-relaxed text-ink outline-none" aria-label="Caption" />
                </div>
                <p className="mt-2 text-[12px]">Tip: put the words people search for in the first lines, and end with one real question.</p>
              </Section>
              <Section title="Call to action" id="cap-cta" icon="send" status={score.checks.find((c) => c.key === "cta")?.ok ? "✓" : "Add"} tone={score.checks.find((c) => c.key === "cta")?.ok ? "ok" : "warn"}>
                <input value={doc.copy.callToAction} onChange={(e) => setCopy({ callToAction: e.target.value })} className={inputCls} aria-label="Call to action" />
                <p className="mt-2 text-[12px]">Say exactly what happens, e.g. “Get the Sunday note”.</p>
              </Section>
              <Section title="Hashtags" id="cap-tags" icon="search" status={`${doc.copy.hashtags.length}`} tone={score.checks.find((c) => c.key === "hashtags")?.ok ? "ok" : "warn"}>
                <input value={doc.copy.hashtags.join(" ")} onChange={(e) => setCopy({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#/, "")).filter(Boolean) })} className={inputCls} aria-label="Hashtags" />
                <p className="mt-2 text-[12px]">{score.checks.find((c) => c.key === "hashtags")?.tip} Separate with spaces.</p>
              </Section>
              <Section title="Alt text" id="cap-alt" icon="eye" status={score.checks.find((c) => c.key === "alt")?.ok ? "✓" : "Add"} tone={score.checks.find((c) => c.key === "alt")?.ok ? "ok" : "warn"}>
                <textarea rows={3} value={doc.copy.altText} onChange={(e) => setCopy({ altText: e.target.value })} className={inputCls} aria-label="Alt text" />
                <p className="mt-2 text-[12px]">Describe the image for people using screen readers.</p>
              </Section>
              <p className="mx-4 mb-4 mt-3 text-[12.5px] leading-relaxed">
                <strong className="text-ink">Send for approval</strong> puts the copy in Content approval. Once approved, this design goes to Design approval and the planner suggests the best time. Nothing posts without your approval.
              </p>
            </div>
          )}
        </aside>
        </OpenCtx.Provider>
      </div>
    </div>
  );
}
