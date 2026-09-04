# Query Recipes

The harvest bank tells you WHAT to look for. This file tells you WHAT TO TYPE.

Reddit is not fetchable by an anonymous request or by this agent's own crawler, so every Reddit
line below assumes one of two working paths. **Path A:** a CLI reusing a signed-in Chrome cookie
jar, or a cookie pasted into a CLI, hitting reddit.com or old.reddit.com search directly.
**Path B:** a general web search that surfaces a reddit.com thread in its result list, where the
result snippet itself often carries the quote. If neither path is live, Reddit is not a source for
that run. Say so in the output. Never substitute an article ABOUT what Reddit says.

Source tags used below:

| Tag | Meaning | Status measured 2026-09-04 |
|---|---|---|
| `RED-A` | Reddit via signed-in browser session | Works only if a session is configured |
| `RED-B` | Reddit reached through general web search snippets | Works, lower yield |
| `WEB` | General web search | Works |
| `HN` | Hacker News Algolia, `http://hn.algolia.com/api/v1/search?query=` | Works, free, no key |
| `X-C` | Twitter/X via auth_token + ct0 cookies | Works only if cookies are configured |
| `FORUM` | Niche boards found via `WEB` (Styleforum etc: 403 direct, visible in results) | Works |
| `REV` | Review bodies on app stores, PDPs, aggregators (Trustpilot direct = 403) | Works |
| `YT` | YouTube comment threads and titles | Works |
| `Q&A` | Quora, Stack Exchange, health and parenting Q&A | Works |

Do not tell a reader to register a Reddit API app. Registrations have been manually reviewed and
largely refused since 2025-11. PullPush answered 429 on repeat tries and cannot be planned around.

Invented brands used in every example so nothing here names a real client: **Northbell** (magnesium
sleep drink), **Ferrow** ($34/mo meal kit for one), **Lumeny** (at-home hormone testing),
**Packwise** (carry-on suitcase), **Verdine** (plant milk), **Studio Nine** (workout app),
**Halcyon Legal** (flat-fee wills).

---

## 1. Physical moments

People never name the room. They name the object, the time, or the feeling. Search the object plus
a time stamp.

**Standing in front of the fridge / medicine cabinet / closet.** Best `RED-A`, second `WEB` into
`FORUM` and `Q&A`. Confessed, never reviewed, so it lives in replies not in review bodies.
```
"standing in front of the fridge" ("no idea what" OR "forgot why") site:reddit.com
"opened the medicine cabinet" "out of" -site:pinterest.com
"stared at my closet" "nothing to wear" "before work"
```

**The 2 A.M. moment (wake up, phone in hand, what do they check).** Best `RED-A`, second `X-C`.
The platform timestamp is itself the tell you are looking for.
```
"3am" ("googling" OR "googled") "and now I'm convinced" site:reddit.com
"woke up at 2am" "checked my phone" -"sleep training" -newborn
```
Northbell shape on `X-C`, run in the signed-in search UI, not the API:
```
"it's 3am" ("why am I" OR "why do I") -filter:links -filter:replies
```

**The 6 A.M. moment (alarm, first thoughts).** Best `RED-A`, second `WEB` into `Q&A`.
```
"first thing I do when my alarm goes off" site:reddit.com
"hit snooze" "four times" "and then"
```

**The 3 P.M. slump / school-pickup moment.** Best `RED-A` for adults, `WEB` into parenting `FORUM`
for the pickup line. Second `REV`: snack and energy reviews are dense with 3 P.M. language.
```
"3pm" ("crash" OR "slump") "every single day" site:reddit.com
"in the pickup line" ("I sit" OR "I just") -site:facebook.com
"by the time I get to pickup" "I have nothing left"
```

**The Sunday-night scroll.** Best `RED-A`, second `X-C`.
```
"sunday scaries" "I always end up" site:reddit.com
"sunday night" "buying things I don't need" -football -game
```

**Waiting at a red light thinking about something.** Best `X-C`, second `RED-A`. This is a
one-line observation, Twitter's native shape rather than Reddit's.
```
"at a red light" ("I realized" OR "it hit me") -lyrics -song
"sitting at a stoplight" "thinking about" -lyrics -"official video"
```
Append `-lyrics -song -"official video"` to any driving query or music results bury you.

**Sitting in a parked car after an appointment.** Best `RED-A`, second `WEB` into health `Q&A`.
Post-appointment is a health and legal moment, so it lives in condition-specific communities.
```
"sat in my car" ("after the appointment" OR "in the parking lot") "before I drove home"
"cried in the parking lot" "after my" -song -movie
```
Lumeny shape, which is higher yield because it names the specialist:
```
"left the OB" ("felt dismissed" OR "she just said") site:reddit.com
```

**On the couch with the TV on, not really watching.** Best `RED-A`, second `X-C`.
```
"the tv is on" "but I'm on my phone" -"how to" -setup
"I put something on" "and then just scroll"
```

---

## 2. Conversations they'd have or overhear

Reported speech has a fingerprint: `she said`, `he told me`, `my doctor literally said`. Search the
reporting verb plus the role. That one pattern does most of the work in this section.

**What the pediatrician / doctor / OB / lawyer / accountant just asked them.** Best `RED-A`,
second `WEB` into `Q&A`.
```
("my doctor said" OR "my doctor told me") "and I didn't know what to say"
"the pediatrician asked me" -site:healthline.com -site:webmd.com
```
Halcyon Legal shape. The exclusions matter, because firm marketing pages quote invented clients:
```
"the lawyer asked me" "if I had a will" -"law firm" -attorney -"free consultation"
```

**What their mom / sister / best friend / neighbor said last week.** Best `RED-A`, second `X-C`.
```
"my mom said" ("and it's been in my head" OR "and I can't stop thinking")
"my best friend said" "I've been" -quotes -captions
```

**The last text they got from their partner.** Best `X-C`, second `RED-A`.
```
"my husband texted me" ("again" OR "just now")
"my boyfriend sent me" "and I felt" -song -lyrics
```

**What their skeptical friend accused them of.** Best `RED-A`, second `REV`, because skeptic
language concentrates in 3-star reviews, which are the most useful reviews in any category.
```
"my friends think I'm" ("crazy" OR "wasting money") site:reddit.com
"my husband thinks it's a waste of money" -blog
```
Verdine shape on `REV`: `"I thought this was going to be" gimmick review 3 star`

**What the group chat is blowing up about.** Best `X-C`, second `RED-A`.
```
"my group chat" ("has been" OR "is losing it over")
"sent this to my group chat" "immediately"
```

**What they overheard at the coffee shop.** Best `X-C`, second `WEB`. Weight it low. Overheard
content is thin and often invented for engagement. Use it for phrasing texture, never as a
load-bearing observation.
```
"just overheard" ("two women" OR "a guy") "at the coffee shop"
```

**What their kid asked that they could not answer.** Best `RED-A`, second parenting `FORUM`.
```
"my 6 year old asked me" "and I froze"
"how do you explain" "to a 5 year old" site:reddit.com
```

**What they lied about to seem more together.** Best `RED-A`, second `X-C`. The highest-value
prompt in the bank and the hardest to surface, because it only exists in anonymous confession.
```
"I lied and said" ("I was fine" OR "I had it handled")
"nobody knows that I" -lyrics -song
"I tell people I" "but really I"
```

---

## 3. Internet + phone behaviors

Best hit rate of the five headings, because the behaviors are already textual. People screenshot
their own screens and narrate them.

**Search history at 3 A.M.** Best `RED-A`, second `X-C`.
```
"my search history" ("would" OR "is") ("concerning" OR "unhinged") "3am"
"my recent searches" "in order"
```

**Bank account after the drugstore.** Best `RED-A`, second `REV` for price-shock on the PDP.
```
"went to the pharmacy" ("and it was" OR "cost me") "I almost"
"$" "for a bottle of" "I put it back"
```
Dollar sign plus a unit noun is a reliable price-shock pattern and works on every source.

**Camera roll (what photo did they stop on).** Best `X-C`, second `RED-A`.
```
"this photo came up in my memories" "and I"
"found a picture from" "and I don't recognize"
```

**Dating app / e-commerce browsing pattern.** Best `RED-A`, second `X-C`.
```
"I've been looking at the same" "for three weeks"
"added to cart" "closed the tab" "opened it again"
```

**Instagram scroll (who are they comparing themselves to).** Best `RED-A`, second `X-C`.
```
"comparing myself to" "on instagram" "and I know it's fake"
"muted" "because it made me feel"
```

**Group chat sending the same TikTok around.** Best `X-C`, second `YT` and `WEB`.
```
"three people sent me the same tiktok"
"everyone in my life has sent me this"
```

**The pinned comment that made them stop.** Best `YT`, second `WEB`. Find the video via `WEB`,
then read the comment thread. The comment is the observation, not the video.
```
"the comments on this video" "said what I was thinking"
site:youtube.com "how to know if you need" magnesium
```

**The Notes app open on their phone.** Best `X-C`, second `RED-A`.
```
"my notes app" ("is a graveyard" OR "would scare you")
"opened my notes app at 4am"
```

**The DoorDash tab still open.** Best `RED-A`, second `X-C`. Ferrow shape: the observation is the
abandoned cart, not the meal.
```
"almost ordered doordash" "then I saw the total"
"the fees were more than the food"
```

**The Amazon cart with 12 things in it.** Best `RED-A`, second `REV`.
```
"my amazon cart has" "things I will never buy"
"saved for later" "for two years"
```

**The "leave your job on read" moment.** Best `RED-A`, second `HN`, which is genuinely strong for
anything work, money, or software adjacent and is the only source here with a clean free API.
```
"left my boss on read" -site:linkedin.com
http://hn.algolia.com/api/v1/search?query=%22quit%20without%20another%20job%22&tags=comment
```
Turn each `objectID` in the JSON into `https://news.ycombinator.com/item?id=<objectID>` to cite it.

**The subscription they forgot they had.** Best `RED-A`, second `REV`, because cancellation
friction concentrates in 1-star reviews.
```
"I've been paying for" "for two years" "and never used it"
"$" "a month" "for something I opened twice"
```

---

## 4. Trend-shape behaviors

Format templates, not topics. Search the template string as an exact phrase and let the topic fall
out. Fastest section to run and the easiest to cite, because the format string is in the text.

| Prompt | Best | Second | Example query |
|---|---|---|---|
| "Put a finger down if..." | `X-C` | `YT` | `"put a finger down if" "you have ever" suitcase` |
| "Toxic trait: I..." | `X-C` | `RED-A` | `"toxic trait" "I buy" "and never use it"` |
| "Green flags of..." | `X-C` | `RED-A` | `"green flag" "when a brand" "actually tells you"` |
| "Did you know..." | `YT` | `WEB` | `"did you know" "your magnesium" -sponsored -ad` |
| "Rating [x] as someone who..." | `X-C` | `YT` | `"rating" "as someone who" "has flown" "carry on only"` |
| "Things nobody warned me about..." | `RED-A` | `X-C` | `"nobody warned me about" perimenopause -blog -"top 10"` |
| "Ranking my [x] worst to best" | `X-C` | `YT` | `"ranking every" "I have owned" "worst to best" suitcase` |
| "POV: you're the [x]" | `X-C` | `YT` | `"pov you're the friend who" "always plans"` |
| "Reasons I left [x] (a list)" | `RED-A` | `REV` | `"reasons I cancelled" "a list" meal kit` |
| "The [x] that made me [y]" | `RED-A` | `REV` | `"the one thing that made me finally" "book the appointment"` |

Two rules. Quote the template exactly: unquoted, `put a finger down if` returns SEO explainers
about the trend; quoted, it returns the posts. And append one category noun, never two.
`"nobody warned me about" perimenopause` works. Adding `supplements sleep` returns nothing,
because you have just demanded four tokens co-occur.

---

## 5. "That's me" cultural moments

Recognition moments. The searchable signature is a realization verb: `I realized`, `it hit me`,
`the moment I`, `I caught myself`.

| Prompt | Best | Second | Example query |
|---|---|---|---|
| Called out by their partner | `RED-A` | `X-C` | `"my husband pointed out that I" "and he's right"` |
| Becoming their mother | `X-C` | `RED-A` | `"I caught myself" "doing the exact thing my mom"` |
| Explaining to a boomer relative | `RED-A` | `X-C` | `"tried to explain" "to my dad" "he does not get why I pay for"` |
| Signed up at 11:47 P.M. | `RED-A` | `REV` | `"signed up at midnight" "in a moment of" -promo -coupon` |
| Cancelled a plan | `X-C` | `RED-A` | `"cancelled plans" "and immediately felt" -flight -refund` |
| Said "I'll figure it out later" | `RED-A` | `X-C` | `"I'll deal with it later" "and then it was" months` |
| Googled a symptom | `RED-A` | `Q&A` | `"googled my symptoms" "and convinced myself" -webmd` |
| Screenshotted something | `X-C` | `RED-A` | `"screenshotted this" "and haven't looked at it since"` |

Studio Nine shape for the 11:47 P.M. moment, where the query that actually lands returns the
failure rather than the purchase, which is correct, because the failure is what the ad has to earn
its way past:
```
"signed up for a gym" ("at 1am" OR "at midnight") "and never went"
```

---

## THE CENTRAL TRICK: search the language of the moment, not the category

Nobody types the category name into a forum post. `I struggle with mental load` exists in
marketing decks and almost nowhere else. A real person writes `I keep forgetting the thing I told
myself I'd remember`. Rewrite every category query into a moment query before you run it. Left
column returns listicles and other people's ad copy. Right column returns humans.

1. **Sleep supplement.** Before: `magnesium for sleep benefits` (supplement brand blogs).
   After: `"wake up at 3am" "every night" "and then I'm up for two hours" site:reddit.com`
2. **Mental load.** Before: `mental load of motherhood` (think pieces).
   After: `"I'm the only one who knows" ("when the" OR "where the") "in this house"`
3. **Affordability.** Before: `prescription costs too high` (policy journalism).
   After: `"the pharmacy told me it was" "$" "I said I'd come back" -insurance -"how to save"`
4. **Convenience.** Before: `easy meal solutions busy professionals` (brand copy).
   After: `"ate cereal for dinner" "again" "and I'm 34"`
5. **Personalization.** Before: `personalized hormone treatment` (telehealth landing pages).
   After: `"they gave me the same protocol as everyone else" "and it didn't work for me"`
6. **Gear durability.** Before: `best durable carry on luggage` (affiliate roundups, the worst
   result type there is).
   After: `"the wheel snapped off" "in the airport" "and I had to drag it" -"best luggage"`
7. **Fitness motivation.** Before: `how to stay motivated to work out` (coaching content).
   After: `"I've restarted week one" ("four" OR "five") "times"`
8. **Estate planning.** Before: `why you need a will` (law firm SEO).
   After: `"my dad died without a will" "and we spent" "figuring out"`
9. **Plant milk.** Before: `best tasting oat milk` (affiliate roundups).
   After: `"it separated in my coffee" "and I'm done" -recipe -"how to"`
10. **Subscription fatigue.** Before: `subscription fatigue statistics` (industry reports).
    After: `"cancelled four subscriptions today" "and I still don't know what"`

Every rewrite makes the same three moves: replace the abstract noun with a physical object or a
time, add a first-person past-tense verb, and exclude the commercial vocabulary of the category.

---

## Reusable query templates

Fill the slots and run them. `[X]` is a product or brand, `[CAT]` a category. Keep the quotes
exactly where they are.

**Confession and frustration.** These phrases only occur when someone is admitting something.
```
"am I the only one who" [CAT]
"does anyone else" [CAT] "or is it just me"
"I finally" [verb] "after" ("two years" OR "three years")
"I gave up on" [X] "because"
"the real reason I" [verb]
"nobody tells you" [CAT]
"I'm embarrassed to admit" [CAT]
"this is going to sound stupid but" [CAT]
"unpopular opinion" [X] -meme
```
Lumeny worked example: `"am I the only one who" "gets told my labs are normal"` and
`"nobody tells you" "that you have to ask for the test yourself"`

**Switching and churn.** The highest-value language in the harvest, because it contains the reason.
```
"switched from" [X] "to" [competitor]
"cancelled my" [X] "because"
"went back to" [X] "after"
"why I left" [X] -affiliate -"referral code"
"is it worth it" [X] "for one person"
"I wanted to like" [X] "but"
```
Ferrow worked example: `"switched from" "meal kit" "to" "just buying groceries" "and honestly"`.
The `"and honestly"` tail filters out affiliate copy, which never says honestly, and keeps posts,
which say it constantly.

**The decisive moment.** The moment the ad has to dramatize, so these are the most directly usable.
```
"the moment I" [verb]
"what made me finally" [verb]
"the last straw was"
"I knew I had to" [verb] "when"
"the thing that pushed me over the edge"
"I had been putting it off until"
"three days before" [event] "I realized"
```
Packwise worked example: `"the last straw was" "the zipper" "in the middle of the airport"`

**Price shock.**
```
"$" [number] "for" [X] "I put it back"
"paid" "$" "and it lasted" ("two weeks" OR "one trip")
"the total was" "$" "and I closed the tab"
```

**Proof and skepticism.**
```
[X] "actually worked" "and I'm annoyed about it"
"three weeks in" [X]
"one month update" [X] -sponsored -gifted -"pr package"
```
That `-sponsored -gifted -"pr package"` triplet is mandatory on any update query in beauty,
supplement, or fitness, or you will harvest another agency's influencer brief and pass it off as
customer voice.

---

## Search operators that actually change the result set

Five families change what comes back. The rest is folklore.

**1. Exact phrase quoting.** The highest-leverage operator. Unquoted, the engine paraphrases and
hands you optimized pages. Quoted, it must find the literal string, which only humans type.
```
sunday scaries buying things            -> listicles about Sunday scaries
"I always end up buying something"      -> a person, on a forum, at 11pm
```
Quote the fragment too specific for a copywriter to have written. Two to seven words. Longer than
seven and you get zero.

**2. Site restriction.** `site:reddit.com`, `site:reddit.com/r/[subreddit]`,
`site:news.ycombinator.com`, `site:styleforum.net`, `site:quora.com`. The caveat that matters:
`site:reddit.com` in a general web search returns Reddit URLs whose snippets often contain the
quote you need, and that snippet plus the thread URL is a usable citation even when the page will
not fetch. Styleforum behaves identically: 403 direct from a datacenter IP, fully visible through
search results.

**3. Excluding listicle and affiliate junk.** The default block, pasted onto any commercial query:
```
-"best" -"top 10" -"top 5" -"buying guide" -"we tested" -"review roundup"
-coupon -"promo code" -"discount code" -affiliate
-sponsored -gifted -"pr package" -ad
-site:pinterest.com -site:medium.com
```
The four that pay for themselves in nearly every category are `-"best" -"top 10" -coupon
-sponsored`. Also exclude any domain that appeared three times in your last result set with
different titles and identical structure. That repetition is the fingerprint of a template site.

**4. Date restriction.** Language ages, and a 2019 thread is often about a product that no longer
exists. Use the tools panel custom range (default: last 24 months), or `after:2024-06-01` and
`before:2026-09-01` inline where supported. On `HN` use the numeric filter, where `created_at_i`
is a Unix timestamp and 1717200000 is 2024-06-01:
```
http://hn.algolia.com/api/v1/search?query=%22I%20cancelled%22&tags=comment&numericFilters=created_at_i>1717200000
```
On a signed-in Reddit session, set the search UI time filter to Past year and widen only when a
query returns under five results. Deliberately ignore date restriction for evergreen physical
moments. The fridge at midnight has not changed since 2011.

**5. Telling a real forum thread from an SEO page in the result list.** You make this call dozens
of times per run, from the result list alone, before spending a fetch.

Real thread: title is a fragment, a question, or lowercase (`anyone else wake up at 3 every
night?`); URL contains `/comments/`, `/threads/`, `/t/`, `/topic/`, or `/item?id=`; snippet has a
first-person past-tense verb and no product name in the first clause; snippet contains a typo, an
ellipsis, or `edit:`; a reply or vote count is shown.

SEO page: title is title-cased with a number (`7 Reasons You Wake Up At 3AM (And How To Fix It)`);
URL contains `/blog/`, `/guides/`, or `/learn/`, or ends in a slug matching your query word for
word; snippet is a complete grammatical sentence that answers the query; snippet says `according
to experts` or `studies show`; domain is a brand in the category you are researching.

Heuristic: if the snippet reads like it was written to be read by you, it is an SEO page. If it
reads like it was written for someone else in that person's community, it is real.

The trap to name explicitly: an article titled `What Reddit Really Thinks About [CAT]` is an SEO
page even though it contains quoted text. Those quotes are unverifiable and frequently fabricated.
An LLM web-search plugin tested for verbatim Reddit quotes returned exactly this genre, at roughly
$0.26 per query, and returned zero real quotes. Reject the genre on sight. If the URL you would
cite is an article about a community rather than a post inside it, do not cite it.

---

## When a query returns nothing

Zero results is information. Work these in order. Do not skip to the end.

**1. Widen the phrase, not the topic.** Long exact phrases fail because you guessed the wording.
```
"I stood in front of the fridge trying to remember"   -> 0
"stood in front of the fridge" "trying to remember"   -> a few
"in front of the fridge" "remember"                   -> workable
```
Drop to the shortest fragment a copywriter would still never write. Usually four words.

**2. Swap tense and pronoun.** People narrate in past tense and first person, but confession
threads slip into second person: `"I forgot to"` -> `"forgot to"` -> `"you forget to"`;
`"I cancelled"` -> `"cancelling"` -> `"about to cancel"`.

**3. Drop the category noun entirely.** Counterintuitive and it works. `"woke up at 3am"
magnesium` may return nothing while `"woke up at 3am" "and couldn't get back to sleep"` returns
hundreds. Harvest the moment, then check whether the poster's other context puts them in the ICP.

**4. Remove exclusions one at a time.** Over-excluding is the most common self-inflicted zero.
`-review` kills real posts containing the word incidentally. Remove in this order: `-review`,
`-blog`, then domain exclusions. Keep `-coupon` and `-sponsored` longest.

**5. Switch source, in this order.** `RED-A` first, highest density of the language the bank asks
for. Then `WEB` with `site:reddit.com` to reach Reddit through snippets. Then `WEB` unrestricted,
hunting `FORUM` and `Q&A`. Then `HN` for anything work, money, software, or productivity adjacent,
where comment bodies come back in the JSON so no second fetch is needed. Then `REV` for anything
with a purchase decision, 3-star reviews specifically, because they carry the objection and the
reason for buying in the same paragraph. Then `X-C` for one-liners, trend formats, and reported
speech. Then `YT` comments for demonstration-heavy categories.

**6. Reframe once, using a neighbor community.** If the ICP's own category is silent, the adjacent
one may not be. A Halcyon Legal researcher finding nothing in estate-planning language should
search caregiving, bereavement, and family-conflict language, where the moment lives even when the
product word does not: `"my dad died" "and we couldn't find" "the paperwork"`

**7. Conclude honestly.** If steps 1 through 6 fail across at least three sources, the correct
output is a stated negative, not an invention. Write it in this exact shape:
```
PROMPT: "what did they lie about to seem more together"
STATUS: no public evidence found
SOURCES TRIED: RED-A (session live, 6 query variants), WEB (9 variants incl. site:reddit.com),
               X-C (4 variants), Q&A (3 variants)
BEST NEAR MISS: [url] - adjacent but the poster is outside the ICP (wrong life stage)
RECOMMENDATION: source this from customer interviews or support tickets, not public search
```
That block is a deliverable. It tells the strategist which prompt needs a different research
instrument, and it is worth more than a fabricated quote that reads well and collapses the moment
anyone clicks the link.

The rule that governs the whole file: nothing invented may pass as harvested. An observation
without a URL that actually contains the words is not an observation. It is a guess wearing an
observation's clothes, it will get into an ad, and someone will check.

---

## Run checklist

1. Confirm which sources are live TODAY. Test one query per source before planning around it.
   Record the result. Access changes without notice.
2. Run section 4 first. Trend queries are fast, exact-phrase, and hand you the audience's current
   vocabulary, which you then reuse everywhere else.
3. Run the confession templates with the category noun. Harvest vocabulary.
4. Re-run sections 1, 2, and 3 using that harvested vocabulary in place of your own guesses.
5. Every kept observation carries four fields: verbatim text, URL, source tag, post date.
6. Every prompt that produced nothing gets the stated-negative block from step 7 above.
7. Before handoff, re-open every citation URL and confirm the quoted words are on the page. A
   citation that does not contain the quote is worse than no citation.
