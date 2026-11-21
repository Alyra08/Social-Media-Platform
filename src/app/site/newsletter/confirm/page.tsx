import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { confirmSubscription } from "@/lib/newsletter";

export const dynamic = "force-dynamic";
export const metadata = { title: "Confirm your subscription", robots: { index: false } };

async function confirmAction(f: FormData) {
  "use server";
  const ok = await confirmSubscription(await getDb(), String(f.get("token") ?? ""));
  redirect(`/site/newsletter/confirm?done=${ok ? "ok" : "expired"}`);
}

/** The button step stops email link scanners from confirming on someone's behalf. */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token = "", done } = await searchParams;
  return (
    <div className="card mx-auto mt-8 max-w-xl text-center">
      {done === "ok" ? (
        <>
          <h1 className="text-3xl">
            You&apos;re <em>in</em>.
          </h1>
          <p className="mt-3">Your first Sunday note arrives this weekend.</p>
          <p className="mt-5">
            <Link href="/site/articles" className="btn btn-sm">
              Read the latest stories
            </Link>
          </p>
        </>
      ) : done === "expired" ? (
        <>
          <h1 className="text-3xl">That link has expired.</h1>
          <p className="mt-3">
            <Link href="/site/newsletter">Sign up again</Link> and we&apos;ll send a fresh one.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl">One more tap.</h1>
          <form action={confirmAction} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-primary">Confirm my subscription</button>
          </form>
        </>
      )}
    </div>
  );
}
