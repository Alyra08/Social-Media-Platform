import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uuid,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────── People & access ───────────── */

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("editor"), // owner | editor | viewer
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // sha256 of the cookie token
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/* ───────────── Research ───────────── */

export const researchRuns = pgTable("research_runs", {
  id: id(),
  kind: text("kind").notNull().default("daily"), // daily | breaking | more_research
  mode: text("mode").notNull(), // ai | demo
  status: text("status").notNull().default("running"), // running | done | failed
  storiesFound: integer("stories_found").notNull().default(0),
  duplicatesRemoved: integer("duplicates_removed").notNull().default(0),
  notes: text("notes"),
  startedAt: createdAt(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export type SourceRef = { title: string; url: string; organisation?: string; publishedAt?: string };
export type KeyStat = { statement: string; sourceUrl: string };
export type ScoreBreakdown = {
  relevance: number;
  momentum: number;
  significance: number;
  audience: number;
  discussion: number;
  originality: number;
  brandAlignment: number;
};

export const stories = pgTable(
  "stories",
  {
    id: id(),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id),
    topicKey: text("topic_key").notNull(),
    category: text("category").notNull(),
    headline: text("headline").notNull(),
    overview: text("overview").notNull(),
    whyItMatters: text("why_it_matters").notNull(),
    whyRelevantToSbf: text("why_relevant_to_sbf").notNull(),
    keyStats: jsonb("key_stats").$type<KeyStat[]>().notNull().default([]),
    sourceUrl: text("source_url").notNull(),
    sourceOrganisation: text("source_organisation").notNull(),
    publishedAt: text("published_at"), // as reported by the source (ISO date)
    eventDate: text("event_date"), // when the underlying event happened
    supportingSources: jsonb("supporting_sources").$type<SourceRef[]>().notNull().default([]),
    region: text("region").notNull().default("international"), // australian | international | global
    regionalDifferences: text("regional_differences"),
    trending: boolean("trending").notNull().default(false),
    momentum: text("momentum").notNull().default("steady"), // rising | steady | renewed | new
    verification: text("verification").notNull().default("confirmed"), // confirmed | developing | unverified
    factsVsOpinion: text("facts_vs_opinion"),
    conflictingReports: text("conflicting_reports"),
    suggestedAngle: text("suggested_angle").notNull(),
    socialOpportunities: jsonb("social_opportunities").$type<string[]>().notNull().default([]),
    audienceInterest: text("audience_interest").notNull().default("medium"),
    suggestedArticleHeadline: text("suggested_article_headline").notNull(),
    relevanceScore: integer("relevance_score").notNull(),
    scoreExplanation: text("score_explanation").notNull(),
    scoreBreakdown: jsonb("score_breakdown").$type<ScoreBreakdown>(),
    sourcesVerified: boolean("sources_verified").notNull().default(false),
    isDemo: boolean("is_demo").notNull().default(false),
    status: text("status").notNull().default("pending"), // pending | approved | denied | saved | more_research
    decisionFeedback: text("decision_feedback"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("stories_status_idx").on(t.status), index("stories_topic_idx").on(t.topicKey)],
);

export const topics = pgTable("topics", {
  id: id(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  category: text("category").notNull(),
  mentions: integer("mentions").notNull().default(1),
  timesCovered: integer("times_covered").notNull().default(0),
  sentiment: text("sentiment"),
  firstSeen: createdAt(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────── Editorial ───────────── */

export type BriefData = {
  proposedTitle: string;
  alternativeHeadlines: string[];
  topicOverview: string;
  background: string;
  whyItMatters: string;
  keyArguments: string[];
  statistics: KeyStat[];
  supportingEvidence: string[];
  perspectives: string[];
  counterarguments: string[];
  questionsToExplore: string[];
  outline: { heading: string; subheadings: string[] }[];
  suggestedIntroduction: string;
  suggestedConclusion: string;
  sources: SourceRef[];
  keywords: string[];
  longTailPhrases: string[];
  searchIntent: string;
  seoTitle: string;
  metaDescription: string;
  urlSlug: string;
  internalLinks: string[];
  relatedArticles: string[];
  socialPromotion: string[];
};

export const briefs = pgTable("briefs", {
  id: id(),
  storyId: uuid("story_id").notNull().references(() => stories.id),
  data: jsonb("data").$type<BriefData>().notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdAt: createdAt(),
});

export const articles = pgTable("articles", {
  id: id(),
  briefId: uuid("brief_id").references(() => briefs.id),
  storyId: uuid("story_id").references(() => stories.id),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  // idea | researching | brief_approved | drafting | editing | ready | published | archived
  status: text("status").notNull().default("brief_approved"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ───────────── Social content ───────────── */

export const campaigns = pgTable("campaigns", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  startsOn: text("starts_on"),
  endsOn: text("ends_on"),
  createdAt: createdAt(),
});

export const posts = pgTable(
  "posts",
  {
    id: id(),
    storyId: uuid("story_id").references(() => stories.id),
    briefId: uuid("brief_id").references(() => briefs.id),
    campaignId: uuid("campaign_id").references(() => campaigns.id),
    platform: text("platform").notNull(),
    format: text("format").notNull(),
    category: text("category").notNull(),
    treatment: text("treatment").notNull().default("serious"), // serious | humorous | inspirational | lifestyle
    hook: text("hook").notNull(),
    caption: text("caption").notNull(),
    supportingCopy: text("supporting_copy"),
    callToAction: text("call_to_action").notNull(),
    hashtags: jsonb("hashtags").$type<string[]>().notNull().default([]),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
    seoNotes: text("seo_notes"),
    taglines: jsonb("taglines").$type<string[]>().notNull().default([]),
    designConcept: text("design_concept"),
    altText: text("alt_text"),
    script: text("script"),
    suggestedDate: text("suggested_date"),
    suggestedTime: text("suggested_time"),
    audience: text("audience"),
    engagementGoal: text("engagement_goal"),
    brandIssues: jsonb("brand_issues").$type<BrandIssue[]>().notNull().default([]),
    isDemo: boolean("is_demo").notNull().default(false),
    /**
     * awaiting_content → content_approved/awaiting_design → design_approved/approved_for_publishing
     * → scheduled → published | failed ; plus denied, revision_requested, saved, archived
     */
    status: text("status").notNull().default("awaiting_content"),
    version: integer("version").notNull().default(1),
    approvedContentHash: text("approved_content_hash"),
    contentApprovedBy: uuid("content_approved_by").references(() => users.id),
    contentApprovedAt: timestamp("content_approved_at", { withTimezone: true }),
    designApprovedBy: uuid("design_approved_by").references(() => users.id),
    designApprovedAt: timestamp("design_approved_at", { withTimezone: true }),
    approvedDesignId: uuid("approved_design_id"),
    accountId: uuid("account_id"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    scheduleReason: text("schedule_reason"),
    recurrence: text("recurrence"), // null | weekly | monthly
    publishedAt: timestamp("published_at", { withTimezone: true }),
    liveUrl: text("live_url"),
    externalId: text("external_id"),
    publishAttempts: integer("publish_attempts").notNull().default(0),
    lastError: text("last_error"),
    manualInstructions: text("manual_instructions"),
    idempotencyKey: text("idempotency_key"),
    feedback: text("feedback"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("posts_status_idx").on(t.status),
    uniqueIndex("posts_idempotency_idx").on(t.idempotencyKey),
  ],
);

export type BrandIssue = { rule: string; severity: "block" | "warn"; detail: string };

export const postVersions = pgTable("post_versions", {
  id: id(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  note: text("note"),
  editedBy: uuid("edited_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ───────────── Design ───────────── */

export type DesignParams = {
  layout: "poster" | "editorial" | "quote" | "stripe" | "arch";
  lead: "signal" | "hot" | "tangerine";
  canvas: "blush" | "shell" | "roseMist" | "candy" | "peach" | "peachCream";
  headline: string;
  emphasis: string; // the 2–3 words set in italic
  poster?: string; // one Anton statement
  script?: string; // one handwritten word
  body?: string;
  label?: string; // small label on a deep-red pill
  motifs: ("arch" | "flower" | "heart" | "badge" | "stripe")[];
  headlineScale: number;
  logoScale: number;
  textDensity: number; // 0.5–1.5
  imageUrl?: string;
};

export const designs = pgTable("designs", {
  id: id(),
  postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
  variant: integer("variant").notNull().default(1),
  format: text("format").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  params: jsonb("params").$type<DesignParams>(),
  svg: text("svg"),
  uploadPath: text("upload_path"),
  uploadMime: text("upload_mime"),
  source: text("source").notNull().default("ai"), // ai | upload | template
  status: text("status").notNull().default("proposed"), // proposed | approved | denied | changes_requested | superseded
  feedback: text("feedback"),
  parentId: uuid("parent_id"),
  isTemplate: boolean("is_template").notNull().default(false),
  templateName: text("template_name"),
  createdAt: createdAt(),
});

/* ───────────── Brand library & intelligence ───────────── */

export const assets = pgTable("assets", {
  id: id(),
  // guideline | strategy | logo | colour | font | template | photo | example | campaign | messaging | tone | language | reference
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  path: text("path"),
  mime: text("mime"),
  size: integer("size"),
  content: text("content"), // text guidance (e.g. the brand brief) used directly by the AI
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  isSourceOfTruth: boolean("is_source_of_truth").notNull().default(false),
  createdAt: createdAt(),
});

export const brandPreferences = pgTable(
  "brand_preferences",
  {
    id: id(),
    // voice | editorial | visual | seo | audience | performance | community
    area: text("area").notNull(),
    key: text("key").notNull(),
    description: text("description").notNull(),
    value: jsonb("value").$type<unknown>(),
    evidenceCount: integer("evidence_count").notNull().default(1),
    // learning → candidate (1 signal) | learned (repeated) | confirmed (owner locked) | dismissed
    state: text("state").notNull().default("candidate"),
    lastEvidence: text("last_evidence"),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("brand_pref_key_idx").on(t.area, t.key)],
);

export const feedbackEvents = pgTable("feedback_events", {
  id: id(),
  area: text("area").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  action: text("action").notNull(),
  feedback: text("feedback"),
  signals: jsonb("signals").$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
});

/* ───────────── Integrations & publishing ───────────── */

export const accounts = pgTable("accounts", {
  id: id(),
  platform: text("platform").notNull(),
  handle: text("handle").notNull(),
  status: text("status").notNull().default("disconnected"), // connected | expired | error | disconnected
  mode: text("mode").notNull().default("live"), // live | sandbox
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  externalId: text("external_id"),
  timezone: text("timezone").notNull().default("Australia/Brisbane"),
  lastError: text("last_error"),
  connectedAt: timestamp("connected_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const oauthStates = pgTable("oauth_states", {
  state: text("state").primaryKey(),
  platform: text("platform").notNull(),
  codeVerifier: text("code_verifier"),
  createdAt: createdAt(),
});

/* ───────────── Analytics ───────────── */

export const postMetrics = pgTable("post_metrics", {
  id: id(),
  postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  capturedAt: createdAt(),
  impressions: integer("impressions").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  profileVisits: integer("profile_visits").notNull().default(0),
  watchTimeSeconds: integer("watch_time_seconds").notNull().default(0),
  completionRate: real("completion_rate"),
  isSandbox: boolean("is_sandbox").notNull().default(false),
});

export const accountMetrics = pgTable("account_metrics", {
  id: id(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  followers: integer("followers").notNull().default(0),
  newFollowers: integer("new_followers").notNull().default(0),
  unfollows: integer("unfollows").notNull().default(0),
  isSandbox: boolean("is_sandbox").notNull().default(false),
});

export const reports = pgTable("reports", {
  id: id(),
  kind: text("kind").notNull(), // daily | weekly | monthly | quarterly | campaign | competitor
  periodStart: text("period_start").notNull(),
  periodEnd: text("period_end").notNull(),
  title: text("title").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
});

/* ───────────── Community ───────────── */

export const interactions = pgTable("interactions", {
  id: id(),
  accountId: uuid("account_id").references(() => accounts.id),
  postId: uuid("post_id").references(() => posts.id),
  platform: text("platform").notNull(),
  kind: text("kind").notNull(), // comment | mention | dm
  externalId: text("external_id"),
  author: text("author").notNull(),
  text: text("text").notNull(),
  // positive | question | general | experience | advice | complaint | negative | sensitive | collaboration | spam
  category: text("category").notNull().default("general"),
  sensitive: boolean("sensitive").notNull().default(false),
  sensitiveReason: text("sensitive_reason"),
  needsPersonalResponse: boolean("needs_personal_response").notNull().default(false),
  suggestPrivate: boolean("suggest_private").notNull().default(false),
  priority: integer("priority").notNull().default(1), // 0 low – 3 urgent
  status: text("status").notNull().default("new"), // new | drafted | approved | replied | dismissed
  suggestedReply: text("suggested_reply"),
  replyText: text("reply_text"),
  repliedBy: uuid("replied_by").references(() => users.id),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  autoReplied: boolean("auto_replied").notNull().default(false),
  isSandbox: boolean("is_sandbox").notNull().default(false),
  receivedAt: createdAt(),
});

/* ───────────── Competitors ───────────── */

export const competitors = pgTable("competitors", {
  id: id(),
  name: text("name").notNull(),
  url: text("url"),
  handles: jsonb("handles").$type<Record<string, string>>().notNull().default({}),
  notes: text("notes"),
  createdAt: createdAt(),
});

/* ───────────── System ───────────── */

export const notifications = pgTable("notifications", {
  id: id(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  requiresAttention: boolean("requires_attention").notNull().default(true),
  read: boolean("read").notNull().default(false),
  createdAt: createdAt(),
});

export const activityLog = pgTable("activity_log", {
  id: id(),
  job: text("job").notNull(),
  status: text("status").notNull(), // started | ok | failed | skipped
  detail: text("detail"),
  createdAt: createdAt(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  userId: uuid("user_id").references(() => users.id),
  actor: text("actor").notNull(), // user email or "system"
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id"),
  detail: text("detail"),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});

export const jobLocks = pgTable("job_locks", {
  name: text("name").primaryKey(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
});
