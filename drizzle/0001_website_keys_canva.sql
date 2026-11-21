CREATE TABLE "app_secrets" (
	"name" text PRIMARY KEY NOT NULL,
	"encrypted_value" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'going' NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_rsvps_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"location" text,
	"online_url" text,
	"capacity" integer,
	"price_note" text,
	"brand_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_hash" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "newsletter_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"preheader" text,
	"intro" text DEFAULT '' NOT NULL,
	"article_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"closing" text,
	"brand_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_hash" text,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"send_requested_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"confirmation_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "subscribers_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "excerpt" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "seo_title" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "meta_description" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "is_demo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "brand_issues" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "approved_hash" text;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "published_by" uuid;--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "canva_design_id" text;--> statement-breakpoint
ALTER TABLE "designs" ADD COLUMN "canva_edit_url" text;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_issue_id_newsletter_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_issues" ADD CONSTRAINT "newsletter_issues_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rsvp_once_idx" ON "event_rsvps" USING btree ("event_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_once_idx" ON "newsletter_deliveries" USING btree ("issue_id","subscriber_id");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_slug_unique" UNIQUE("slug");