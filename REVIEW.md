# First version: items for your review and approval

Built overnight 21–22 November 2026. Nothing has been pushed, published or connected to a real account. Everything below is waiting on you.

## 1. Approvals I need from you

| # | Item | What happens when you approve |
| --- | --- | --- |
| 1 | **Push to GitHub.** The repo is committed locally (5 commits) with `origin` set to `github.com/Alyra08/Social-Media-Platform`. | I run `git push -u origin main`. Secrets (`.env.local`) and local data are git-ignored. |
| 2 | **Anthropic API key.** Add `ANTHROPIC_API_KEY` to `.env.local`. This turns on live research, briefs, captions, design feedback, inbox triage and reports. It costs money per run: the 6 am research sweep with web search is the largest daily cost. | Demo mode switches off and real research starts at 6:00 am Brisbane. |
| 3 | **Hosting choice.** An always-on Node host plus managed Postgres (README → Deployment). Needed for a public HTTPS address, which Instagram, Pinterest and Threads require to fetch images. | I set up deployment config for the host you choose. |
| 4 | **Social developer apps** (only you can create these; each needs your login and some need business verification): Meta (Instagram + Facebook, plus app review for publishing), Threads, LinkedIn (and the SBF company page), X (paid API tier for posting), Pinterest (and which board), TikTok (Content Posting API audit), Google/YouTube. Bluesky only needs an app password. | Paste the IDs and secrets into `.env.local`; each network then shows **Connect** in Integrations. |

## 2. Brand items to confirm

- **Logo file.** Upload the real wordmark in Brand library → type "Logos". Until then, designs use a typographic stand-in.
- **Silk Serif ExtraLight.** It's a licensed font I don't have. Headlines use the brief's fallback, Cormorant Garamond. Drop the licensed font file into `fonts/` and it's used automatically.
- **Where your two documents disagree, I followed the brand brief.** The master spec says "deep cherry red"; the brief says Signal Red #FD0019 and Deep Red #C80014. The spec's pillar is "empowering", but the brief bans "empower" as a verb. Please confirm.
- **The brand checker blocks** exclamation marks, emoji, avoid-list words, war language, vague CTAs, rewritten taglines and any statistic not linked to a verified source. You can override as owner (logged). Tell me if any rule is too strict.
- **Sensitive-comment wording.** On a domestic-violence or harm disclosure, the inbox suggests moving to private messages and sharing 1800RESPECT (1800 737 732) or 000. Please confirm you're happy with that.

## 3. Defaults I chose (all changeable in Settings)

- Research at 6:00 am, plus breaking-news checks at 9 am, 12 pm, 3 pm and 6 pm Brisbane. The breaking checks also watch stories you've already approved for new developments.
- Editorial balance 30 / 20 / 15 / 15 / 10 / 10 (from your spec).
- At most 2 posts per platform per day, and 48 hours between similar topics on the same platform.
- A preference is "learned" after 3 matching signals. One-offs are shown but not applied.
- Auto-replies are **off**. When on, they cover only positive or general comments, never DMs or sensitive topics.
- Retention: denied stories 180 days, read notifications 90 days, routine activity log 365 days, 8 daily database backups kept.
- Every network has a "sandbox" test account option, so you can rehearse publishing safely.

## 4. Try it

```powershell
cd "sbf-platform"; npm run dev
```

Open http://localhost:3000 and sign in with `SBF_OWNER_EMAIL` and `SBF_OWNER_PASSWORD` from `sbf-platform/.env.local`. Change the password in Settings → Team and access.

Suggested walk-through (demo mode):
1. Overview → Run research now
2. Daily news → Approve a story
3. Content approval → edit, then approve
4. Design approval → type "make the headline larger", then Revise with feedback, then Approve
5. Integrations → Add sandbox for Instagram
6. Publishing → Accept recommended time, then Publish now
7. Archive

Sample data from my test run is already in the local database, so you'll see one published sandbox post.

## 5. Verified vs not yet verified

**Verified:**
- 33 automated tests pass: every approval dependency, content-change detection, duplicate-publish prevention, retries and failures, manual-publish confirmation, demo-content blocking, sensitive-reply protection, brand rules, colour rules, design feedback, source verification with a simulated live search, the learning threshold and posting-time rules.
- Type-check, lint and the production build are clean.
- I clicked through the full demo workflow in the browser.
- All 22 screens load.
- No horizontal scrolling at phone width.

**Not yet verified (needs your keys or accounts):**
- Live Claude research and generation: written against the current SDK and type-checked, but never run with a real key.
- Every real social network connection and publish: written to each network's published API, but untested until the developer apps exist.
- Pulling follower counts and audience demographics: the analytics screens are ready, but no adapter fetches them yet.

## 6. Not built yet (next phases)

- Direct video upload to TikTok and YouTube. These currently go through the manual-publish flow with a notification and instructions.
- Canva Connect integration. Canva designs can be uploaded today.
- AI image generation for photos. The designs are typographic and brand-built; the arch shapes take your uploaded photos.
- Phase 5 items: public website, newsletter sending, membership, events.
- A privacy policy and Australian Privacy Act review of the community inbox data. This needs a human or legal review.

## 7. Things I changed on your computer

- Downloaded open-licence Google Fonts (Anton, Cormorant Garamond, Nunito Sans, Mrs Saint Delafield) from Google's official repository into `sbf-platform/fonts/`, and copied your Brolia fonts there.
- The local database, uploads and backups live in `%LOCALAPPDATA%\sbf-platform`, outside OneDrive, because syncing a live database can corrupt it. Consider moving the whole project out of OneDrive too, because `node_modules` is large and syncs slowly.
- `.env.local` holds generated secrets and your owner login. It's git-ignored; keep it private.
- Pinned and renamed this Claude session, and kept the computer awake while I worked.
