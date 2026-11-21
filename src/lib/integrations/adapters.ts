import crypto from "node:crypto";
import type { AccountCredentials, PlatformAdapter, PublishInput, PublishResult } from "./types";

/**
 * Official-API adapters. Each adapter is self-contained so new networks can be added by
 * writing one object and registering it in registry.ts — no other code changes needed.
 *
 * IMPORTANT: live publishing requires developer apps approved by each network (client IDs,
 * secrets, review of publishing permissions). Until those credentials are added these adapters
 * are inactive and the Integrations page shows what is needed.
 */

async function http<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(url, { ...init, headers, body });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}: ${text.slice(0, 400)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const failed = (e: unknown): PublishResult => {
  const status = (e as { status?: number }).status ?? 0;
  return { kind: "failed", error: e instanceof Error ? e.message : String(e), retryable: status === 0 || status === 429 || status >= 500 };
};

const needsImage = (input: PublishInput): PublishResult | null =>
  input.imageUrl ? null : { kind: "failed", error: "A public image URL is required. Set PUBLIC_BASE_URL so the network can fetch the approved creative.", retryable: false };

/* ───────────── Meta: Instagram (Graph API content publishing) ───────────── */
const GRAPH = "https://graph.facebook.com/v21.0";

export const instagram: PlatformAdapter = {
  id: "instagram",
  name: "Instagram",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: `${GRAPH}/oauth/access_token`,
    scopes: ["instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"],
    clientIdEnv: "META_APP_ID",
    clientSecretEnv: "META_APP_SECRET",
  },
  directFormats: ["post", "carousel"],
  docsUrl: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  async identify(token) {
    const pages = await http<{ data: { id: string; instagram_business_account?: { id: string } }[] }>(`${GRAPH}/me/accounts?fields=instagram_business_account&access_token=${token}`);
    const ig = pages.data.find((p) => p.instagram_business_account)?.instagram_business_account;
    if (!ig) throw new Error("No Instagram professional account is linked to a Facebook Page you manage.");
    const me = await http<{ username: string }>(`${GRAPH}/${ig.id}?fields=username&access_token=${token}`);
    return { externalId: ig.id, handle: `@${me.username}` };
  },
  async publish(creds, input) {
    if (!this.directFormats.includes(input.format)) return manual("Instagram", input.format);
    const noImg = needsImage(input);
    if (noImg) return noImg;
    try {
      const container = await http<{ id: string }>(`${GRAPH}/${creds.externalId}/media`, {
        method: "POST",
        json: { image_url: input.imageUrl, caption: input.caption, alt_text: input.altText ?? undefined, access_token: creds.accessToken },
      });
      const pub = await http<{ id: string }>(`${GRAPH}/${creds.externalId}/media_publish`, { method: "POST", json: { creation_id: container.id, access_token: creds.accessToken } });
      const media = await http<{ permalink: string }>(`${GRAPH}/${pub.id}?fields=permalink&access_token=${creds.accessToken}`);
      return { kind: "published", externalId: pub.id, url: media.permalink };
    } catch (e) {
      return failed(e);
    }
  },
  async fetchMetrics(creds, id) {
    const r = await http<{ data: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
      `${GRAPH}/${id}/insights?metric=reach,likes,comments,shares,saved,views&access_token=${creds.accessToken}`,
    );
    const v = (n: string) => r.data.find((d) => d.name === n)?.values?.[0]?.value ?? r.data.find((d) => d.name === n)?.total_value?.value ?? 0;
    return { reach: v("reach"), likes: v("likes"), comments: v("comments"), shares: v("shares"), saves: v("saved"), views: v("views") };
  },
  async fetchInteractions(creds, since) {
    const media = await http<{ data: { id: string; timestamp: string }[] }>(`${GRAPH}/${creds.externalId}/media?fields=id,timestamp&limit=20&access_token=${creds.accessToken}`);
    const out = [];
    for (const m of media.data) {
      const c = await http<{ data: { id: string; text: string; username: string; timestamp: string }[] }>(`${GRAPH}/${m.id}/comments?fields=id,text,username,timestamp&access_token=${creds.accessToken}`);
      for (const x of c.data) if (new Date(x.timestamp) > since) out.push({ externalId: x.id, kind: "comment" as const, author: x.username, text: x.text, postExternalId: m.id, receivedAt: new Date(x.timestamp) });
    }
    return out;
  },
  async reply(creds, id, text) {
    await http(`${GRAPH}/${id}/replies`, { method: "POST", json: { message: text, access_token: creds.accessToken } });
  },
};

/* ───────────── Meta: Facebook Pages ───────────── */
export const facebook: PlatformAdapter = {
  id: "facebook",
  name: "Facebook",
  auth: "oauth",
  oauth: { ...instagram.oauth!, scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "pages_manage_engagement", "read_insights"] },
  directFormats: ["post"],
  docsUrl: "https://developers.facebook.com/docs/pages-api/posts",
  async identify(token) {
    const pages = await http<{ data: { id: string; name: string; access_token: string }[] }>(`${GRAPH}/me/accounts?access_token=${token}`);
    if (!pages.data[0]) throw new Error("No Facebook Page found for this login.");
    return { externalId: pages.data[0].id, handle: pages.data[0].name };
  },
  async publish(creds, input) {
    try {
      const pageToken = (await http<{ access_token: string }>(`${GRAPH}/${creds.externalId}?fields=access_token&access_token=${creds.accessToken}`)).access_token;
      const r = input.imageUrl
        ? await http<{ id: string; post_id?: string }>(`${GRAPH}/${creds.externalId}/photos`, { method: "POST", json: { url: input.imageUrl, caption: input.caption, access_token: pageToken } })
        : await http<{ id: string }>(`${GRAPH}/${creds.externalId}/feed`, { method: "POST", json: { message: input.caption, access_token: pageToken } });
      const postId = String(("post_id" in r && r.post_id) || r.id);
      return { kind: "published", externalId: postId, url: `https://www.facebook.com/${postId}` };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── Threads ───────────── */
export const threads: PlatformAdapter = {
  id: "threads",
  name: "Threads",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://threads.net/oauth/authorize",
    tokenUrl: "https://graph.threads.net/oauth/access_token",
    scopes: ["threads_basic", "threads_content_publish", "threads_manage_replies", "threads_read_replies", "threads_manage_insights"],
    clientIdEnv: "THREADS_APP_ID",
    clientSecretEnv: "THREADS_APP_SECRET",
  },
  directFormats: ["post"],
  docsUrl: "https://developers.facebook.com/docs/threads/posts",
  async identify(token) {
    const me = await http<{ id: string; username: string }>(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${token}`);
    return { externalId: me.id, handle: `@${me.username}` };
  },
  async publish(creds, input) {
    try {
      const base = `https://graph.threads.net/v1.0/${creds.externalId}`;
      const params = new URLSearchParams({ media_type: input.imageUrl ? "IMAGE" : "TEXT", text: input.caption, access_token: creds.accessToken });
      if (input.imageUrl) params.set("image_url", input.imageUrl);
      const c = await http<{ id: string }>(`${base}/threads?${params}`, { method: "POST" });
      const p = await http<{ id: string }>(`${base}/threads_publish?creation_id=${c.id}&access_token=${creds.accessToken}`, { method: "POST" });
      const link = await http<{ permalink: string }>(`https://graph.threads.net/v1.0/${p.id}?fields=permalink&access_token=${creds.accessToken}`);
      return { kind: "published", externalId: p.id, url: link.permalink };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── LinkedIn (Posts API) ───────────── */
export const linkedin: PlatformAdapter = {
  id: "linkedin",
  name: "LinkedIn",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "w_member_social", "w_organization_social", "r_organization_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
  },
  directFormats: ["post"],
  docsUrl: "https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api",
  async identify(token) {
    const me = await http<{ sub: string; name: string }>("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    // Set LINKEDIN_ORGANIZATION_URN to post as the SBF company page instead of the member.
    return { externalId: process.env.LINKEDIN_ORGANIZATION_URN || `urn:li:person:${me.sub}`, handle: me.name };
  },
  async publish(creds, input) {
    try {
      const res = await fetch("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json", "LinkedIn-Version": "202410", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({ author: creds.externalId, commentary: input.caption, visibility: "PUBLIC", distribution: { feedDistribution: "MAIN_FEED" }, lifecycleState: "PUBLISHED" }),
      });
      if (!res.ok) throw Object.assign(new Error(`${res.status}: ${await res.text()}`), { status: res.status });
      const id = res.headers.get("x-restli-id") ?? "";
      return { kind: "published", externalId: id, url: `https://www.linkedin.com/feed/update/${id}` };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── X (API v2) ───────────── */
export const x: PlatformAdapter = {
  id: "x",
  name: "X",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    pkce: true,
  },
  directFormats: ["post"],
  docsUrl: "https://docs.x.com/x-api/posts/creation-of-a-post",
  async identify(token) {
    const me = await http<{ data: { id: string; username: string } }>("https://api.x.com/2/users/me", { headers: { Authorization: `Bearer ${token}` } });
    return { externalId: me.data.id, handle: `@${me.data.username}` };
  },
  async publish(creds, input) {
    try {
      const r = await http<{ data: { id: string } }>("https://api.x.com/2/tweets", { method: "POST", headers: { Authorization: `Bearer ${creds.accessToken}` }, json: { text: input.caption.slice(0, 280) } });
      return { kind: "published", externalId: r.data.id, url: `https://x.com/${creds.handle.replace("@", "")}/status/${r.data.id}` };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── Pinterest (API v5) ───────────── */
export const pinterest: PlatformAdapter = {
  id: "pinterest",
  name: "Pinterest",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://www.pinterest.com/oauth/",
    tokenUrl: "https://api.pinterest.com/v5/oauth/token",
    scopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"],
    clientIdEnv: "PINTEREST_APP_ID",
    clientSecretEnv: "PINTEREST_APP_SECRET",
  },
  directFormats: ["pin"],
  docsUrl: "https://developers.pinterest.com/docs/api/v5/pins-create",
  async identify(token) {
    const me = await http<{ username: string; id?: string }>("https://api.pinterest.com/v5/user_account", { headers: { Authorization: `Bearer ${token}` } });
    return { externalId: me.id ?? me.username, handle: me.username };
  },
  async publish(creds, input) {
    const noImg = needsImage(input);
    if (noImg) return noImg;
    const board = process.env.PINTEREST_BOARD_ID;
    if (!board) return { kind: "failed", error: "Set PINTEREST_BOARD_ID to choose the board for SBF pins.", retryable: false };
    try {
      const [title, ...rest] = input.caption.split("\n");
      const r = await http<{ id: string }>("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.accessToken}` },
        json: { board_id: board, title: title.slice(0, 100), description: rest.join("\n").slice(0, 500), alt_text: input.altText?.slice(0, 500), media_source: { source_type: "image_url", url: input.imageUrl } },
      });
      return { kind: "published", externalId: r.id, url: `https://www.pinterest.com/pin/${r.id}` };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── Bluesky (AT Protocol, app password) ───────────── */
export const bluesky: PlatformAdapter = {
  id: "bluesky",
  name: "Bluesky",
  auth: "app_password",
  directFormats: ["post"],
  docsUrl: "https://docs.bsky.app/docs/advanced-guides/posts",
  async connect({ handle, secret }) {
    const s = await http<{ accessJwt: string; refreshJwt: string; did: string; handle: string }>("https://bsky.social/xrpc/com.atproto.server.createSession", {
      method: "POST",
      json: { identifier: handle, password: secret },
    });
    // We store the app password (encrypted) as the refresh secret so sessions can be renewed.
    return { accessToken: s.accessJwt, refreshToken: secret, externalId: s.did, handle: `@${s.handle}` };
  },
  async publish(creds, input) {
    try {
      const s = await http<{ accessJwt: string; did: string }>("https://bsky.social/xrpc/com.atproto.server.createSession", {
        method: "POST",
        json: { identifier: creds.handle.replace("@", ""), password: creds.refreshToken },
      });
      const auth = { Authorization: `Bearer ${s.accessJwt}` };
      let embed: unknown;
      if (input.imageBytes) {
        const blob = await fetch("https://bsky.social/xrpc/com.atproto.repo.uploadBlob", { method: "POST", headers: { ...auth, "Content-Type": "image/png" }, body: new Uint8Array(input.imageBytes) });
        const b = (await blob.json()) as { blob: unknown };
        embed = { $type: "app.bsky.embed.images", images: [{ alt: input.altText ?? "", image: b.blob }] };
      }
      const r = await http<{ uri: string }>("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        headers: auth,
        json: { repo: s.did, collection: "app.bsky.feed.post", record: { $type: "app.bsky.feed.post", text: input.caption.slice(0, 300), createdAt: new Date().toISOString(), ...(embed ? { embed } : {}) } },
      });
      const rkey = r.uri.split("/").pop();
      return { kind: "published", externalId: r.uri, url: `https://bsky.app/profile/${s.did}/post/${rkey}` };
    } catch (e) {
      return failed(e);
    }
  },
};

/* ───────────── TikTok & YouTube: video-first, manual unless a video is attached ───────────── */
function manual(network: string, format: string): PublishResult {
  return {
    kind: "manual",
    instructions: `${network} doesn't allow direct API publishing for this ${format} from this platform yet. Download the approved creative, open ${network}, paste the approved caption (copied for you on the post card), publish, then paste the live URL back into the post card and press "Confirm published". It won't be marked as published until you do.`,
  };
}

export const tiktok: PlatformAdapter = {
  id: "tiktok",
  name: "TikTok",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.publish", "video.upload"],
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    pkce: true,
  },
  directFormats: [],
  docsUrl: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  async publish(_c, input) {
    return manual("TikTok", input.format);
  },
};

export const youtube: PlatformAdapter = {
  id: "youtube",
  name: "YouTube",
  auth: "oauth",
  oauth: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
  },
  directFormats: [],
  docsUrl: "https://developers.google.com/youtube/v3/guides/uploading_a_video",
  async publish(_c, input) {
    return manual("YouTube", input.format);
  },
};

/* ───────────── Sandbox: end-to-end testing without touching real accounts ───────────── */
export const sandbox: PlatformAdapter = {
  id: "sandbox",
  name: "Sandbox (test)",
  auth: "sandbox",
  directFormats: ["post", "carousel", "reel", "story", "video", "pin", "short", "sunday-note", "discussion-prompt"],
  docsUrl: "",
  async publish(_creds: AccountCredentials, input) {
    if (process.env.SANDBOX_FAIL_NEXT === "1") return { kind: "failed", error: "Simulated sandbox failure", retryable: true };
    const id = `sbx_${crypto.createHash("sha1").update(input.idempotencyKey).digest("hex").slice(0, 12)}`;
    return { kind: "published", externalId: id, url: `https://sandbox.local/posts/${id}` };
  },
  async fetchMetrics() {
    // Sandbox metrics are flagged isSandbox and excluded from real analytics.
    const r = () => Math.floor(Math.random() * 100);
    return { impressions: r() * 20, reach: r() * 15, likes: r(), comments: Math.floor(r() / 8), shares: Math.floor(r() / 5), saves: Math.floor(r() / 4) };
  },
};
