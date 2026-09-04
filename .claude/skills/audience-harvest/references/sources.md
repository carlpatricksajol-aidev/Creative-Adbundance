# Sources

Every place this skill can harvest real customer language from, what it actually takes to reach
each one, and how to query it. Access reality measured 2026-09-04. Where a source is blocked,
this file says so plainly rather than handing you a recipe that returns 403.

Two running examples are used throughout so you can compare sources like for like:

- **CONSUMER: "Nightfold"**, a magnesium sleep drink sold to parents of young children.
- **B2B: "Ledgerpost"**, accounts-payable automation sold to finance teams at 20 to 200 person
  companies.

Neither is a real client. Never put a real client name in an example.

Each entry gives: what audience it is good for, what audience it is useless for, the exact access
method, a consumer query, a B2B query, the limits you will actually hit, what a good harvest looks
like, and what junk it tends to return instead.

---

## Tier 1: OPEN. No login. Works from a server.

These are the sources a scheduled or server-side harvest can rely on. If a harvest runs unattended,
it runs on this tier only.

### 1.1 General web search

**Good for:** everything, as a discovery layer. This is how you find the forum thread, the review
page, the Discourse instance and the YouTube video you then read properly. It is the widest net
in the toolkit.

**Useless for:** verbatim quotes on its own. Search returns titles and snippets. A snippet is not
an observation. Search finds the door; the page reader walks through it.

**Access:** the WebSearch tool. No key, no session. Domain filters work on every site except the
ones that block Anthropic's crawler outright (reddit.com is the one that matters, see 2.1).

**How to query it so it returns forum posts and not listicles.** Search for the language of the
moment, not the category. Add operators that force user-generated pages:

- `site:` for a known forum or a Discourse instance
- `inurl:` for forum path shapes: `inurl:/t/`, `inurl:/threads/`, `inurl:viewtopic`
- quoted first-person fragments: `"I keep"`, `"anyone else"`, `"am I the only one"`, `"has anyone"`
- year filters to avoid dead 2013 threads: append `2025` or `2026`

**Consumer worked query (Nightfold):**
`"anyone else" "wake up at 3am" toddler tired forum 2026`
then
`inurl:/t/ sleep "can't fall back asleep" parents`

**B2B worked query (Ledgerpost):**
`"anyone else" "chasing approvals" invoices finance team frustration`
then
`site:news.ycombinator.com OR inurl:/t/ "AP process" "spreadsheet" complaint`

**Limits you will hit:** results are capped per query, so the skill is in running twenty narrow
queries rather than four broad ones. Commercial SEO content dominates any query phrased as a
category ("best sleep supplement"), which is why you phrase it as a sentence a person would type
at 3 A.M. instead.

**Good harvest:** a list of ten to thirty candidate URLs, each one a thread or a review page, which
you then read.

**Junk:** affiliate roundups, "top 10" pages, brand blog posts, AI-written comparison pages, and
Quora-scraper mirror sites. Recognise them by the title pattern and skip without reading.

### 1.2 Page reader for arbitrary URLs

**Good for:** turning a discovered URL into text. This is the workhorse. Most real quotes in a
harvest arrive through it.

**Useless for:** anything behind a login, anything behind Cloudflare's interactive challenge, and
anything that renders comments only after a client-side fetch triggered by scrolling.

**Access:**

1. The WebFetch tool first. It respects robots.txt and will refuse sites that disallow the crawler.
2. If WebFetch refuses or the page is JS-heavy, `https://r.jina.ai/<full-url-including-https>`
   returns the page as markdown. Free without a key at roughly 20 requests per minute; it fetches
   server-side, so it fails on the same bot-blocked sites, it is not a way around a block.
3. If the page is genuinely worth it and both fail, it is a desktop job (see Tier 2 and the run
   location section).

**Consumer worked example:** you found a Discourse parenting thread in search. Fetch
`https://<forum-host>/t/anyone-else-awake-at-3am/48211` and read every reply, not just the first
post. The first post states a problem; replies 6 through 30 contain the specific scenes.

**B2B worked example:** fetch a G2 or Capterra review page surfaced by search. Read the "what do
you dislike" field, which is where the real friction is written.

**Limits:** 403 from Cloudflare, 429 from aggressive hosts, and silently truncated pages on very
long threads. If a thread has 400 replies, the reader will give you the first page only; append
the site's own pagination (`?page=2`, `/page-3`) and fetch again.

**Good harvest:** twelve verbatim sentences from one 60-reply thread, each with the permalink to
the specific post where possible.

**Junk:** cookie banners, nav chrome, "related articles", and the same quote repeated because it
was quoted in a reply. Deduplicate on the sentence, not the URL.

### 1.3 Hacker News via the Algolia API

**Good for:** developers, founders, engineering managers, technical buyers, anyone in SaaS, fintech,
devtools, or infra. The single best open source for a B2B harvest. Comments are long, first-person,
and full of specific workplace scenes.

**Useless for:** almost every consumer category. There is no meaningful HN conversation about
postpartum vitamins, kids' shoes, skincare, or pet food. Do not force it; an HN harvest for a
consumer brand returns a handful of contrarian technologists and skews the whole batch.

**Access:** `https://hn.algolia.com/api/v1/search`. HTTP 200, free, no key, no session. Confirmed
working from a server.

Parameters that matter:

- `query` : the search string, URL-encoded
- `tags=comment` : return comments, not story titles. This is the important one. `tags=story` gives
  you headlines, which are not customer voice.
- `hitsPerPage` : up to 1000, default 20. Use 100 and page.
- `page` : zero-indexed
- `numericFilters` : `created_at_i>1735689600` (unix seconds) to cut old threads,
  `points>2` to cut noise. Comma-separate to combine.
- Sibling endpoint `https://hn.algolia.com/api/v1/search_by_date` sorts by recency instead of
  relevance. Use it when you want current language rather than the canonical old thread.

Response fields you need: `hits[].comment_text` (HTML, must be unescaped), `hits[].author`,
`hits[].objectID`, `hits[].story_title`, `hits[].created_at`, `hits[].points`.

Permalink for provenance: `https://news.ycombinator.com/item?id=<objectID>`. Store that as the
`source_url`, not the API URL.

**Consumer worked query (Nightfold), for the rare case it applies:**
```
https://hn.algolia.com/api/v1/search?query=sleep%20deprivation%20newborn&tags=comment&hitsPerPage=100&numericFilters=created_at_i>1704067200
```
Expect thin results. Read them, expect to keep two or three, and do not pad.

**B2B worked query (Ledgerpost):**
```
https://hn.algolia.com/api/v1/search?query=accounts%20payable%20approval%20workflow&tags=comment&hitsPerPage=100&numericFilters=created_at_i>1704067200,points>1
```
Then vary the query across the harvest bank: `"expense report"`, `"invoice approval"`,
`"month end close"`, `"finance team spreadsheet"`, `"CFO asked me"`.

**Limits:** the documented ceiling is high (thousands of requests per hour per IP) and you will not
approach it, but firing requests in parallel earns 429s. One request every second, sequential, is
safe. `comment_text` is HTML with `<p>`, `<a href>` and entities like `&#x27;`; unescape before
storing or your quote field will contain markup and fail the verbatim rule.

**Good harvest:** eight to fifteen comments describing a specific work moment. "I have a folder in
my inbox called 'invoices' with 340 unread emails in it and I open it every Friday afternoon and
close it again" is exactly the shape you want.

**Junk:** meta arguments about the industry, "this is why X is broken" essays, replies that are
purely a correction of another commenter, and jokes. HN produces a lot of well-written opinion
that contains no scene. Opinion is not an observation.

### 1.4 YouTube comments and transcripts

**Good for:** consumer categories with a review or "get ready with me" culture: supplements,
skincare, baby gear, fitness, appliances, cars, gaming. Also good for B2B software with a tutorial
culture. Comments under a review video are the closest open substitute for a Reddit thread.

**Useless for:** categories nobody films. Insurance, most B2B services, professional tools with no
consumer face. Also useless if you only read the top comments, which are jokes and compliments.

**Access, two halves.**

*Comments:* YouTube Data API v3, `commentThreads.list`. Needs a free API key from a Google Cloud
project. This is genuinely self-serve and takes about five minutes, which is the opposite of the
Reddit situation.

```
https://www.googleapis.com/youtube/v3/commentThreads
  ?part=snippet,replies
  &videoId=<VIDEO_ID>
  &maxResults=100
  &order=relevance          (or "time" for recent)
  &textFormat=plainText
  &pageToken=<from previous nextPageToken>
  &key=<API_KEY>
```

Fields: `items[].snippet.topLevelComment.snippet.textDisplay`, `.authorDisplayName`,
`.likeCount`, `.publishedAt`. Provenance URL:
`https://www.youtube.com/watch?v=<VIDEO_ID>&lc=<comment id>` links to the specific comment.

To find the videos, use `search.list?part=snippet&q=<terms>&type=video&maxResults=25`.

*Transcripts:* `yt-dlp --skip-download --write-auto-subs --sub-langs en --sub-format vtt <url>`,
or the `youtube-transcript-api` Python package. Transcripts give you the creator's language, which
is useful for how the category is talked about, but the creator is a performer, not the customer.
Prefer comments for observations and use transcripts for vocabulary.

**Consumer worked query (Nightfold):** search
`q=magnesium for sleep honest review` and `q=why I wake up at 3am`, take the five videos with the
most comments, pull 200 comments each with `order=relevance`, then a second pass with `order=time`
for recent language.

**B2B worked query (Ledgerpost):** search `q=NetSuite AP workflow tutorial` and
`q=accounts payable process walkthrough`, pull comments. Volume will be lower, quality is often
higher because the commenters are practitioners asking real questions.

**Limits:** the API gives 10,000 quota units per day per project. `commentThreads.list` costs 1
unit per call, `search.list` costs 100. So budget your searches: twenty searches plus hundreds of
comment pages fits comfortably; two hundred searches does not. Comments are disabled on some
videos and the API returns `commentsDisabled` rather than an error. Transcript fetching from
datacenter IPs is increasingly rate-limited or refused by YouTube; from a desktop it works.

**Good harvest:** "I set three alarms because I don't trust myself and then I wake up before the
first one anyway" from a comment with 400 likes. The like count is your agreement signal, record it.

**Junk:** "who's watching in 2026", timestamps lists, "first", creator praise, bot spam selling a
competing product, and the long comment that is a testimonial for something else entirely. Filter
comments under roughly 40 characters automatically; they are almost never observations.

### 1.5 App Store reviews (iOS)

**Good for:** any brand with an app, and, more usefully, any brand whose *competitors* have an app.
Two-star and three-star reviews are the richest: five-star is praise, one-star is rage, the middle
is where people describe their actual day.

**Useless for:** brands in a category with no app at all, and for pre-purchase moments. Reviewers
are already customers, so you get the post-purchase life, not the "standing in front of the
medicine cabinet" moment.

**Access:** the public RSS JSON feed. No key, no session.

```
https://itunes.apple.com/us/rss/customerreviews/page=1/id=<APP_ID>/sortby=mostrecent/json
```

Find the app id first:
```
https://itunes.apple.com/search?term=<app+name>&entity=software&country=us&limit=10
```
(the `trackId` in the result is the APP_ID).

Response gotcha: `feed.entry[0]` is the app itself, not a review. Skip it. Real reviews start at
index 1, and carry `author.name.label`, `title.label`, `content[0].label`, `im:rating.label`,
`im:version.label`.

**Consumer worked example (Nightfold):** there is no Nightfold app, so harvest the category. Pull
reviews for the three largest sleep-tracking and habit apps, filter to 2 and 3 stars, and search
the text for the harvest-bank moments: "3am", "wake up", "toddler", "shift".

**B2B worked example (Ledgerpost):** pull reviews for the mobile apps of the incumbent expense and
AP tools. B2B app reviews are short but often startlingly specific about a workplace scene.

**Limits:** hard ceiling of 10 pages by 50 reviews, so 500 reviews per app per country, most-recent
only. Different country codes are different pools: swap `/us/` for `/gb/`, `/ca/`, `/au/` to get
more, but only if the ICP is there. No filtering by rating server-side; filter client-side.

**Good harvest:** thirty middle-rating reviews, cut to the six that contain a scene.

**Junk:** "great app", "crashes on iOS 19", pricing complaints about the app's own subscription,
and reviews about a feature that does not exist any more. Bug reports are not observations.

### 1.6 Play Store reviews (Android)

**Good for:** the same as the App Store, plus better coverage of price-sensitive and non-US
audiences. Android review text tends to be blunter and longer.

**Useless for:** the same as the App Store. Also thinner for premium and design-led categories.

**Access:** there is no official public review API. Use the `google-play-scraper` library.

Python:
```python
from google_play_scraper import reviews, Sort
result, token = reviews(
    "com.example.sleepapp",
    lang="en", country="us",
    sort=Sort.NEWEST,
    count=200,
    filter_score_with=2,     # 2-star only; loop 2 then 3
)
```
Node has an equivalent `google-play-scraper` package with `gplay.reviews({appId, sort, num})`.
Provenance URL: `https://play.google.com/store/apps/details?id=<package>&reviewId=<id>`.

**Consumer worked example (Nightfold):** the same competitor sleep and habit apps, `filter_score_with=2`
and `=3`, 200 each.

**B2B worked example (Ledgerpost):** incumbent finance app packages, all ratings, count 200. Volume
is low so do not filter by score.

**Limits:** it is a scraper, not an API. Deep paging (beyond a few hundred) starts returning empty
`continuation_token` or throttles. Keep to a few hundred per app, add a delay between calls, and
accept that it can break when Google changes markup.

**Good harvest and junk:** as the App Store, plus more one-line ratings with no text at all. Drop
empty-content rows before you count anything.

### 1.7 Discourse-style forums

**Good for:** hobby, health, parenting, fitness, finance, and technical communities. Discourse
threads are the single best open source of long first-person writing. Consumer and B2B both.

**Useless for:** mass-market categories with no enthusiast community. There is no Discourse for
paper towels.

**How to spot a Discourse instance** (worth learning, it unlocks a JSON API on hundreds of sites):

- URLs shaped `https://host/t/<slug>/<topic-id>` and `https://host/c/<category>/<id>`
- page source contains `<meta name="generator" content="Discourse ...">`
- `https://host/site.json` returns JSON rather than 404
- a "Powered by Discourse" line in the footer

Other forum engines you will meet: XenForo (`/threads/<slug>.<id>/`, "Powered by XenForo"),
vBulletin and phpBB (`showthread.php`, `viewtopic.php`). None of those expose JSON; read them with
the page reader plus explicit pagination.

**Access for Discourse:**

```
https://host/search.json?q=<terms>&page=1
https://host/latest.json
https://host/t/<topic-id>.json          -> full topic with post_stream.posts[].cooked
https://host/c/<category-slug>/<id>.json
```
Search operators inside `q` work: `q=fridge%20category:sleep%20after:2025-01-01`,
`q=terms%20order:latest`. `post_stream.posts[].cooked` is HTML; strip tags. Permalink for a single
post: `https://host/t/<slug>/<topic-id>/<post_number>`.

**Consumer worked example (Nightfold):** find the instance first with search
(`inurl:/t/ toddler sleep regression forum`), then hit its own search:
`https://<host>/search.json?q=%223am%22%20after:2025-01-01`.

**B2B worked example (Ledgerpost):** ERP and accounting communities run Discourse more often than
you would guess, as do the open-source finance tools. Query
`https://<host>/search.json?q=approval%20chain%20invoice&page=1`.

**Limits:** many instances rate-limit anonymous JSON hard and answer 429 with a `Retry-After`
header. One request every two seconds is safe. Some instances require login even to search; if
`/search.json` returns 403 while `/latest.json` works, fall back to reading category pages. A few
instances disable the JSON suffix entirely.

**Good harvest:** twenty posts from four threads, each a paragraph of real narration.

**Junk:** moderator notices, "+1", quote-reply chains that duplicate text, and the one prolific
poster who writes essays. Cap yourself at two quotes per author so a single voice cannot dominate
the harvest.

### 1.8 Stack Exchange and Lobsters (B2B only)

**Good for:** technical B2B buyers and practitioners. Stack Exchange has topic sites well beyond
programming, and several map onto B2B categories.

**Useless for:** every consumer brand, and for emotion. Stack Exchange culture strips feeling out
of posts. You are mining for the situation, not the feeling.

**Access:** `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=<terms>&site=<site>&filter=withbody`
Sites worth knowing: `stackoverflow`, `serverfault`, `softwareengineering`, `money`,
`workplace`, `security`. Lobsters exposes `https://lobste.rs/search.json?q=<terms>&what=comments&order=newest`.

**B2B worked query (Ledgerpost):**
`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=invoice%20approval%20workflow&site=workplace&filter=withbody`

**Limits:** 300 requests per day per IP without a key, 10,000 with a free key. The response carries
a `backoff` field; honour it or you get blocked.

**Good harvest:** the setup paragraph of a question, which is usually a precise description of a
broken process. **Junk:** the answers, which are advice.

### 1.9 Quora and complaint sites

**Good for:** the "what did they Google" and "what did they lie about" corners of the harvest bank.
Complaint sites are strong for cancellation, billing, and the moment someone gave up on a category.

**Useless for:** balanced language. Everyone on a complaint site is angry, so the harvest skews
toward the failure state. Use them as one source among five, never as the backbone.

**Access:**

- Quora: heavily login-walled now. Treat it as a discovery source, not a bulk one. Find answers via
  web search (`site:quora.com "<phrase>"`), then try the page reader. Roughly half render.
- ComplaintsBoard, PissedConsumer, SiteJabber, ConsumerAffairs: mostly readable with the page
  reader, indexed well, and organised by company.
- BBB complaint narratives: `bbb.org` profile pages carry customer complaint text and reviews.
- Trustpilot: returned 403 to a plain request on 2026-09-04. It surfaces in web search results and
  sometimes renders through a reader with a browser user agent. The official Trustpilot API needs a
  business account and a key. Do not build a harvest that depends on it.

**Consumer worked query (Nightfold):**
`site:consumeraffairs.com OR site:complaintsboard.com "sleep supplement" subscription cancel`

**B2B worked query (Ledgerpost):**
`site:sitejabber.com OR site:trustpilot.com "expense management" "support ticket"`

**Limits:** 403s are common and inconsistent. These sites are aggressively SEO-optimised so search
surfaces them easily; getting the body text is the hard part.

**Good harvest:** "I cancelled in March and it charged me again in April and I only noticed because
I was checking whether I could afford the vet." That is a scene wrapped in a complaint.

**Junk:** pure invective, legal threats, and duplicated template complaints posted by the same user
across five sites.

### 1.10 Amazon and other retail reviews

**Good for:** any physical consumer product. Retail reviews at 2 and 3 stars are the densest open
source of consumer scenes: people explain their household, their routine and their reason for
buying before they get to the product.

**Useless for:** B2B, services, and anything not sold in a box. Also useless for pre-purchase
moments, same limitation as app reviews.

**Access reality.** Amazon itself has no public review API and its review pages are behind bot
protection; a plain fetch will not reliably work from a server. Two things do work:

1. **Web search to individual review pages**, then the page reader. Lower volume, real quotes.
2. **Bazaarvoice, Yotpo and PowerReviews endpoints on other retailers.** Many large retailers use a
   third-party review platform whose public JSON API is callable with a passkey that is embedded in
   the retailer's own page source. Open the product page source and search for `passkey` or
   `bazaarvoice`. Then:

```
https://api.bazaarvoice.com/data/reviews.json
  ?apiversion=5.4
  &passkey=<PASSKEY from the retailer page source>
  &Filter=ProductId:<retailer product id>
  &Filter=Rating:2
  &Limit=100
  &Offset=0
  &Sort=SubmissionTime:desc
```
Yotpo equivalent: `https://api.yotpo.com/v1/widget/<app_key>/products/<product_id>/reviews.json`.

Which retailer uses which platform changes, so detect it per site rather than memorising a list.

**Consumer worked example (Nightfold):** find three competitor sleep drinks on a large grocery or
beauty retailer, detect the review platform from page source, pull 100 reviews each at 2 and 3
stars, and grep for the harvest-bank triggers: "3am", "my kid", "night shift", "I tried".

**B2B worked example (Ledgerpost):** retail reviews do not apply. Substitute G2, Capterra and
TrustRadius, found through web search rather than fetched directly (all three sit behind Cloudflare
and refuse plain requests). Read the "what do you dislike about" sections on the pages that render.

**Limits:** `Limit` maxes at 100 per Bazaarvoice call; page with `Offset`. Passkeys are per-retailer
and rotate occasionally. Amazon will 503 or serve a captcha page to repeated automated requests;
do not build a loop against it.

**Good harvest:** "I keep it in the kitchen because if it's in the bedroom I forget it exists" is a
better observation than anything the product copy says.

**Junk:** review-for-a-discount text, "arrived quickly", shipping and packaging complaints, and the
one-line five-star. Filter on length and rating before a human reads anything.

---

## Tier 2: LOGIN-GATED. Needs a signed-in browser on a desktop.

These sources are frequently the best ones. They are also the reason a full harvest cannot run
unattended on a server. Nothing here has a zero-config path, and this file will not pretend
otherwise.

### 2.1 Reddit

**Good for:** consumer audiences, above every other source. Reddit is where people narrate the
exact scenes the harvest bank asks for, unprompted, at length, with agreement counts attached. For
parenting, health, personal finance, hobbies and relationships it has no equal. Also strong for
B2B when the ICP is technical or trade (sysadmins, accountants, contractors, nurses).

**Useless for:** brand facts, and any audience that does not use it (older luxury buyers, most
enterprise executives).

**Access reality, measured 2026-09-04. Read all four points before planning a harvest.**

1. The anonymous `.json` endpoint (`https://www.reddit.com/r/<sub>/search.json?...`) returns
   **HTTP 403 from datacenter IPs**. Confirmed by direct test. It is not a rate limit you can wait
   out; it is an IP-class block.
2. The official Reddit API still exists, but **new app registrations have been manually reviewed
   and largely refused since 2025-11**. Do not tell anyone to "just register an app." That advice
   was true in 2023 and is not true now. If the agency already holds a working client id from
   before the change, use it; if not, do not plan around getting one.
3. **Anthropic's crawler is blocked by reddit.com entirely.** So web search with a
   `site:reddit.com` filter and a direct page fetch both refuse. There is no read path through the
   general search or reader tools either.
4. **PullPush**, the Pushshift successor, answered **429 on repeated tries from a datacenter IP**.
   It is not a reliable substitute.

**What actually works:** a signed-in browser session on a desktop. Two shapes:

- A CLI that reuses the local Chrome or Firefox cookie jar for `reddit.com` and issues requests as
  that logged-in user, from the desktop's own residential IP.
- The same thing with the session cookie pasted into the CLI by hand.

Either way the requirement is the same: a real account, a real browser profile, a residential IP,
and a human at the machine. Once you have that, the ordinary endpoints answer:

```
https://old.reddit.com/r/<subreddit>/search/?q=<terms>&restrict_sr=1&sort=top&t=year
https://old.reddit.com/search/?q=<terms>&sort=relevance&t=year
https://old.reddit.com/r/<subreddit>/comments/<post_id>/.json?limit=500
```
`old.reddit.com` is far easier to parse than the current site. Permalink for provenance is the
`permalink` field prefixed with `https://www.reddit.com`.

**Consumer worked query (Nightfold):** run inside the relevant subreddits rather than site-wide.
`r/sleep`, `r/beyondthebump`, `r/toddlers`, `r/insomnia`, searched for
`"3am" OR "can't fall back asleep"`, sorted top, past year. Then read the comment trees, not the
post titles.

**B2B worked query (Ledgerpost):** `r/accounting`, `r/bookkeeping`, `r/smallbusiness`, searched for
`"approval" invoice frustrating` and `"month end"`, sorted top, past year.

**Limits with a session:** roughly 60 requests per minute is the traditional ceiling and behaving
below that is both polite and safe. Account bans for scraping are real. Never use a client's
account, never use an account that is not yours, and never log in as someone else.

**Good harvest:** twenty comments, each with a score, from six different threads across three
subreddits. Score is your agreement signal and Reddit is the only open-ish source that gives you a
good one.

**Junk:** the top comment is often a joke. The most-upvoted reply chain is often meta. The real
material is at depth 2 and 3 in threads with 200 to 800 comments. Also beware the karma-farming
repost of an old story; check the date.

### 2.2 Twitter / X

**Good for:** the trend-shape prompts in the harvest bank ("put a finger down if", "toxic trait: I")
and for cultural moments phrased as one line. Good for B2B when the category has a professional
community on the platform.

**Useless for:** depth. Posts are short, context-free, and performative. A tweet is a punchline,
which is closer to a finished ad line than to an observation, and that closeness makes it tempting
and slightly dangerous. You are not there to lift someone's joke.

**Access reality:** the v2 API **returns 401 without paid auth**. Practical access is cookies
(`auth_token` plus `ct0`) taken from a signed-in browser on a desktop, sent with `x-csrf-token`
set equal to the `ct0` value. Any tool that harvests X either wraps that or bills you for API
access.

**Consumer worked query (Nightfold):** `"3am" (toddler OR baby) -filter:links` and
`"toxic trait" sleep`, sorted latest.

**B2B worked query (Ledgerpost):** `"month end" close (spreadsheet OR chasing) -filter:links` and
`"finance team" (nightmare OR chaos)`.

**Limits:** aggressive per-session rate limiting that manifests as empty result pages rather than
errors. Search coverage of older posts is poor. Sessions get invalidated regularly.

**Good harvest:** five to eight one-liners that are clearly lived rather than written for engagement.
**Junk:** engagement bait, threads that are ads, reply-guy noise, and anything that reads like it
was written by a brand.

### 2.3 Instagram

**Good for:** comment sections under creator posts in visual categories (beauty, fitness, fashion,
food, baby). The comments under a relatable-meme account in the category are a concentrated dose of
"that's me" moments.

**Useless for:** B2B entirely, and for anything text-heavy.

**Access reality:** requires a signed-in session on a desktop. There is no anonymous path to comments.
Hashtag browsing has been substantially reduced and is no longer a reliable discovery method. The
practical route is a human on a desktop, opening the comment section of a specific post and copying
verbatim lines with the post permalink.

**Consumer worked example (Nightfold):** open the two largest parenting-meme accounts, find posts
about night waking, read the top 100 comments, take the ones that are a scene rather than a tag.

**B2B worked example (Ledgerpost):** skip. Do not spend the time.

**Limits:** manual, slow, and unautomatable within the terms. Budget it as twenty minutes of a
person's time, not a scripted pass.

**Good harvest:** eight comments that all describe the same recognisable moment in different words.
That repetition is itself the finding. **Junk:** tags of friends, emoji-only replies, and the
account's own replies.

### 2.4 Facebook groups

**Good for:** local, health, hobby and parenting audiences, and for small business owner audiences
in B2B. Group posts are long, sincere and specific.

**Useless for:** anything programmatic. This is the hardest source in the list.

**Access reality:** the Graph API has no path to public group content for third parties. Group
content is not indexed by search in any dependable way. Access means a person, logged in to their
own account, reading a group they belong to, on a desktop.

**Consumer worked example (Nightfold):** a large regional parenting group, search within the group
for "sleep", read the last ninety days of posts.

**B2B worked example (Ledgerpost):** owner and bookkeeper groups, search within the group for
"invoices" or "getting paid".

**Limits:** entirely manual. Many groups are private, and membership obtained to harvest is a bad
idea both ethically and practically. Only use groups the researcher is already legitimately in.

**Good harvest:** three or four long posts that read like a diary entry. **Junk:** everything in a
group whose members are mostly other marketers.

### 2.5 LinkedIn

**Good for:** the *vocabulary* of a B2B audience: what they call their job, their tools, their
problem. Occasionally good for the "what did I lie about to seem more together" prompt, since
LinkedIn is where people perform competence.

**Useless for:** honest customer voice. Almost everything on LinkedIn is written for an audience of
peers and recruiters. The gap between what someone posts on LinkedIn and what they say in a
comment on HN is exactly the gap between an angle and an observation.

**Access reality:** aggressive blocking of unauthenticated requests, and automated collection is
against the terms. Some posts are indexed and readable through search plus a reader; comments
almost never are. Assume desktop and manual.

**B2B worked query (Ledgerpost):** `site:linkedin.com/posts "accounts payable" "every month"` and
read what renders. Expect a low yield.

**Consumer worked example (Nightfold):** skip.

**Limits:** low yield, high effort, high risk of scraping enforcement. Rank it below HN, Stack
Exchange and industry Discourse for every B2B harvest.

**Good harvest:** two or three lines of real job vocabulary you did not have before. **Junk:** the
entire genre of the LinkedIn success anecdote.

### 2.6 TikTok comments

**Good for:** the trend-shape section of the harvest bank, which was largely derived from TikTok
formats in the first place. Comment sections on relatable content are the best living source of
"that's me" language for consumer audiences under 40.

**Useless for:** B2B, and for any audience over about 55.

**Access reality:** there is no public API for comments. TikTok's Research API is restricted to
approved academic researchers in specific regions and is not an option for an agency. Practical
access is a signed-in session on a desktop and a human reading comment sections, or browser
automation on that desktop, which sits close to the terms line.

**Consumer worked example (Nightfold):** search the app for "3am wake up" and "sleep deprived
parent", open the five highest-view videos, read the top 100 comments on each.

**B2B worked example (Ledgerpost):** there is a small accounting and finance corner of the platform.
It exists, it is thin, and it is not worth a desktop session on its own.

**Limits:** manual, region-sensitive results, and the comment ranking changes between sessions.

**Good harvest:** the pinned comment and the top three replies under it, which is often where the
sharpest phrasing lives. **Junk:** sound-related comments, tags, and the creator's own replies.

---

## Tier 3: NOT WORTH IT, or actively misleading

Ordered by how much time each one will waste before you realise.

**LLM web-search plugins asked for "verbatim Reddit quotes."** Tested 2026-09-04. Returned only
marketing articles *about* Reddit, not real quotes, at roughly **$0.26 per query**. Expensive, and
the output looks like a harvest while containing none. **Secondhand articles about what Reddit says
are not customer voice and must be rejected**, no matter how confidently they are cited.

**Registering a Reddit API app.** Covered above. Reviews are manual and mostly refused since
2025-11. Never present this as a quick step.

**PullPush and other Pushshift successors.** 429 on repeated tries from a datacenter IP. Try once
from a desktop if you like; do not design a harvest around it.

**Google cache.** Retired. It is not a way around a 403 any more.

**The brand's own testimonials, case studies and review widget.** Curated by definition, and often
edited. This is marketing copy wearing a customer's name. It can confirm vocabulary; it cannot
produce an observation.

**AI-generated review summaries** on retail sites, and "customers say" blurbs. These are themes.
Themes are exactly what the observation standard forbids.

**Market research reports and survey PDFs.** "62 percent of parents report sleep difficulty" is a
statistic. Nobody recognises themselves in a percentage in one second.

**Nitter and other front-end mirrors.** Almost all instances are dead or unreliable.

**Product Hunt comments.** Overwhelmingly congratulation and reciprocity. Almost no friction is
expressed there.

**Discord.** Private by expectation even when the server is open. Quoting a Discord message in a
client deck is a consent problem, not a technical one. Skip.

**Glassdoor.** Employees, not customers. The exception is a brand whose ICP genuinely is the
employee; then it moves to Tier 2 and needs a session.

**Yelp and Nextdoor.** Only relevant for local service brands, and even then the language is about
one location rather than the category.

**Medium, Substack and SEO listicles.** Written for search engines. If a page has a numbered list
in the title, it is not customer voice.

**Pinterest.** Aspiration boards, not sentences.

---

## Where a harvest should run

**Server profile (unattended, no session).** Web search, page reader, Hacker News Algolia, YouTube
comments and transcripts, App Store RSS, Play Store scraper, Discourse JSON, Stack Exchange,
Bazaarvoice and Yotpo retail reviews, complaint sites. That is nine to eleven sources and it is a
real harvest, not a fallback. A B2B harvest can be excellent from the server profile alone, because
HN and Stack Exchange and industry Discourse are where B2B customers actually write.

**Desktop profile (a human, a browser, a residential IP).** Everything above, plus Reddit, X,
Instagram, Facebook groups, LinkedIn and TikTok. A consumer harvest is meaningfully better here,
mostly because of Reddit.

**Decide before you start, and say which you ran.** A harvest that silently skipped Reddit and did
not mention it is a lie by omission. The coverage note in the output must list what was searched,
what was skipped, and why.

### What each harvest-bank heading can be covered from, without a session

- **PHYSICAL MOMENTS** (fridge, 2 A.M., 6 A.M., 3 P.M., the parked car): weakest without Reddit.
  Best open substitutes are YouTube comments under relatable-content videos, Discourse threads whose
  title is already a moment, and the narrative preamble in 2 and 3 star retail reviews.
- **CONVERSATIONS THEY WOULD HAVE OR OVERHEAR**: Discourse and forum threads, complaint narratives,
  and HN for the work-conversation versions.
- **INTERNET AND PHONE BEHAVIORS**: app store reviews (subscriptions, forgotten charges, the
  cancel flow), complaint sites (billing), and YouTube comments.
- **TREND-SHAPE BEHAVIORS** ("put a finger down if", "toxic trait: I"): genuinely gated. These
  formats live on TikTok, X and Instagram. Without a session you will get thin coverage here, and
  the honest move is to say so rather than write the format yourself from memory.
- **"THAT'S ME" CULTURAL MOMENTS**: YouTube comments and forum threads carry some of this. Reddit
  and TikTok carry most of it.

### The substitutes for Reddit, and the honest limit of them

For a consumer audience with no Reddit session, the best open stack is, in order:

1. **YouTube comments** under category review and relatable-content videos. Closest in shape to a
   Reddit thread: long, first-person, with a like count as an agreement signal.
2. **Discourse and enthusiast forum threads** found through web search. Longest writing of any
   open source.
3. **Retail and app reviews at 2 and 3 stars**, read for the setup paragraph rather than the verdict.
4. **Complaint sites** for the cancel, churn and billing moments.

**These are a substitute, not an equal.** Two differences matter and both should be stated in the
coverage note:

- **They are product-anchored.** Reviews and comments are written about a product, so the harvest
  skews to the post-purchase life: what the product did or did not do. Reddit gives you the
  pre-purchase, brand-absent moment, which is where the strongest observations come from. Expect a
  review-heavy harvest to over-supply "it didn't work for me" and under-supply "standing in front of
  the fridge."
- **The agreement signal is weaker.** YouTube likes are the only decent proxy, and they measure the
  comment's wit as much as its truth.

If a batch depends on the physical-moment and trend-shape sections of the bank, the harvest needs a
desktop session, and the honest recommendation is to say that rather than deliver a review-only
harvest as if it were complete.

---

## Terms of service and rate limiting

The point of this skill is that everything in it is true and traceable. That standard applies to how
the material is collected, not just to what it says.

**Harvest at a human pace.** One request per second to any single host, one every two seconds to a
Discourse instance, sequential rather than parallel. There is no deadline that justifies hammering
a volunteer-run forum. If a host returns 429 with a `Retry-After`, honour it exactly.

**Respect robots.txt and site terms.** If a site disallows crawling, the answer is not a different
user agent. It is either a human reading the page on a desktop, or the source is skipped and named
in the coverage note.

**Never authenticate as someone else.** Use your own accounts and your own sessions. Never a
client's account, never a shared login, never an account created to get into a group in order to
harvest it. A session cookie is a credential and is handled like one: never committed, never pasted
into a shared doc, never sent to a third-party service.

**Store only public content.** Take the quote, the URL, the platform, the approximate date and the
agreement count. Do not store usernames, profile links, avatars, or anything that identifies a
private individual beyond what the quote itself requires. If a post contains a person's health
details, name or location, either cut it or trim it to the moment before storing.

**Quote, do not republish.** A harvest carries short verbatim excerpts with attribution to the URL,
which is a quotation. Copying whole threads, whole reviews, or a bulk archive of a forum into a
client deliverable is republication and is not what this is. Keep excerpts to what the observation
needs, usually one or two sentences.

**When a source will not yield, say so.** The output format has a coverage note for exactly this.
A short honest harvest that names its gaps is worth more to the concept generator than a long one
padded with plausible inventions, because the entire value of this skill is that the lines in it
are true.
