import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { ensureSeed } from "@/lib/seed";
import { login } from "@/lib/auth";
import { Stripe, Wordmark } from "@/components/ui";

async function signIn(formData: FormData) {
  "use server";
  const ok = await login(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  redirect(ok ? "/" : "/login?error=1");
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await ensureSeed(await getDb());
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col">
      <Stripe />
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Wordmark />
            <h1 className="mt-6">
              Come as you are. <em>Leave louder.</em>
            </h1>
          </div>
          <form action={signIn} className="card space-y-4">
            <div>
              <label htmlFor="email" className="label mb-1 block text-deepred">
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="username" required className="input" />
            </div>
            <div>
              <label htmlFor="password" className="label mb-1 block text-deepred">
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
            </div>
            {error && <p className="font-bold text-deepred">That email and password don&apos;t match. Try again.</p>}
            <button className="btn btn-primary w-full">Sign in to the studio</button>
          </form>
        </div>
      </div>
    </div>
  );
}
