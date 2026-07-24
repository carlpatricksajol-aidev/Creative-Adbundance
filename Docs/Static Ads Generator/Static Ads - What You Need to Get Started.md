# Static Ads Generator: What You Need to Get Started

This is the simple checklist of everything required to run the Static Ads service for your brand. It covers the tools (with monthly cost), what you provide, and what is one time vs ongoing.

---

## 1. Tools and Accounts

| Tool | What it does | Cost |
|---|---|---|
| **n8n** | Runs the whole workflow that builds your ads | About $25 / month |
| **Supabase** | Stores your brand info, templates, logos, uploads, and finished ads | $25 / month |
| **OpenRouter** | Writes the ad copy (headlines, sublines, CTAs) and reads your reference ads | Budget $50 / month (usually $15 to $25 used) |
| **KIE AI** | Generates the actual ad images | Pay as you go, based on how many ads you make |
| **Claude (Max plan)** | Used to build and maintain the system | $100 / month |

### Notes that matter
- **OpenRouter** is the part that writes your copy. It is cheap. The $50 is a safe ceiling, not the real spend.
- **KIE AI** is the part that makes the images. This is the main cost that grows with volume. One run can produce around 18 images. Fund this based on how many ads you want each month.
- **Claude Max** is for building and maintaining the system. It is not part of the per ad cost.
- We do **not** use Airtable. Everything lives in Supabase, which is simpler and avoids past technical issues.

---

## 2. What You Provide (Per Brand)

To set up your brand, we need the following once:

- **Brand name** (and any sister brand names)
- **Brand colors** (hex codes: primary, secondary, accent)
- **Brand tone** (how the brand should sound)
- **Key offer** (your main promotion or selling point)
- **Target audience** (who the ads are for)
- **Product benefits** (what makes the product or service good)
- **Logo** (clean file, PNG preferred)
- **Top performing ads** (your best ads so far, if you have them)
- **Product images** (if you sell a physical product)

If you have reference ads you love, you can upload those too. The system can closely recreate the concept in your brand.

**If you cannot provide some of these, that is fine.** The AI will research your brand and fill in the gaps on its own. The more you give us, the more accurate the ads are, but nothing here is a hard blocker.

---

## 3. One Time vs Monthly

**One time setup**
- Create the accounts above
- Load your brand info, logo, and assets into the system
- Connect the intake form

**Monthly**
- n8n: about $25
- Supabase: $25
- OpenRouter: budget $50
- KIE AI: based on your ad volume
- Claude Max: $100

---

## 4. Rough Monthly Total

For a normal volume of ads:

- Fixed tools: about $200 / month
- KIE AI image generation: varies with how many ads you make

The more ads you generate, the more KIE AI credits you use. Everything else stays about the same.

---

## 5. How It Works (Short Version)

1. You fill out a simple intake form with your brand details and any references.
2. The system pulls your brand info and templates from Supabase.
3. It writes on brand copy for each ad.
4. It generates the ad images.
5. Finished ads are saved and ready for you to review.
