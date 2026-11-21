import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { cancelRsvp } from "@/lib/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cancel RSVP", robots: { index: false } };

async function confirmCancel(f: FormData) {
  "use server";
  const r = await cancelRsvp(await getDb(), String(f.get("token") ?? ""));
  redirect(`/site/events/cancel?done=${r ? "ok" : "expired"}`);
}

/** Two steps (open the link, then press the button) so link-scanning email filters can't cancel by accident. */
export default async function CancelRsvp({ searchParams }: { searchParams: Promise<{ token?: string; done?: string }> }) {
  const { token = "", done } = await searchParams;
  return (
    <div className="card mx-auto mt-8 max-w-xl text-center">
      {done === "ok" ? (
        <>
          <h1 className="text-3xl">You&apos;re off the list.</h1>
          <p className="mt-3">Your RSVP is cancelled. Thanks for letting us know, it frees up a spot for someone else.</p>
        </>
      ) : done === "expired" ? (
        <h1 className="text-3xl">That link has expired.</h1>
      ) : (
        <>
          <h1 className="text-3xl">Can&apos;t make it?</h1>
          <form action={confirmCancel} className="mt-5">
            <input type="hidden" name="token" value={token} />
            <button className="btn btn-primary">Cancel my RSVP</button>
          </form>
        </>
      )}
      <p className="mt-5">
        <Link href="/site/events">See all events</Link>
      </p>
    </div>
  );
}
