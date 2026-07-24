# My Social Calendar — Signup Reminder Sequence: Client Handoff

> **Scope of this deliverable:** the 6-email reminder *sequence*, built in Klaviyo to match the approved design. Email deliverability (DNS records, domain warm-up, click-tracking domain) and the website-to-Klaviyo trigger/payment integration sit on the client's side, they own the domain and the site. Those are flagged below as client action items, not part of the build.

## How to deliver it (recommended)

Don't just send raw HTML files, the client can't do much with those. Deliver a sequence like this:

1. **Build the flow in Klaviyo in Draft / Manual mode** (not live yet).
2. **Send them a preview of each email.** In Klaviyo use "Preview and test" to send live test emails to Kyle and Eric's inboxes, so they see them exactly as a subscriber would. (Screenshots work too, but real test sends are better.)
3. **Send the handoff note below** so they understand how the sequence runs and can give you the few missing pieces.
4. **Get their approval + the info, then flip it Live.**

The point: give them (a) something they can see, and (b) a plain-English explanation of how the automation behaves over time, plus (c) the short list of what you need back.

---

## Client-facing handoff note (copy, paste, send)

**Subject: Your signup reminder sequence is ready for review**

Hi Kyle and Eric,

The signup reminder sequence is built and ready for your review. Here's what it is, how it runs, and the few things I need from you to switch it on.

**What it is**
A 6-email automated sequence that triggers when someone enters their email but doesn't finish signing up (no card yet). Each email brings them back to start their 14-day free trial. It's built to match the design you provided.

**The sequence** (sends per person, timed from the moment they start signup):

| # | Email | Sends | What it does |
|---|-------|-------|--------------|
| 1 | Momentum | Immediately | "You're almost done", finish + 14 days free |
| 2 | What's waiting | Day 2 | The kinds of people and events they'll find |
| 3 | Kill the fear | Day 5 | A host greets you, you never walk in alone |
| 4 | This week | Day 9 | Singles are meeting now, you could be too |
| 5 | The full offer | Day 13 | Everything the membership unlocks, free for 14 days |
| 6 | Last call | Day 16 | A gentle final nudge |

**How it behaves**
- Starts automatically the moment a lead enters their email without adding a card.
- Each person moves through on their own clock (Day 0 through Day 16), not a fixed calendar date.
- As soon as someone finishes signup, they stop receiving the rest. No paying customer gets a "you forgot your card" email.
- Anyone who never finishes rolls into your regular newsletter after the last email.

**What's already done**
- All 6 emails built in Klaviyo, matching your design, with the correct logo.
- First-name personalization, working unsubscribe, and buttons pointing to mysocialcalendar.com with tracking so we can see which email drives the most finished signups.

**What I need from you to go live**
1. **Payment / exit signal (most important):** when someone adds their card and pays, does that get recorded in Klaviyo? That's what pulls them out of the sequence so paying customers stop getting reminders.
2. **Trigger:** please confirm the website passes a lead's email into Klaviyo when they start signup.
3. **Landing page:** should the buttons go to the homepage, or do you have a dedicated "finish signup / add card" page you'd prefer? If so, send me the link.
4. **Mailing address:** I need your full business mailing address for the email footer (required by anti-spam law).
5. **Deliverability (your side):** the sending domain is already authenticated (SPF/DKIM/DMARC all pass, good). To keep it out of spam once live, add a **branded click-tracking domain** in Klaviyo (Settings → Domains) and **warm up** the new domain by starting with low volume to engaged contacts. This is domain/DNS work on your infrastructure, not part of the email build.
6. **Logo:** confirming we're using the "my social calendar" wordmark, not the older yellow badge.

Once I have those, I'll set it live and we can track opens, clicks, and completed signups per email.

Thanks,
[Name]

---

## Internal checklist (our side, before flipping live)

- [ ] Flow trigger wired (email entered, no card) and tested
- [ ] Exit / flow filter set: drop anyone who converts (needs the payment signal above)
- [ ] Time delays set with recipient local time: E2 +2d 10am, E3 +3d 10am, E4 +4d 10am, E5 +4d 8am, E6 +3d 10am
- [ ] Email 5 Smart Sending OFF
- [ ] Conversion metric set (started trial / paid) so per-email results show
- [ ] Newsletter "Add to List" step after Email 6 for non-converters
- [ ] Subjects + preview text set on each email
- [ ] Buttons confirmed pointing at the right URL
- [ ] Footer address complete
- [ ] Sending domain authenticated
- [ ] Test send of all 6 reviewed on desktop + mobile
