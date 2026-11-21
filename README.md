# SBF Studio

The Simply Being Female editorial intelligence and social media platform. One integrated workflow:

**Research → Daily News approval → Editorial brief → Social content approval → Design approval → Scheduling → Publishing → Archive → Analytics → Learning**

Every step that touches the public needs a human approval, and every approval is recorded with who and when.

---

## Quick start (local)

Requirements: Node.js 20 or newer. No database install is needed: local development uses an embedded PostgreSQL (PGlite).

```bash
npm install
npm run setup     # creates .env.local with secure secrets and your owner login
npm run dev       # http://localhost:3000
```

Sign in with the `SBF_OWNER_EMAIL` and `SBF_OWNER_PASSWORD` in `.env.local`. Change the password in **Settings → Team and access**.

Without an `ANTHROPIC_API_KEY` the platform runs in **demo mode**: research, briefs and captions are clearly labelled samples with placeholder sources and no statistics, and demo posts can only be published to sandbox accounts. Add the key to `.env.local` and restart for live research.

```bash
npm test          # workflow, safeguard and brand-rule tests
npm run typecheck
npm run build
```

## What's where

| Area | Path |
| --- | --- |
| Pages (15 dashboard sections, login) | `src/app/(app)/*`, `src/app/login` |
| Server actions (every button) | `src/app/(app)/actions.ts` |
| API routes (images, OAuth callback, cron, exports) | `src/app/api/*` |
| Database schema and migrations | `src/db/schema.ts`, `drizzle/` |
| Workflow orchestration and approval safeguards | `src/lib/workflow.ts` |
| Daily research engine (Claude + web search, source verification, topic memory) | `src/lib/research.ts` |
| Briefs, social suites, revisions | `src/lib/content.ts` |
| Design engine (brand-rule SVG renderer, feedback interpretation, PNG export) | `src/lib/design/*` |
| Brand brief, colour tokens, automatic brand checker | `src/lib/brand/*` |
| Brand Intelligence (learning from approvals, edits, feedback) | `src/lib/learning.ts` |
| Publishing (atomic claim, retries, manual flow, recurrence) | `src/lib/publishing.ts` |
| Social network adapters and OAuth | `src/lib/integrations/*` |
| Posting-time optimisation | `src/lib/scheduling.ts` |
| Community inbox (triage, sensitive-topic protection, replies) | `src/lib/community.ts` |
| Analytics and reports | `src/lib/analytics.ts` |
| Competitor intelligence | `src/lib/competitors.ts` |
| Automation engine (jobs, locks, activity log) | `src/lib/jobs.ts`, `src/lib/scheduler.ts`, `src/instrumentation.ts` |
| Retention and backups | `src/lib/maintenance.ts` |
| Tests | `tests/` |

## The approval safeguards (enforced in code, covered by tests)

1. No unapproved news story can enter the editorial pipeline (`generateContentForStory`, `onStoryApproved`).
2. No social content can be published without content approval (`assertPublishable`).
3. No design can be published without design approval, and a design can't be approved before its content.
4. A substantive edit after approval resets approval. A content hash is checked again at publish time, so even a direct database change is caught.
5. Sensitive community conversations (abuse, DV, self-harm, medical, legal, threats, allegations) get no drafted public reply and can never be auto-sent. Auto-replies are off unless the owner enables them, and then only for positive or general comments, never DMs.
6. Copy with exclamation marks, emoji, avoid-list words, war language, vague CTAs, a rewritten tagline, or any statistic that isn't linked to a verified source is blocked before approval. The owner can override, and that is audit-logged.
7. A post is never marked published until the network confirms it, or until the owner pastes the live URL for manual posts.
8. Duplicate publishing is prevented by an atomic status claim plus an idempotency key.
9. Demo content can't reach a live account.

## Automation (Australia/Brisbane time)

| Job | When |
| --- | --- |
| Daily research | 6:00 am |
| Breaking news and developments on approved stories | 9 am, 12 pm, 3 pm, 6 pm |
| Publish due posts | every minute |
| Community sync | every 15 minutes |
| Analytics sync | every 6 hours |
| Token refresh | every 4 hours |
| Morning summary | 8:00 am |
| Weekly report and competitor review | Mondays 7:00 am |
| Monthly and quarterly reports | 1st of the month / quarter |
| Retention clean-up and local backup | 2:30 am |

Jobs run inside the Next.js server (`src/instrumentation.ts`) with database locks, so they never double-run. On serverless hosting, set `DISABLE_SCHEDULER=1` and call `POST /api/cron/<job>` (e.g. `/api/cron/research-daily`) with `Authorization: Bearer $CRON_SECRET` from your host's cron.

## AI

All model calls go through `src/lib/ai/client.ts` using the official Anthropic SDK with `claude-opus-5-5`. Override with `SBF_AI_MODEL`.

- Research uses Anthropic's server-side web search. Every cited URL is checked against the URLs the search actually returned. Unconfirmed links are flagged, and unconfirmed statistics are dropped.
- Structured outputs (zod schemas) for stories, briefs, posts, triage and design feedback.
- Server-side refusal fallbacks are enabled (`fallbacks: "default"`), so a declined request is retried on a suitable model in the same call.
- The brand brief is the cached system prompt for every call. Learned preferences are appended but never override it.

## Social networks

Each network is one adapter object in `src/lib/integrations/adapters.ts`, registered in `registry.ts`. Adding a network means writing one adapter.

| Network | Auth | Direct publishing | Needs |
| --- | --- | --- | --- |
| Instagram | Meta OAuth | Posts, carousels (image) | `META_APP_ID/SECRET`, app review for `instagram_content_publish`, `PUBLIC_BASE_URL` |
| Facebook Pages | Meta OAuth | Posts, photos | `META_APP_ID/SECRET`, `pages_manage_posts` |
| Threads | Threads OAuth | Posts | `THREADS_APP_ID/SECRET`, `PUBLIC_BASE_URL` for images |
| LinkedIn | OAuth | Posts | `LINKEDIN_CLIENT_ID/SECRET`, optional `LINKEDIN_ORGANIZATION_URN` |
| X | OAuth 2 + PKCE | Posts (text) | `X_CLIENT_ID/SECRET`, paid API tier with write access |
| Pinterest | OAuth | Pins | `PINTEREST_APP_ID/SECRET`, `PINTEREST_BOARD_ID` |
| Bluesky | App password | Posts with image | an app password (Settings → App passwords in Bluesky) |
| TikTok | OAuth | Manual (notification + instructions) | Content Posting API audit before direct video posting |
| YouTube | Google OAuth | Manual | video upload to be added with video assets |

Tokens are AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`) and never sent to the browser. Every network page has an **Add sandbox for testing** button, so you can run the whole publishing flow without posting anything real.

The live adapters follow each network's published API, but they can't be exercised until the developer apps exist. Test each one with a real account before relying on it.

## Deployment

The app is a standard Next.js server. Recommended shape:

1. A managed PostgreSQL (Neon, Supabase, RDS, Azure). Set `DATABASE_URL`; migrations run automatically on start.
2. A Node host that stays running (Render, Railway, Fly.io, a VPS, Azure App Service), so the built-in scheduler works. On Vercel, use `DISABLE_SCHEDULER=1` plus Vercel Cron hitting `/api/cron/*`.
3. Persistent file storage for uploads. Local disk via `UPLOAD_DIR` works on a VM. For multi-instance hosting, swap `src/lib/files.ts` for S3, R2 or Azure Blob.
4. Set `APP_URL` and `PUBLIC_BASE_URL` to the public HTTPS address, and register `APP_URL/api/oauth/<network>/callback` as the redirect URI in each developer app.

## Fonts

`fonts/` holds the open-licence Google Fonts used for exported PNGs (Anton, Cormorant Garamond, Nunito Sans, Mrs Saint Delafield; see `fonts/OFL.txt`) and Brolia. Silk Serif ExtraLight is licensed: add its file to `fonts/` and it will be preferred over the Cormorant fallback.
