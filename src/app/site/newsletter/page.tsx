import type { Metadata } from "next";
import { SignupForm } from "@/components/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "The Sunday note", description: "One email a week from Simply Being Female. The stories worth your time and what's coming up." };

export default async function NewsletterPage({ searchParams }: { searchParams: Promise<{ signup?: string }> }) {
  const { signup } = await searchParams;
  return (
    <div className="grid gap-10 pt-4 md:grid-cols-2 md:items-center">
      <div>
        <p className="script text-6xl">Sundays</p>
        <h1 className="mt-3">
          The Sunday note. <em>One email, once a week.</em>
        </h1>
        <ul className="mt-6 list-disc space-y-2 pl-5">
          <li>The week&apos;s stories that matter to women, and why.</li>
          <li>The conversations our community is having.</li>
          <li>First word on circles, workshops and meetups.</li>
        </ul>
        <p className="mt-4 text-[15px]">We&apos;ll ask you to confirm your email first. Every note has a one-click unsubscribe. We never sell or share your details.</p>
      </div>
      <div className="card md:p-8">
        <h2 className="text-2xl">Sign me up.</h2>
        <SignupForm status={signup} back="/site/newsletter" source="newsletter-page" />
      </div>
    </div>
  );
}
