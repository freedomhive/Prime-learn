# Posture Reset Method — ebook store

- `public/index.html` — the whole frontend (HTML + CSS + JS in one file). `public/assets/` holds the cover and 3 real preview pages.
- `src/worker.js` — Cloudflare Worker: order creation, signature verification, webhook, recovery, private PDF delivery.
- `wrangler.toml` — config (public vars + bindings). `test/worker.test.mjs` — 12 backend tests (`node --test test/worker.test.mjs`).

## Architecture
Browser → `/api/create-order` (server sets ₹299 INR) → Razorpay Checkout → `/api/verify` (HMAC check + re-fetch payment from Razorpay, checks order/amount/currency/status) → 5-minute signed download token → `/api/download` streams the PDF from a **private R2 bucket**. Webhook `/api/webhook` finishes orders if the buyer closes the tab. KV stores order records (idempotency + support audit).

## Deploy on Cloudflare Pages (GitHub-connected)
The repo must have `public/`, `functions/`, `src/` at its ROOT (not inside another folder).

1. Workers & Pages -> your project -> Settings -> Builds: **Framework preset: None, Build command: (empty), Build output directory: `public`**. Save, then Deployments -> Retry/redeploy. (This fixes the 404: the site lives in `public/`.)
2. Create storage (Storage & Databases):
   - KV -> Create namespace `ORDERS`.
   - R2 -> Create bucket `posture-ebook-private` (keep private, no public access). Open it -> Objects -> Upload your final PDF and name it exactly `posture-reset-method.pdf`.
3. Project -> Settings -> **Bindings** -> Add: KV namespace, variable name `ORDERS` -> pick `ORDERS`. Add: R2 bucket, variable name `EBOOK` -> pick `posture-ebook-private`.
4. Project -> Settings -> **Variables and Secrets** (Production):
   | Name | Type | Value |
   |---|---|---|
   | `RAZORPAY_KEY_ID` | Text | your Key ID (`rzp_test_...` first, `rzp_live_...` later) |
   | `RAZORPAY_KEY_SECRET` | **Secret** | Razorpay Key Secret |
   | `RAZORPAY_WEBHOOK_SECRET` | **Secret** | any secret you also type into the Razorpay webhook |
   | `TOKEN_SECRET` | **Secret** | long random string (30+ characters) |
   Optional text vars: `PRODUCT_AMOUNT_MINOR` (default 29900) and `PRODUCT_CURRENCY` (default INR).
5. Redeploy (bindings/variables apply to new deployments).
6. Razorpay Dashboard -> Settings -> Webhooks -> add `https://YOUR-SITE/api/webhook`, events `payment.captured` and `order.paid`, same secret as step 4.
7. Replace `YOUR-DOMAIN.example` in `public/index.html`, add `public/assets/og-image.jpg`, and your real legal text.

(`wrangler.worker.toml` is only for deploying as a plain Worker with `wrangler deploy`; Pages ignores it.)

## Currency
Price is ₹299 INR (29900 paise), which every Razorpay account supports, so no international-payments setup is needed. Overseas cards are only accepted if International Payments is enabled on your account; otherwise buyers from abroad may be declined.

## Meta Pixel
Pixel `2104801253414514` is set in `index.html` (`PIXEL_ID`). Events: `PageView`, `ViewContent` (on load), `InitiateCheckout` (Buy click), `Purchase` (only after the server verifies payment; `eventID` = Razorpay order id for deduplication). Verify in Events Manager → Test Events, or with the Meta Pixel Helper extension.

## Test plan (Test Mode)
1. Page renders on desktop and phone; nav, Buy buttons, FAQ, footer dialogs work.
2. Click Buy → Razorpay opens; double-click does not create two orders.
3. Close the popup / use a failing test card → no download appears.
4. Use a successful test payment → "Payment successful!" and the download gives the right PDF.
5. Open the personal link in a new browser → download works. Try the Recover form with payment id + email.
6. Open `/api/download` with no token or an altered token → 403. Confirm the R2 bucket has no public access.
7. Webhook: Razorpay dashboard → Webhooks → resend an event → 200, no duplicate record.
8. Price shown (₹299) equals charged amount and currency in the Razorpay dashboard.
9. View page source: no secret.

Automated: backend tests 1-12 (signature rejection, mismatch, idempotency, forged webhook, token expiry, recovery) passed locally against a mocked Razorpay. Not yet run: real Razorpay calls, real R2/KV, real checkout popup.

## Decisions / items needed from you
- Final PDF (export from Word; see note in chat about the cover page layout).
- Real Privacy, Terms and Refund text; domain; OG image; optional Meta Pixel ID (`PIXEL_ID` in the script).
- Optional hardening: Cloudflare rate-limiting rule on `/api/recover` and `/api/create-order`.
