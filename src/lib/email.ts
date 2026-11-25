/**
 * Transactional and newsletter email through Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Nothing is sent until RESEND_API_KEY and NEWSLETTER_FROM are added (Settings → Keys and connections).
 * Tests and local rehearsal can set EMAIL_SANDBOX=1 to record messages in memory instead.
 */
export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
};

export type SendResult = { ok: true; id: string } | { ok: false; error: string; retryable: boolean };

const g = globalThis as unknown as { __sbfOutbox?: OutgoingEmail[] };
export const sandboxOutbox = () => (g.__sbfOutbox ??= []);

export function emailReady(): boolean {
  if (process.env.EMAIL_SANDBOX === "1") return true;
  return Boolean(process.env.RESEND_API_KEY && process.env.NEWSLETTER_FROM);
}

export function emailSetupMessage(): string {
  return "Email isn't set up yet. Add a Resend API key and a sending address in Settings → Keys and connections.";
}

export async function sendEmail(m: OutgoingEmail): Promise<SendResult> {
  if (process.env.EMAIL_SANDBOX === "1") {
    if (process.env.EMAIL_SANDBOX_FAIL === m.to) return { ok: false, error: "Simulated failure", retryable: false };
    sandboxOutbox().push(m);
    return { ok: true, id: `sandbox-${sandboxOutbox().length}` };
  }
  if (!emailReady()) return { ok: false, error: emailSetupMessage(), retryable: false };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify({ from: process.env.NEWSLETTER_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text, headers: m.headers }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !body.id) return { ok: false, error: body.message ?? `Email provider returned ${res.status}`, retryable: res.status === 429 || res.status >= 500 };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true };
  }
}

/** Escape text for safe inclusion in email HTML. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Brand-styled email shell (inline styles: email clients ignore stylesheets). */
export function emailShell(opts: { preheader?: string; bodyHtml: string; footerHtml?: string }): string {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F6DDF1;color:#4A4544;font-family:'Nunito Sans',Arial,sans-serif;font-size:17px;line-height:1.55">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FCEEF8;border-radius:22px">
<tr><td style="height:10px;font-size:0;line-height:0;border-radius:22px 22px 0 0;background:linear-gradient(90deg,#D90F2A 25%,#D9087F 25% 50%,#F08A1C 50% 75%,#FCEEF8 75%)">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px"><div style="font-family:Georgia,serif;font-weight:300;color:#D90F2A;font-size:24px">simply being <span style="letter-spacing:.3em">FEMALE</span></div></td></tr>
<tr><td style="padding:8px 28px 28px">${opts.bodyHtml}</td></tr>
<tr><td style="padding:0 28px 28px;font-size:13px;color:#4A4544">${opts.footerHtml ?? ""}<p style="margin:12px 0 0;text-transform:uppercase;letter-spacing:.14em;font-size:11px;color:#9E0962">Unapologetically fierce. Beautifully imperfect.</p></td></tr>
</table></td></tr></table></body></html>`;
}

export function siteUrl(path = ""): string {
  const base = process.env.SITE_URL || `${(process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/site`;
  return `${base.replace(/\/$/, "")}${path}`;
}
