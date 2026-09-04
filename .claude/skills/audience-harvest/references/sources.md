# Sources

Every place this skill can harvest real customer language from, what it actually takes to reach each one, and how to
query it. Access reality measured 2026-09-04. Where a source is blocked, this file says so plainly rather than handing
you a recipe that returns 403.

Two running examples are used throughout so sources can be compared like for like. **CONSUMER: "Nightfold"**, a
magnesium sleep drink sold to parents of young children. **B2B: "Ledgerpost"**, accounts-payable automation sold to
finance teams at 20 to 200 person companies. Neither is a real client. Never put a real client name in an example.

---

## Tier 1: OPEN. No login. Works from a server.

If a harvest runs unattended, it runs on this tier only. That is still a real harvest, not a fallback.

### 1.1 General web search

**Good for:** everything, as a discovery layer. This is how you find the forum thread, the review page and the video
you then read properly. **Useless for:** verbatim quotes on its own. A snippet is not an observation. Search finds the
door; the page reader walks through it.

**Access:** the WebSearch tool. No key, no session. Domain filters work on every site except those that block
Anthropic's crawler outright (reddit.com is the one that matters, see 2.1).

**Query it so it returns posts, not listicles.** Search the language of the moment, never the category. Force
user-generated pages with `site:`, with forum path shapes (`inurl:/t/`, `inurl:/threads/`, `inurl:viewtopic`), with
quoted first-person fragments (`"anyone else"`, `"am I the only one"`, `"I keep"`, `"has anyone"`), and with a year
appended to kill dead 2013 threads.

- Consumer (Nightfold): `"anyone else" "wake up at 3am" toddler tired forum 2026`, then `inurl:/t/ sleep "can't fall
  back asleep" parents`
- B2B (Ledgerpost): `"anyone else" "chasing approvals" invoices finance team`, then `inurl:/t/ "AP process"
  spreadsheet frustrating`

**Limits:** results are capped per query, so the skill is twenty narrow queries rather than four broad ones. Any query
phrased as a category ("best sleep supplement") returns pure commercial SEO. **Good harvest:** ten to thirty candidate
thread and review URLs. **Junk:** affiliate roundups, "top 10" pages, brand blogs, AI comparison pages, Quora-scraper
mirrors. Recognise them by title pattern and skip without reading.

### 1.2 Page reader for arbitrary URLs

**Good for:** turning a discovered URL into text. The workhorse; most quotes in a harvest arrive through it. **Useless
for:** anything behind a login, a Cloudflare interactive challenge, or comments that load only on scroll.

**Access:** WebFetch first (it respects robots.txt and will refuse disallowed sites). If it refuses or the page is
JS-heavy, `https://r.jina.ai/<full-url-including-https>` returns markdown, free without a key at roughly 20 requests
per minute. It fetches server-side, so it fails on the same bot-blocked hosts. It is not a way around a block. If both
fail and the page matters, it is a desktop job.

- Consumer (Nightfold): fetch the Discourse thread search surfaced, e.g.
  `https://<host>/t/anyone-else-awake-at-3am/48211`, and read replies 6 through 30. The first post states a problem;
  the replies contain the scenes.
- B2B (Ledgerpost): fetch a G2 or Capterra review page surfaced by search and read the "what do you dislike" field,
  which is where the friction is written.

**Limits:** 403 from Cloudflare, 429 from aggressive hosts, silent truncation on long threads. If a thread has 400
replies you get page one; append the site's own pagination (`?page=2`, `/page-3`). **Good harvest:** twelve verbatim
sentences from one 60-reply thread, each with a post permalink. **Junk:** cookie banners, nav chrome, related-article
blocks, and the same quote repeated because a reply quoted it. Deduplicate on the sentence, not the URL.

### 1.3 Hacker News via the Algolia API

**Good for:** developers, founders, engineering managers, technical buyers, SaaS, fintech, devtools, infra. The best
open source for a B2B harvest by a wide margin: long, first-person, full of specific workplace scenes. **Useless
for:** almost every consumer category. There is no HN conversation about postpartum vitamins or kids' shoes. Forcing
it returns a handful of contrarian technologists and skews the whole batch.

**Access:** `https://hn.algolia.com/api/v1/search`. HTTP 200, free, no key, no session. Confirmed working from a
server. Parameters that matter:

- `query` : the search string, URL-encoded
- `tags=comment` : return comments, not headlines. The important one. `tags=story` gives you titles, which are not
  customer voice.
- `hitsPerPage` : up to 1000, default 20. Use 100 and page with `page` (zero-indexed).
- `numericFilters` : `created_at_i>1735689600` (unix seconds) to cut old threads, `points>1` to cut noise.
  Comma-separate to combine.
- Sibling endpoint `/api/v1/search_by_date` sorts by recency instead of relevance. Use it when you want current
  language rather than the canonical old thread.

Fields you need: `hits[].comment_text` (HTML, must be unescaped), `.author`, `.objectID`, `.story_title`,
`.created_at`, `.points`. Store the permalink `https://news.ycombinator.com/item?id=<objectID>` as `source_url`, never
the API URL.

- Consumer (Nightfold), for the rare case it applies:
  `.../search?query=sleep%20deprivation%20newborn&tags=comment&hitsPerPage=100&numericFilters=created_at_i>1704067200`
  Expect thin results, keep two or three, do not pad.
- B2B (Ledgerpost):
  `.../search?query=accounts%20payable%20approval%20workflow&tags=comment&hitsPerPage=100&numericFilters=created_at_i>1704067200,points>1`
  then vary across the harvest bank: `"expense report"`, `"month end close"`, `"invoice approval"`, `"finance team
  spreadsheet"`, `"CFO asked me"`.

**Limits:** the documented ceiling is thousands of requests per hour per IP and you will not approach it, but parallel
bursts earn 429s. One sequential request per second is safe. `comment_text` contains `<p>`, `<a href>` and entities
like `&#x27;`; unescape before storing or the quote field carries markup and fails the verbatim rule. **Good
harvest:** eight to fifteen comments describing one specific work moment, for example "I have a folder in my inbox
called invoices with 340 unread emails in it and I open it every Friday and close it again." **Junk:** meta arguments
about the industry, "this is why X is broken" essays, corrections of other commenters, jokes. HN produces a lot of
well-written opinion containing no scene, and opinion is not an observation.

### 1.4 YouTube comments and transcripts

**Good for:** consumer categories with a review or get-ready-with-me culture (supplements, skincare, baby gear,
fitness, appliances, cars, gaming) and B2B software with a tutorial culture. Comments under a review video are the
closest open substitute for a Reddit thread. **Useless for:** categories nobody films, and useless if you only read
top comments, which are jokes and compliments.

**Access, comments:** YouTube Data API v3 `commentThreads.list`, with a free API key from a Google Cloud project.
Genuinely self-serve, about five minutes, the opposite of the Reddit situation.

```
https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies
  &videoId=<VIDEO_ID>&maxResults=100&order=relevance&textFormat=plainText
  &pageToken=<nextPageToken>&key=<API_KEY>
```
Read `items[].snippet.topLevelComment.snippet.textDisplay`, `.authorDisplayName`, `.likeCount`, `.publishedAt`.
Provenance: `https://www.youtube.com/watch?v=<VIDEO_ID>&lc=<comment id>` links to the exact comment. Find videos with
`search.list?part=snippet&q=<terms>&type=video&maxResults=25`.

**Access, transcripts:** `yt-dlp --skip-download --write-auto-subs --sub-langs en --sub-format vtt <url>` or the
`youtube-transcript-api` package. A transcript is the creator's language, and the creator is a performer, not the
customer. Use comments for observations, transcripts for vocabulary only.

- Consumer (Nightfold): search `magnesium for sleep honest review` and `why I wake up at 3am`, take the five videos
  with the most comments, pull 200 each at `order=relevance`, then a second pass at `order=time` for current language.
- B2B (Ledgerpost): search `NetSuite AP workflow tutorial` and `accounts payable process walkthrough`. Volume is
  lower, quality often higher, because commenters are practitioners asking real questions.

**Limits:** 10,000 quota units per day per project. `commentThreads.list` costs 1 unit, `search.list` costs 100, so
twenty searches plus hundreds of comment pages fits and two hundred searches does not. Comments disabled on a video
returns `commentsDisabled`, not an error. Transcript fetching from datacenter IPs is increasingly rate-limited or
refused; from a desktop it works. **Good harvest:** "I set three alarms because I don't trust myself and then I wake
up before the first one anyway", with 400 likes. Record the like count, it is your agreement signal. **Junk:** "who's
watching in 2026", timestamp lists, creator praise, bot spam for a competing product. Auto-filter comments under
roughly 40 characters; they are almost never observations.

### 1.5 App Store reviews (iOS)

**Good for:** any brand with an app and, more usefully, any brand whose competitors have one. Two and three star
reviews are richest: five is praise, one is rage, the middle is where people describe their day. **Useless for:**
categories with no app, and for pre-purchase moments. Reviewers are already customers, so you get the post-purchase
life, not the medicine-cabinet moment.

**Access:** the public RSS JSON feed, no key, no session.
`https://itunes.apple.com/us/rss/customerreviews/page=1/id=<APP_ID>/sortby=mostrecent/json` Find the id first with
`https://itunes.apple.com/search?term=<app+name>&entity=software&country=us&limit=10` and take `trackId`. Gotcha:
`feed.entry[0]` is the app itself, not a review. Real reviews start at index 1 and carry `author.name.label`,
`title.label`, `content[0].label`, `im:rating.label`, `im:version.label`.

- Consumer (Nightfold): there is no Nightfold app, so harvest the category. Pull the three largest sleep-tracking and
  habit apps, filter client-side to 2 and 3 stars, grep for the harvest-bank triggers: `3am`, `wake up`, `toddler`,
  `night shift`.
- B2B (Ledgerpost): pull the mobile apps of the incumbent expense and AP tools. B2B app reviews are short but often
  startlingly specific about a workplace scene.

**Limits:** hard ceiling of 10 pages by 50 reviews, so 500 per app per country, most-recent only. No server-side
rating filter. Country codes are separate pools; swap `/us/` for `/gb/`, `/ca/`, `/au/` only if the ICP is there.
**Good harvest:** thirty middle-rating reviews cut to the six containing a scene. **Junk:** "great app", crash
reports, complaints about the app's own subscription price, and reviews about a feature that no longer exists. A bug
report is not an observation.

### 1.6 Play Store reviews (Android)

**Good for:** as iOS, plus better coverage of price-sensitive and non-US audiences; Android review text is blunter and
longer. **Useless for:** the same as iOS, and thinner in premium and design-led categories.

**Access:** no official public review API. Use `google-play-scraper`.
```python
from google_play_scraper import reviews, Sort
result, token = reviews("com.example.sleepapp", lang="en", country="us",
                        sort=Sort.NEWEST, count=200, filter_score_with=2)
```
Node has the equivalent `gplay.reviews({appId, sort, num})`. Provenance:
`https://play.google.com/store/apps/details?id=<package>&reviewId=<id>`.

- Consumer (Nightfold): the same competitor sleep and habit packages, `filter_score_with=2` then `=3`, 200 each. B2B
  (Ledgerpost): incumbent finance packages, all ratings, count 200, since volume is low.

**Limits:** it is a scraper, not an API. Deep paging returns an empty continuation token or throttles. Keep to a few
hundred per app, delay between calls, and expect breakage when Google changes markup. **Good harvest and junk:** as
iOS, plus many empty-text ratings. Drop rows with no content before you count anything.

### 1.7 Discourse-style forums

**Good for:** hobby, health, parenting, fitness, finance and technical communities, consumer and B2B alike. The best
open source of long first-person writing there is. **Useless for:** mass-market categories with no enthusiast
community. There is no Discourse for paper towels.

**How to spot a Discourse instance**, which is worth learning because it unlocks a JSON API on hundreds of sites: URLs
shaped `/t/<slug>/<topic-id>` and `/c/<category>/<id>`; page source containing `<meta name="generator"
content="Discourse ...">`; `https://host/site.json` returning JSON instead of 404; a "Powered by Discourse" footer.
Other engines you will meet are XenForo (`/threads/<slug>.<id>/`), vBulletin (`showthread.php`) and phpBB
(`viewtopic.php`). None expose JSON; read those with the page reader plus explicit pagination.

**Access:**
```
https://host/search.json?q=<terms>&page=1
https://host/t/<topic-id>.json          -> full topic in post_stream.posts[].cooked
https://host/c/<category-slug>/<id>.json
https://host/latest.json
```
Search operators work inside `q`: `q=fridge%20category:sleep%20after:2025-01-01`, `q=<terms>%20order:latest`. `cooked`
is HTML; strip tags. Post permalink: `https://host/t/<slug>/<topic-id>/<post_number>`.

- Consumer (Nightfold): find the instance with `inurl:/t/ toddler sleep regression`, then hit its own search:
  `https://<host>/search.json?q=%223am%22%20after:2025-01-01`.
- B2B (Ledgerpost): ERP, bookkeeping and open-source finance communities run Discourse more often than you would
  guess. `https://<host>/search.json?q=approval%20chain%20invoice&page=1`.

**Limits:** many instances rate-limit anonymous JSON hard and answer 429 with `Retry-After`. One request every two
seconds is safe. Some require login to search: if `/search.json` is 403 while `/latest.json` works, fall back to
reading category pages. A few disable the JSON suffix entirely. **Good harvest:** twenty posts from four threads, each
a paragraph of real narration. **Junk:** moderator notices, "+1", quote-reply chains that duplicate text, and the one
prolific essayist. Cap yourself at two quotes per author so a single voice cannot dominate.

### 1.8 Stack Exchange and Lobsters (B2B only)

**Good for:** technical B2B buyers and practitioners; several topic sites map onto B2B categories. **Useless for:**
every consumer brand, and for emotion. The culture strips feeling out of posts, so you are mining the situation, not
the feeling.

**Access:**
`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=<terms>&site=<site>&filter=withbody`
Sites worth knowing: `workplace`, `money`, `softwareengineering`, `serverfault`, `security`, `stackoverflow`. Lobsters
exposes `https://lobste.rs/search.json?q=<terms>&what=comments&order=newest`.

- B2B (Ledgerpost): `...&q=invoice%20approval%20workflow&site=workplace&filter=withbody`. Consumer (Nightfold): skip.

**Limits:** 300 requests per day per IP without a key, 10,000 with a free key. The response carries a `backoff` field;
honour it or you get blocked. **Good harvest:** the setup paragraph of a question, usually a precise description of a
broken process. **Junk:** the answers, which are advice.

### 1.9 Quora and complaint sites

**Good for:** the "what did they Google" and "what did they lie about" corners of the bank. Complaint sites are strong
for cancellation, billing, and the moment someone gave up on a category. **Useless for:** balanced language. Everyone
on a complaint site is angry, so the harvest skews to the failure state. One source among five, never the backbone.

**Access:** Quora is heavily login-walled now. Treat it as discovery, not bulk: find answers with `site:quora.com
"<phrase>"` and try the page reader, of which roughly half render. ComplaintsBoard, PissedConsumer, SiteJabber and
ConsumerAffairs are mostly readable with the page reader and organised by company. BBB profile pages carry complaint
narratives. **Trustpilot returned 403 to a plain request on 2026-09-04**; it surfaces in web search and sometimes
renders through a reader with a browser user agent, and its official API needs a business account and key. Do not
build a harvest that depends on it.

- Consumer (Nightfold): `site:consumeraffairs.com OR site:complaintsboard.com "sleep supplement" subscription cancel`
- B2B (Ledgerpost): `site:sitejabber.com OR site:trustpilot.com "expense management" "support ticket"`

**Limits:** 403s are common and inconsistent. These sites are aggressively SEO-optimised, so surfacing them is easy
and getting body text is the hard part. **Good harvest:** "I cancelled in March and it charged me again in April and I
only noticed because I was checking whether I could afford the vet." That is a scene wrapped in a complaint. **Junk:**
pure invective, legal threats, and template complaints the same user posted across five sites.

### 1.10 Amazon and other retail reviews

**Good for:** any physical consumer product. Two and three star retail reviews are the densest open source of consumer
scenes: people explain their household, routine and reason for buying before they reach the product. **Useless for:**
B2B, services, anything not sold in a box, and pre-purchase moments.

**Access reality.** Amazon has no public review API and its review pages sit behind bot protection; a plain fetch will
not reliably work from a server. Two things do work.

1. **Web search to individual review pages**, then the page reader. Lower volume, real quotes.
2. **Bazaarvoice, Yotpo and PowerReviews endpoints on other retailers.** Many large retailers use a third-party review
   platform whose public JSON API is callable with a passkey embedded in the retailer's own page source. Open the
   product page source and search for `passkey` or `bazaarvoice`.

```
https://api.bazaarvoice.com/data/reviews.json?apiversion=5.4&passkey=<PASSKEY>
  &Filter=ProductId:<retailer product id>&Filter=Rating:2
  &Limit=100&Offset=0&Sort=SubmissionTime:desc
```
Yotpo equivalent: `https://api.yotpo.com/v1/widget/<app_key>/products/<product_id>/reviews.json`. Which retailer runs
which platform changes, so detect per site rather than memorising a list.

- Consumer (Nightfold): find three competitor sleep drinks at a large grocery or beauty retailer, detect the platform
  from page source, pull 100 reviews each at 2 and 3 stars, grep for `3am`, `my kid`, `night shift`, `I tried`.
- B2B (Ledgerpost): retail reviews do not apply. Substitute G2, Capterra and TrustRadius, found through web search
  rather than fetched directly, since all three sit behind Cloudflare and refuse plain requests. Read the ones that
  render.

**Limits:** Bazaarvoice `Limit` maxes at 100; page with `Offset`. Passkeys rotate occasionally. Amazon will 503 or
serve a captcha to repeated automated requests, so do not build a loop against it. **Good harvest:** "I keep it in the
kitchen because if it's in the bedroom I forget it exists", which is a better observation than anything the product
copy says. **Junk:** review-for-a-discount text, "arrived quickly", shipping and packaging complaints, one-line five
stars. Filter on length and rating before a human reads anything.

---

## Tier 2: LOGIN-GATED. Needs a signed-in browser on a desktop.

These are frequently the best sources. They are also why a full harvest cannot run unattended. Nothing here has a
zero-config path and this file will not pretend otherwise.

### 2.1 Reddit

**Good for:** consumer audiences, above every other source. Reddit is where people narrate the exact scenes the
harvest bank asks for, unprompted, at length, with agreement counts attached. Unequalled for parenting, health,
personal finance, hobbies and relationships, and strong for B2B when the ICP is technical or trade (sysadmins,
accountants, contractors, nurses). **Useless for:** brand facts, and any audience that is not on it (older luxury
buyers, most enterprise executives).

**Access reality, measured 2026-09-04. Read all four points before planning a harvest.**

1. The anonymous `.json` endpoint returns **HTTP 403 from datacenter IPs**, confirmed by direct test. It is an
   IP-class block, not a rate limit you can wait out.
2. The official API exists, but **new app registrations have been manually reviewed and largely refused since 2025-11.
   Do not tell anyone to just register an app.** That advice was true in 2023 and is false now. If the agency already
   holds a working client id from before the change, use it; if not, do not plan around getting one.
3. **Anthropic's crawler is blocked by reddit.com entirely**, so web search with a `site:reddit.com` filter and a
   direct page fetch both refuse. There is no read path through the general tools either.
4. **PullPush**, the Pushshift successor, answered **429 on repeated tries from a datacenter IP**. Not a reliable
   substitute.

**What actually works** is a signed-in browser session on a desktop, in one of two shapes: a CLI that reuses the local
Chrome or Firefox cookie jar for `reddit.com`, or the same CLI with the session cookie pasted in by hand. Either way
the requirement is identical: a real account that is yours, a real browser profile, a residential IP, a human at the
machine. With that, ordinary endpoints answer:

```
https://old.reddit.com/r/<subreddit>/search/?q=<terms>&restrict_sr=1&sort=top&t=year
https://old.reddit.com/search/?q=<terms>&sort=relevance&t=year
https://old.reddit.com/r/<subreddit>/comments/<post_id>/.json?limit=500
```
`old.reddit.com` is far easier to parse than the current site. Provenance is the `permalink` field prefixed with
`https://www.reddit.com`.

- Consumer (Nightfold): search inside subreddits rather than site-wide. `r/sleep`, `r/beyondthebump`, `r/toddlers`,
  `r/insomnia`, for `"3am" OR "can't fall back asleep"`, sorted top, past year. Then read the comment trees, not the
  post titles.
- B2B (Ledgerpost): `r/accounting`, `r/bookkeeping`, `r/smallbusiness`, for `"approval" invoice` and `"month end"`,
  sorted top, past year.

**Limits with a session:** roughly 60 requests per minute is the traditional ceiling and staying below it is both
polite and safe. Account bans for scraping are real. Never use a client's account and never one that is not yours.
**Good harvest:** twenty comments with scores, from six threads across three subreddits. Score is the best agreement
signal available anywhere in this file. **Junk:** the top comment is often a joke and the most-upvoted chain is often
meta. The material is at depth 2 and 3 in threads with 200 to 800 comments. Check dates, since karma-farming reposts
of old stories are common.

### 2.2 Twitter / X

**Good for:** the trend-shape prompts ("put a finger down if", "toxic trait: I") and cultural moments phrased as one
line; decent for B2B where the category has a professional community there. **Useless for:** depth. A tweet is a
punchline, which is closer to a finished ad line than to an observation, and that closeness is exactly what makes it
tempting and slightly dangerous. You are not there to lift someone's joke.

**Access reality:** the v2 API **returns 401 without paid auth**. Practical access is cookies (`auth_token` plus
`ct0`) from a signed-in desktop browser, with `x-csrf-token` set equal to the `ct0` value. Any tool that harvests X
either wraps that or bills you for API access.

- Consumer (Nightfold): `"3am" (toddler OR baby) -filter:links`, and `"toxic trait" sleep`, latest.
- B2B (Ledgerpost): `"month end" close (spreadsheet OR chasing) -filter:links`, and `"finance team" (nightmare OR
  chaos)`.

**Limits:** aggressive per-session rate limiting that shows up as empty result pages rather than errors, poor coverage
of older posts, and sessions that get invalidated regularly. **Good harvest:** five to eight one-liners that are
clearly lived rather than written for engagement. **Junk:** engagement bait, threads that are ads, reply-guy noise,
anything that reads like a brand wrote it.

### 2.3 Instagram

**Good for:** comment sections under creator posts in visual categories (beauty, fitness, fashion, food, baby).
Comments under a relatable-meme account are a concentrated dose of "that's me" moments. **Useless for:** B2B entirely,
and anything text-heavy.

**Access reality:** requires a signed-in desktop session; there is no anonymous path to comments. Hashtag browsing has
been substantially reduced and is no longer reliable discovery. The practical route is a human opening a specific
post's comments and copying verbatim lines with the post permalink.

- Consumer (Nightfold): open the two largest parenting-meme accounts, find posts about night waking, read the top 100
  comments, keep the ones that are a scene rather than a tag.
- B2B (Ledgerpost): skip. Do not spend the time.

**Limits:** manual, slow, and not automatable within the terms. Budget twenty minutes of a person's time, not a
scripted pass. **Good harvest:** eight comments describing the same recognisable moment in different words, where the
repetition is itself the finding. **Junk:** friend tags, emoji-only replies, the account's own replies.

### 2.4 Facebook groups

**Good for:** local, health, hobby and parenting audiences, and small-business-owner audiences in B2B. Group posts are
long, sincere and specific. **Useless for:** anything programmatic. The hardest source in this file.

**Access reality:** the Graph API has no path to public group content for third parties and group content is not
dependably indexed by search. Access means a person, logged in to their own account, reading a group they already
legitimately belong to, on a desktop.

- Consumer (Nightfold): a large regional parenting group, searched within for "sleep", last ninety days.
- B2B (Ledgerpost): owner and bookkeeper groups, searched within for "invoices" or "getting paid".

**Limits:** entirely manual. Many groups are private, and joining a group in order to harvest it is a bad idea
ethically and practically. **Good harvest:** three or four long posts that read like a diary entry. **Junk:** any
group whose members are mostly other marketers.

### 2.5 LinkedIn

**Good for:** the vocabulary of a B2B audience, what they call their job, their tools and their problem. Occasionally
good for the "what did I lie about to seem more together" prompt, since LinkedIn is where people perform competence.
**Useless for:** honest customer voice. Almost everything there is written for peers and recruiters, and the gap
between a LinkedIn post and the same person's HN comment is exactly the gap between an angle and an observation.

**Access reality:** aggressive blocking of unauthenticated requests, and automated collection is against the terms.
Some posts are indexed and readable through search plus a reader; comments almost never are. Assume desktop and
manual.

- B2B (Ledgerpost): `site:linkedin.com/posts "accounts payable" "every month"` and read what renders. Expect a low
  yield. Consumer (Nightfold): skip.

**Limits:** low yield, high effort, real scraping enforcement. Rank it below HN, Stack Exchange and industry Discourse
for every B2B harvest. **Good harvest:** two or three lines of real job vocabulary you did not have before. **Junk:**
the entire genre of the LinkedIn success anecdote.

### 2.6 TikTok comments

**Good for:** the trend-shape section of the bank, which was largely derived from TikTok formats in the first place.
Comment sections on relatable content are the best living source of "that's me" language for consumer audiences under
40. **Useless for:** B2B, and any audience over about 55.

**Access reality:** there is no public API for comments. The Research API is restricted to approved academic
researchers in specific regions and is not available to an agency. Practical access is a signed-in desktop session and
a human reading comment sections, or browser automation on that desktop, which sits close to the terms line.

- Consumer (Nightfold): search the app for "3am wake up" and "sleep deprived parent", open the five highest-view
  videos, read the top 100 comments on each.
- B2B (Ledgerpost): the finance corner exists, it is thin, and it does not justify a session on its own.

**Limits:** manual, region-sensitive results, and comment ranking that changes between sessions. **Good harvest:** the
pinned comment and its top three replies, which is often where the sharpest phrasing lives. **Junk:** sound-related
comments, tags, creator replies.

---

## Tier 3: NOT WORTH IT, or actively misleading

Ordered by how much time each will waste before you notice.

- **LLM web-search plugins asked for verbatim Reddit quotes.** Tested 2026-09-04: returned only marketing articles
  *about* Reddit, not real quotes, at roughly **$0.26 per query**. Expensive, and the output looks like a harvest
  while containing none. **Secondhand articles about what Reddit says are not customer voice and must be rejected**,
  however confidently they are cited.
- **Registering a Reddit API app.** Manual review, mostly refused since 2025-11. Never present it as a quick step.
- **PullPush and other Pushshift successors.** 429 on repeated tries from a datacenter IP. Try once from a desktop if
  you like; do not design around it.
- **Google cache.** Retired. Not a way around a 403 any more.
- **The brand's own testimonials, case studies and review widget.** Curated by definition and often edited. This is
  marketing copy wearing a customer's name. It can confirm vocabulary; it cannot produce an observation.
- **AI-generated review summaries** and "customers say" blurbs on retail sites. These are themes, and themes are
  exactly what the observation standard forbids.
- **Market research reports and survey PDFs.** "62 percent of parents report sleep difficulty" is a statistic. Nobody
  recognises themselves in a percentage in one second.
- **Nitter mirrors** (dead or unreliable), **Product Hunt comments** (congratulation and reciprocity, no friction
  expressed), **Pinterest** (aspiration boards, not sentences), and **Medium, Substack and SEO listicles** (written for
  search engines; a numbered list in the title means it is not customer voice).
- **Discord.** Private by expectation even when the server is open. Quoting a Discord message in a client deck is a
  consent problem, not a technical one. Skip.
- **Glassdoor** (employees, not customers, unless the ICP genuinely is the employee, in which case it moves to Tier 2
  and needs a session) and **Yelp and Nextdoor** (local service brands only, and even then the language is about one
  location rather than the category).

---

## Where a harvest should run

**Server profile, unattended, no session:** web search, page reader, Hacker News Algolia, YouTube comments and
transcripts, App Store RSS, Play Store scraper, Discourse JSON, Stack Exchange, Bazaarvoice and Yotpo retail reviews,
complaint sites. Eleven sources, and a real harvest. A B2B harvest can be excellent from this profile alone, because
HN, Stack Exchange and industry Discourse are where B2B customers actually write.

**Desktop profile, a human with a browser and a residential IP:** all of the above plus Reddit, X, Instagram, Facebook
groups, LinkedIn and TikTok. A consumer harvest is meaningfully better here, mostly because of Reddit.

**Decide before you start and say which you ran.** A harvest that silently skipped Reddit and did not mention it is a
lie by omission. The coverage note must list what was searched, what was skipped and why.

### What each harvest-bank heading can be covered from without a session

- **PHYSICAL MOMENTS** (fridge, 2 A.M., 6 A.M., 3 P.M., the parked car): weakest without Reddit. Best open substitutes
  are YouTube comments under relatable-content videos, Discourse threads whose title is already a moment, and the
  narrative preamble in 2 and 3 star retail reviews.
- **CONVERSATIONS THEY WOULD HAVE OR OVERHEAR:** Discourse and forum threads, complaint narratives, and HN for the
  work-conversation versions.
- **INTERNET AND PHONE BEHAVIORS:** app store reviews (subscriptions, forgotten charges, cancel flows), complaint
  sites for billing, YouTube comments for the rest.
- **TREND-SHAPE BEHAVIORS:** genuinely gated. These formats live on TikTok, X and Instagram. Without a session,
  coverage here is thin, and the honest move is to say so rather than write the format yourself from memory.
- **"THAT'S ME" CULTURAL MOMENTS:** YouTube comments and forum threads carry some. Reddit and TikTok carry most.

### The substitutes for Reddit, and the honest limit of them

For a consumer audience with no Reddit session, the best open stack is, in order: **YouTube comments** under category
review and relatable-content videos, closest in shape to a Reddit thread and the only open source with a usable
agreement signal; **Discourse and enthusiast forum threads** found through web search, the longest writing available
openly; **retail and app reviews at 2 and 3 stars**, read for the setup paragraph rather than the verdict; and
**complaint sites** for the cancel, churn and billing moments.

**These are a substitute, not an equal.** Two differences matter and both belong in the coverage note. They are
**product-anchored**: reviews and comments are written about a product, so the harvest skews to the post-purchase
life, what the product did or did not do, while Reddit gives you the pre-purchase, brand-absent moment where the
strongest observations come from. Expect a review-heavy harvest to over-supply "it didn't work for me" and
under-supply "standing in front of the fridge." And the **agreement signal is weaker**: YouTube likes are the only
decent proxy, and they measure a comment's wit as much as its truth.

If a batch depends on the physical-moment and trend-shape sections of the bank, the harvest needs a desktop session,
and the honest recommendation is to say that rather than deliver a review-only harvest as though it were complete.

---

## Terms of service and rate limiting

The point of this skill is that everything in it is true and traceable. That standard applies to how the material is
collected, not only to what it says.

**Harvest at a human pace.** One request per second to any single host, one every two seconds to a Discourse instance,
sequential rather than parallel. No deadline justifies hammering a volunteer-run forum. If a host returns 429 with
`Retry-After`, honour it exactly.

**Respect robots.txt and site terms.** If a site disallows crawling, the answer is not a different user agent. It is
either a human reading the page on a desktop, or the source is skipped and named in the coverage note.

**Never authenticate as someone else.** Your own accounts and your own sessions only. Never a client's account, never
a shared login, never an account created to get into a group in order to harvest it. A session cookie is a credential:
never committed, never pasted into a shared doc, never sent to a third-party service.

**Store only public content.** Take the quote, the URL, the platform, the approximate date and the agreement count. Do
not store usernames, profile links, avatars, or anything identifying a private individual beyond what the quote itself
requires. If a post carries someone's health details, name or location, cut it or trim it to the moment before
storing.

**Quote, do not republish.** A harvest carries short verbatim excerpts attributed to a URL, which is quotation.
Copying whole threads, whole reviews, or a bulk archive of a forum into a client deliverable is republication and is
not what this is. Keep excerpts to what the observation needs, usually one or two sentences.

**When a source will not yield, say so.** The output format has a coverage note for exactly this. A short honest
harvest that names its gaps is worth more to the concept generator than a long one padded with plausible inventions,
because the entire value of this skill is that the lines in it are true.
