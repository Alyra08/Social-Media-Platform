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

---

# Second round: public website, Sunday note, events, Canva, keys in Settings

Built 22 November 2026. Nothing was published, emailed or connected to a real account.

## New
- **Keys and connections (Settings).** Paste any API key whenever you're ready: Anthropic, Resend email, Canva, each social network and the public web address. Keys are encrypted, switch on without a restart, show only their last four characters, and every change goes in the audit log.
- **Public website at `/site`.** Includes a home page, a searchable stories and knowledge hub with topics, article pages with SEO and sources, events with RSVPs, and the Sunday note sign-up. It has a sitemap, and search engines are told to index only the public site.
- **Website section in the studio.** Every story you approve gets an article here. You can write it, brand-check it, preview it, then approve and publish. A change after approval takes the article off the site until you approve it again. Articles built on demo research can't be published.
- **Sunday note.** Sign-ups need email confirmation. You approve each issue before it sends. Each subscriber gets an issue at most once, and every email has one-click unsubscribe. Until email is set up, sign-ups are still collected, and you can export the list and download issues as HTML to send from another tool.
- **Events.** You approve each listing before it goes live. Events can have a limit on places and a waitlist that moves people up automatically, and you can export the RSVP list.
- **Canva.** From Design approval you can open a copy of a design in Canva, or start a blank one at the right size. Bring it back and it goes through design approval as normal.

## Needs you
1. **Resend account** (for emails), with your sending domain verified there. Add the key and the "send from" address in Settings.
2. **Canva developer integration** at canva.com/developers. Use the redirect URL `<studio address>/api/oauth/canva/callback`. To test locally, open the studio at http://127.0.0.1:3000, because Canva doesn't accept "localhost".
3. **Privacy policy.** The site now collects names and emails for the Sunday note and events. This needs a privacy policy and an Australian Privacy Act check before launch.
4. **Your own domain** for the website, if you want one. Set `SITE_URL` in the hosting environment.

## Verified
- 49 automated tests pass (16 of them new): keys, approval and reset for articles, issues and events, brand blocks, demo blocking, sending only once, waitlist moving people up, safe article rendering, and the Canva import (against a simulated Canva).
- Type-check, lint and the production build are clean.
- In the browser: every public page loads, a test sign-up works, unknown pages return "not found", studio pages still need a login, and there's no sideways scrolling at phone width.

## Not verified
- The signed-in studio screens (Website, Settings → Keys, the Canva buttons) in the browser. I couldn't sign in because the login is in `.env.local`. The logic behind them is covered by the tests, and the build checks they compile.
- Real email sending through Resend, and the real Canva API. Both are written to the providers' published APIs but need your accounts.

## Not built yet
- Membership and member accounts, private discussion groups, user-submitted stories, paid events and ticketing.
