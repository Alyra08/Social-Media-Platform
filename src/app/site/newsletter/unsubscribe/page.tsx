import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { unsubscribe } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false } };

async function unsubscribeAction(f: FormData) {
  "use server";
  const ok = await unsubscribe(await getDb(), String(f.get("token") ?? ""));
  redirect(`/site/newsletter/unsubscribe?done=${ok ? "ok" : "expired"}`);
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token = "", done } = await searchParams;
  return (
    <div className="card mx-auto mt-8 max-w-xl text-center">
      {done === "ok" ? (
        <>
          <h1 className="text-3xl">You&apos;re unsubscribed.</h1>
          <p className="mt-3">No more Sunday notes. You&apos;re welcome back any time.</p>
        </>
      ) : done === "expired" || !token ? (
        <>
          <h1 className="text-3xl">We couldn&apos;t find that subscription.</h1>
          <p className="mt-3">Use the unsubscribe link at the bottom of any Sunday note.</p>
        </>
      ) : (
        <>
          <h1 className="text-3xl">Leaving us?</h1>
          <p className="mt-3">Press the button and you won&apos;t get another Sunday note.</p>
          <form action={unsubscribeAction} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-primary">Unsubscribe me</button>
          </form>
        </>
      )}
      <p className="mt-5">
        <Link href="/site">Back to Simply Being Female</Link>
      </p>
    </div>
  );
}
