import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { ADAPTERS, oauthReady } from "@/lib/integrations/registry";
import { formatBrisbane } from "@/lib/scheduling";
import Link from "next/link";
import { addSandboxAccount, connectAppPassword, connectOAuth, disconnectAccount } from "../actions";
import { connectCanvaAction, disconnectCanvaAction } from "../keys-actions";
import { canvaStatus } from "@/lib/canva";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = await getDb();
  const accs = await db.select().from(accounts);
  const networks = Object.values(ADAPTERS).filter((a) => a.id !== "sandbox");
  const canva = await canvaStatus(db);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Integrations and account connections" title="Your accounts, connected properly." emphasis="connected properly" />
      {sp.connected && <div className="card-tint">✓ {sp.connected === "canva" ? "Canva" : (ADAPTERS[sp.connected]?.name ?? sp.connected)} connected.</div>}
      {sp.error && <div className="rounded-[22px] bg-deepred p-4 font-bold text-white">{sp.error}</div>}
      <p className="text-[15px]">
        Connections use each network&apos;s official API and OAuth. Tokens are encrypted at rest and never reach the browser. Where a network or format doesn&apos;t allow direct publishing, the post is prepared for you to publish by hand and is only marked published once you confirm the live link.
      </p>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {networks.map((a) => {
          const acc = accs.find((x) => x.platform === a.id && x.mode === "live");
          const sandbox = accs.find((x) => x.platform === a.id && x.mode === "sandbox");
          const ready = oauthReady(a);
          const status = acc?.status ?? "disconnected";
          return (
            <article key={a.id} className="card flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-serif text-2xl font-light text-signal">{a.name}</h3>
                <span className={status === "connected" ? "pill-ok pill" : status === "expired" || status === "error" ? "pill-red pill" : "pill"}>
                  {status === "connected" ? "✓ Connected" : status === "expired" ? "Reconnect needed" : status === "error" ? "Error" : "Not connected"}
                </span>
              </div>
              {acc && status !== "disconnected" && (
                <p className="text-[15px]">
                  {acc.handle} · connected {formatBrisbane(acc.connectedAt)}
                  {acc.tokenExpiresAt && ` · token renews before ${formatBrisbane(acc.tokenExpiresAt)}`}
                </p>
              )}
              {acc?.lastError && <p className="text-[15px] text-deepred">{acc.lastError}</p>}
              <p className="text-sm">
                Direct publishing: {a.directFormats.length ? a.directFormats.join(", ") : "none (manual with notification)"} ·{" "}
                <a href={a.docsUrl} target="_blank" rel="noreferrer">
                  API docs
                </a>
              </p>

              <div className="mt-auto flex flex-wrap gap-2">
                {a.auth === "oauth" &&
                  (ready ? (
                    <form action={connectOAuth}>
                      <input type="hidden" name="platform" value={a.id} />
                      <button className="btn btn-sm">{acc && status !== "disconnected" ? "Reconnect" : "Connect"}</button>
                    </form>
                  ) : (
                    <p className="text-sm">
                      Needs a developer app. Add its keys in <Link href="/settings#keys">Settings → Keys and connections</Link>, then Connect appears here.
                    </p>
                  ))}
                {a.auth === "app_password" && (!acc || status === "disconnected") && (
                  <form action={connectAppPassword} className="w-full space-y-2">
                    <input type="hidden" name="platform" value={a.id} />
                    <input name="handle" required className="input" placeholder="handle.bsky.social" aria-label="Handle" />
                    <input name="secret" type="password" required className="input" placeholder="App password (not your main password)" aria-label="App password" autoComplete="off" />
                    <button className="btn btn-sm">Connect</button>
                  </form>
                )}
                {acc && status !== "disconnected" && (
                  <form action={disconnectAccount}>
                    <input type="hidden" name="id" value={acc.id} />
                    <button className="btn btn-sm">Disconnect</button>
                  </form>
                )}
                {sandbox ? (
                  <span className="pill">Sandbox ready</span>
                ) : (
                  <form action={addSandboxAccount}>
                    <input type="hidden" name="platform" value={a.id} />
                    <button className="btn btn-sm" title="Adds a test account so you can try the full publishing flow without posting anything real">
                      Add sandbox for testing
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
        <article className="card flex flex-col gap-3" id="canva">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-serif text-2xl font-light text-signal">Canva</h3>
            <span className={canva.connected ? "pill-ok pill" : "pill"}>{canva.connected ? "✓ Connected" : "Not connected"}</span>
          </div>
          <p className="text-[15px]">
            Open any post&apos;s design in Canva from the Design Approval Centre, edit it there, then bring it back. It comes back as a new design for approval, so nothing skips the approval step.
          </p>
          {canva.connected && canva.name && <p className="text-[15px]">Signed in as {canva.name}</p>}
          <div className="mt-auto flex flex-wrap gap-2">
            {!canva.configured ? (
              <p className="text-sm">
                Create an integration at canva.com/developers, then add its client ID and secret in <Link href="/settings#keys">Settings → Keys and connections</Link>. Set its redirect URL to <code>{(process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "")}/api/oauth/canva/callback</code>.
              </p>
            ) : (
              <form action={connectCanvaAction}>
                <button className="btn btn-sm">{canva.connected ? "Reconnect" : "Connect Canva"}</button>
              </form>
            )}
            {canva.connected && (
              <form action={disconnectCanvaAction}>
                <button className="btn btn-sm">Disconnect</button>
              </form>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
