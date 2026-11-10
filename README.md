# Dunwell

Late-payment interest calculator and a five-step invoice chase, written for the user in under a minute.

Enter one overdue invoice → see the statutory interest and compensation you can claim (UK and EU rates built in, split by rate period) → get five dated messages, from a friendly nudge to a printable letter before claim.

- **Free:** calculator, first two emails, one tracked invoice.
- **Pro (€9/month, €79/year):** all five steps, calendar file, unlimited tracked invoices, optional AI tailoring.

## Run it

Needs Node 20 or newer. There are no dependencies and no build step.

```bash
cp .env.example .env     # DEV_UNLOCK=1 is set, so you see everything as a Pro user
node server.js           # http://localhost:3000
npm test                 # 21 tests: interest maths, letters, paywall, billing flow
```

Set `DEV_UNLOCK=0` to see the site as a free visitor does.

## How it is built

| File | What it does |
|---|---|
| `lib/engine.js` | Interest maths, the rate table, validation, all letter templates. Pure functions. |
| `lib/billing.js` | Paddle Billing: confirms transactions, the signed Pro cookie, restore, customer portal. Swap this file to change provider. |
| `api/index.js`, `vercel.json` | Vercel entry point and routing. Not used on other hosts. |
| `server.js` | HTTP server, static files, the API routes, AI tailoring, rate limiting. |
| `public/` | Landing page and app (`index.html`, `app.js`, `styles.css`), privacy, terms, 404. |
| `test/` | `node --test`. The server tests run Paddle and the AI provider against a local stub. |
| `scripts/build-preview.js` | `npm run preview` builds one self-contained HTML file for demos (no payments, no AI). |

There is no database. Letters are generated on the server so paid templates never reach a free visitor's browser. The tracker and the user's saved sender details live in their browser's localStorage. Pro access is a signed, HttpOnly cookie holding the Paddle subscription id; once a day the server asks Paddle whether that subscription is still active.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `BASE_URL` | In production | Public URL, no trailing slash, e.g. `https://dunwell.monarchcode.io`. Marks the cookie Secure. |
| `NODE_ENV` | In production | `production`. This also disables `DEV_UNLOCK`. Vercel sets it for you. |
| `PADDLE_ENV` | For payments | `sandbox` (default) or `production`. |
| `PADDLE_API_KEY` | For payments | Server-side API key. Secret. |
| `PADDLE_CLIENT_TOKEN` | For payments | Client-side token. Public by design; it is sent to the browser. |
| `PADDLE_PRICE_MONTHLY` | For payments | `pri_...` id of the monthly price. |
| `PADDLE_PRICE_YEARLY` | No | `pri_...` id of the yearly price. The yearly button appears only when this is set. |
| `SESSION_SECRET` | For payments | Long random string that signs the Pro cookie. Required on Vercel: without it every cold start invalidates every customer's access. |
| `ANTHROPIC_API_KEY` | No | Turns on "Tailor this to the situation". Without it the feature is hidden everywhere. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-haiku-5-5`. |
| `DEV_UNLOCK` | Never in production | `1` treats every visitor as Pro. |
| `PORT` | No | Local only. Defaults to 3000. |

## Payments setup (Paddle Billing)

Do this in the **sandbox** dashboard first (sandbox-vendors.paddle.com), then repeat in the live one.

1. Catalog → Products: create "Dunwell Pro" (tax category: SaaS) with two recurring prices, EUR 9 monthly and EUR 79 yearly. Copy both `pri_...` ids.
2. Developer tools → Authentication: create an API key (permissions: transactions read, subscriptions read, customers read, customer portal sessions write) and a client-side token.
3. Checkout → Checkout settings: set the default payment link to your site URL. Paddle will not open a checkout without it.
4. Set `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_PRICE_MONTHLY`, `PADDLE_PRICE_YEARLY`, `SESSION_SECRET`.
5. Test with Paddle's sandbox card 4242 4242 4242 4242: buy → "Pro is active" → steps 3 to 5 unlock → Manage billing → cancel.

While `PADDLE_ENV=sandbox`, the pricing section shows a "Test mode" notice and no real money moves.

**Going live:** Paddle must approve your live account and your domain. Then set `PADDLE_ENV=production` and replace the four Paddle values with the live ones. No code changes. If you change the prices, also change the figures in the pricing section of `public/index.html`.

No webhooks are needed.

## AI setup (optional)

Create a key at console.anthropic.com and set `ANTHROPIC_API_KEY`. Each rewrite is one short request to a small model, limited to 30 an hour per visitor, Pro only. The prompt is in `server.js` (`tailor`): it is told to keep every figure, date and legal reference unchanged.

## Deploy

### Vercel

`vercel.json` and `api/index.js` are included. Vercel serves `public/` from its CDN and runs every `/api/*` request through one function.

1. Import the Git repository in Vercel. Framework preset: Other. No build command.
2. Add the environment variables above (Production).
3. Add the domain under Settings → Domains and create the DNS record Vercel shows you (a CNAME for a subdomain).

Two things to know. Vercel's free Hobby plan is for non-commercial use only: it is fine while payments are in sandbox, and you need Pro before taking real money. The rate limiter keeps its counters in memory, so on serverless it limits per function instance, not globally; add Vercel's firewall rate limiting if you see abuse.

### Any other host

`node server.js` on Render, Railway, Fly.io or your own server; a `Dockerfile` is included. Health check path: `/healthz`.

## Maintenance: the rate table

Statutory rates change twice a year. In the first week of January and of July, add one line per regime to `REGIMES` in `lib/engine.js` and update `RATES_VERIFIED`:

- **UK:** the Bank of England base rate in force on 31 December (for January to June) or 30 June (for July to December).
- **EU:** the ECB main refinancing rate in force on 1 January or 1 July.

**Next update due: 1 January 2027.** Until a period is added the previous rate is used and the calculation is marked provisional on screen. As of 10 November 2026 the base rate is 4% and the ECB rate 2.65%, both higher than the rates in the current half-year, so the January entries will change the figures.

## Before you accept customers

- [ ] **Name and domain.** "Dunwell" has not been checked for trademark conflicts or domain availability.
- [ ] **Paddle sandbox purchase tested on the deployed site.** The billing code has been run against a stand-in for Paddle's API and Paddle.js, not yet against Paddle itself.
- [ ] **Paddle live account approved** for your company and domain, then switched from sandbox to production.
- [ ] **Vercel Pro** (or another host) before real payments.
- [ ] **AI tailoring tested with a real key**, or left off. Same caveat: tested against a stub only.
- [ ] **Tax.** Paddle is the merchant of record and handles sales tax and VAT on customer payments. Confirm with your accountant how Paddle payouts are treated for your company.
- [ ] **Legal review of the templates.** The letters cite real legislation and follow standard practice, but a UK solicitor should read the "Letter before claim" and an EU lawyer the directive wording before you charge for them.
- [ ] **Privacy and terms.** `public/privacy.html` and `public/terms.html` are starter drafts. Add a contact email address and have them reviewed.
- [ ] **`SESSION_SECRET` and `BASE_URL`** set on the host, and `DEV_UNLOCK` absent.
- [ ] **Rate table** checked against the Bank of England and ECB pages on launch day.

## Known limits of this version

- **Restore access** looks up an active subscription by billing email and does not verify that the visitor owns that address. Acceptable at this price; replace with an emailed link when you add transactional email.
- **EU regime** uses the directive minimum (reference rate + 8 points, €40). The margin is editable, but national differences beyond the margin are not modelled.
- **No email sending.** Users copy each message or open it in their email app. Reminders to return are the calendar file and the tracker.
- **English only.**

## Pricing

Launch at €9/month and €79/year. Reasoning: the minimum statutory compensation on one invoice is £40/€40, so a single recovered charge covers four months; comparable invoice-chasing tools that integrate with accounting software are priced for teams and sit well above this. Chasing is occasional for many freelancers, so expect monthly subscribers to churn after a recovery. The yearly plan is priced to be the obvious choice for anyone who invoices regularly. Things to test after the first twenty customers: a one-off €12 "single invoice" pass, and a higher tier with automated sending once email is added.
