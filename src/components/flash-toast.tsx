"use client";
import { useEffect, useState } from "react";

function readFlash(): { kind: "ok" | "error"; message: string } | null {
  const m = document.cookie.match(/(?:^|; )sbf_flash=([^;]*)/);
  if (!m) return null;
  document.cookie = "sbf_flash=; Max-Age=0; path=/";
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return null;
  }
}

/** Shows the result of the last action. Success uses Deep Ink with ✓ on Peach (never green). */
export function FlashToast({ tick }: { tick: string }) {
  const [flash, setFlash] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  useEffect(() => {
    const f = readFlash();
    if (!f) return;
    setFlash(f);
    const t = setTimeout(() => setFlash(null), 7000);
    return () => clearTimeout(t);
  }, [tick]);
  if (!flash) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-4 left-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 rounded-[22px] px-5 py-3 font-bold ${flash.kind === "ok" ? "bg-peach text-ink" : "bg-deepred text-white"}`}
    >
      {flash.kind === "ok" ? "✓ " : ""}
      {flash.message}
      <button className="ml-3 underline" onClick={() => setFlash(null)}>
        Dismiss
      </button>
    </div>
  );
}
