/**
 * Simple stateless ebook checkout for Cloudflare Pages (_worker.js).
 * Needs ONLY the secret RAZORPAY_KEY_SECRET (already saved in Cloudflare). No KV, no R2, no webhook.
 *
 *   POST /api/create-order  server sets the price and creates the Razorpay order
 *   POST /api/verify        checks Razorpay's signature AND re-fetches the payment from Razorpay
 *   POST /api/access        personal link -> fresh 5-minute download token (re-checks payment with Razorpay)
 *   POST /api/recover       payment id + email -> download
 *   GET  /api/download?t=   serves the PDF only with a valid token
 */
const KEY_ID_DEFAULT = "rzp_live_TnjJe0OpmqZzR1"; // public by design
const AMOUNT_MINOR = 29900;                       // Rs 299.00 in paise
const CURRENCY = "INR";
const PRODUCT_ID = "posture-reset-method";
const PDF_FILE = "/posture-reset-method-k7q2x9.pdf"; // upload your PDF to the repo root with EXACTLY this name
const DOWNLOAD_NAME = "Fix-Your-Back-and-Neck-Posture-The-Posture-Reset-Method.pdf";
const TOKEN_TTL_S = 300;
const ID_RE = /^[A-Za-z0-9_]{6,64}$/;
const enc = new TextEncoder();

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64u = (b) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
function safeEqual(a, b) {
  a = String(a ?? ""); b = String(b ?? "");
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
const keyId = (env) => env.RAZORPAY_KEY_ID || KEY_ID_DEFAULT;
const tokenSecret = (env) => env.TOKEN_SECRET || env.RAZORPAY_KEY_SECRET;

async function rzp(env, path, init = {}) {
  const res = await fetch("https://api.razorpay.com/v1" + path, {
    ...init,
    headers: { authorization: "Basic " + btoa(`${keyId(env)}:${env.RAZORPAY_KEY_SECRET}`), "content-type": "application/json" },
  });
  let body = null; try { body = await res.json(); } catch (_) {}
  return { ok: res.ok, body };
}
async function readJson(req) {
  const t = await req.text();
  if (t.length > 8192) throw new HttpError(413, "Request too large.");
  try { return t ? JSON.parse(t) : {}; } catch (_) { throw new HttpError(400, "Invalid JSON."); }
}

/** Source of truth is Razorpay itself: payment captured, for OUR order, right amount and currency, right product. */
async function paymentIsGood(env, orderId, p) {
  if (!p || p.order_id !== orderId || p.status !== "captured") return false;
  if (p.amount !== AMOUNT_MINOR || String(p.currency).toUpperCase() !== CURRENCY) return false;
  const o = await rzp(env, `/orders/${encodeURIComponent(orderId)}`);
  return !!(o.ok && o.body && o.body.notes && o.body.notes.product === PRODUCT_ID && o.body.amount === AMOUNT_MINOR);
}
const recoveryKey = async (env, orderId) => b64u(await hmac(tokenSecret(env), `recover|${orderId}`));
async function mintToken(env, orderId) {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S;
  return `${orderId}.${exp}.${b64u(await hmac(tokenSecret(env), `download|${orderId}.${exp}`))}`;
}
async function tokenOk(env, t) {
  const [o, exp, sig] = String(t || "").split(".");
  if (!ID_RE.test(o || "") || !/^\d+$/.test(exp || "")) return false;
  if (!safeEqual(sig, b64u(await hmac(tokenSecret(env), `download|${o}.${exp}`)))) return false;
  return Number(exp) >= Math.floor(Date.now() / 1000);
}
async function paidResponse(env, orderId) {
  return json({ status: "paid", orderId, recoveryKey: await recoveryKey(env, orderId), downloadToken: await mintToken(env, orderId) });
}

const routes = {
  "GET /api/config": async (req, env) => json({ keyId: keyId(env), amountMinor: AMOUNT_MINOR, currency: CURRENCY, merchantName: "Freedom Studio Publishing" }),

  "POST /api/create-order": async (req, env) => {
    const b = await readJson(req);
    if (b.productId !== PRODUCT_ID) throw new HttpError(400, "Unknown product.");
    const r = await rzp(env, "/orders", { method: "POST", body: JSON.stringify({ amount: AMOUNT_MINOR, currency: CURRENCY, receipt: "pr_" + Date.now().toString(36), notes: { product: PRODUCT_ID } }) });
    if (!r.ok || !r.body?.id) { console.error("order failed", JSON.stringify(r.body?.error || {})); throw new HttpError(502, "We couldn't start the payment. Please try again, or email freedomhive.in@gmail.com."); }
    return json({ orderId: r.body.id, amount: r.body.amount, currency: r.body.currency });
  },

  "POST /api/verify": async (req, env) => {
    const b = await readJson(req);
    const o = b.razorpay_order_id, p = b.razorpay_payment_id, s = b.razorpay_signature;
    if (!ID_RE.test(o || "") || !ID_RE.test(p || "") || !s) throw new HttpError(400, "Missing payment details.");
    if (!safeEqual(hex(await hmac(env.RAZORPAY_KEY_SECRET, `${o}|${p}`)), String(s).toLowerCase())) throw new HttpError(400, "Payment signature could not be verified.");
    const pay = await rzp(env, `/payments/${encodeURIComponent(p)}`);
    if (!pay.ok) throw new HttpError(502, "Could not confirm the payment with Razorpay. Please retry in a moment.");
    if (pay.body.status === "failed") return json({ status: "failed" }, 402);
    if (await paymentIsGood(env, o, pay.body)) return paidResponse(env, o);
    if (pay.body.order_id === o && (pay.body.status === "authorized" || pay.body.status === "created")) return json({ status: "pending" }, 202);
    throw new HttpError(400, "Payment could not be confirmed.");
  },

  "POST /api/access": async (req, env) => {
    const { orderId, key } = await readJson(req);
    if (!ID_RE.test(orderId || "") || !key || !safeEqual(await recoveryKey(env, orderId), key)) throw new HttpError(403, "Invalid link.");
    const r = await rzp(env, `/orders/${encodeURIComponent(orderId)}/payments`);
    const ok = r.ok && (r.body?.items || []).some((p) => p.status === "captured" && p.amount === AMOUNT_MINOR);
    if (!ok) throw new HttpError(402, "This order has no verified payment yet.");
    return paidResponse(env, orderId);
  },

  "POST /api/recover": async (req, env) => {
    const { paymentId, email } = await readJson(req);
    if (!ID_RE.test(paymentId || "") || !/^[^@\s]+@[^@\s]+$/.test(email || "")) throw new HttpError(400, "Enter your Razorpay payment ID and the email used at checkout.");
    const nope = new HttpError(404, "We couldn't match those details to a completed payment.");
    const r = await rzp(env, `/payments/${encodeURIComponent(paymentId)}`);
    if (!r.ok || String(r.body.email || "").toLowerCase() !== email.trim().toLowerCase() || !(await paymentIsGood(env, r.body.order_id, r.body))) throw nope;
    return paidResponse(env, r.body.order_id);
  },

  "GET /api/download": async (req, env) => {
    const url = new URL(req.url);
    if (!(await tokenOk(env, url.searchParams.get("t")))) return new Response("Download link is invalid or has expired. Go back to the site to get a fresh one.", { status: 403 });
    const f = await env.ASSETS.fetch(new Request(new URL(PDF_FILE, url).toString()));
    if (!f.ok) return new Response("The file is temporarily unavailable. Please email freedomhive.in@gmail.com with your payment ID.", { status: 500 });
    return new Response(f.body, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${DOWNLOAD_NAME}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (!env.RAZORPAY_KEY_SECRET) throw new HttpError(503, "Store is not configured yet.");
      const h = routes[`${request.method} ${url.pathname}`];
      if (!h) return json({ error: "Not found." }, 404);
      return await h(request, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error("unhandled", e && e.stack);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};
