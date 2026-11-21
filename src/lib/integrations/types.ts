export type PublishInput = {
  postId: string;
  caption: string; // final platform-specific text incl. hashtags
  altText: string | null;
  imageUrl: string | null; // public URL of the approved creative (PNG)
  imageBytes: Buffer | null;
  format: string;
  idempotencyKey: string;
};

export type PublishResult =
  | { kind: "published"; externalId: string; url: string }
  | { kind: "manual"; instructions: string } // direct publishing not permitted for this format
  | { kind: "failed"; error: string; retryable: boolean };

export type AccountCredentials = {
  accessToken: string;
  refreshToken?: string | null;
  externalId?: string | null;
  handle: string;
};

export type MetricsSnapshot = {
  impressions?: number;
  reach?: number;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  clicks?: number;
  profileVisits?: number;
  watchTimeSeconds?: number;
};

export type IncomingInteraction = {
  externalId: string;
  kind: "comment" | "mention" | "dm";
  author: string;
  text: string;
  postExternalId?: string;
  receivedAt?: Date;
};

export type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientIdEnv: string;
  clientSecretEnv: string;
  pkce?: boolean;
  extraAuthParams?: Record<string, string>;
};

export interface PlatformAdapter {
  id: string;
  name: string;
  /** "oauth" (official OAuth 2.0), "app_password" (e.g. Bluesky), or "sandbox". */
  auth: "oauth" | "app_password" | "sandbox";
  oauth?: OAuthConfig;
  /** Formats that may be published directly through the official API. */
  directFormats: string[];
  docsUrl: string;
  connect?(input: { handle: string; secret: string }): Promise<AccountCredentials>;
  /** Called after OAuth to look up the account id / handle. */
  identify?(accessToken: string): Promise<{ externalId: string; handle: string }>;
  publish(creds: AccountCredentials, input: PublishInput): Promise<PublishResult>;
  fetchMetrics?(creds: AccountCredentials, externalId: string): Promise<MetricsSnapshot>;
  fetchInteractions?(creds: AccountCredentials, since: Date): Promise<IncomingInteraction[]>;
  reply?(creds: AccountCredentials, interactionExternalId: string, text: string): Promise<void>;
}
