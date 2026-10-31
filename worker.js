// margindatalab.com and its subdomains, served by one Cloudflare Worker:
//   margindatalab.com          the main site
//   contact.margindatalab.com  the contact form (questions, free analysis, leave your details)
//   pay.margindatalab.com      pick a package and order (we send an invoice)
// It also does the short links and security headers, and turns both forms into an email
// to Felix. The recipient is the secret LEAD_TO, set in the Cloudflare dashboard (never
// in this repo); it must be a verified Email Routing destination.
import { EmailMessage } from "cloudflare:email";

const MAIN = "margindatalab.com";
const SITES = { // subdomain -> the page it shows at "/"
  ["contact." + MAIN]: "/kontak",
  ["pay." + MAIN]: "/bayar",
};
// Paths a subdomain serves itself; anything else there goes to the main site.
const SHARED = /^\/(api\/lead|terima-kasih|privasi|form\.css|form\.js|lang\.js|id\.js|og\.png|icon-\d+\.png|site\.webmanifest)$/;
const REDIRECTS = {"/marginlab.html": "/", "/home": "/", "/lab": "/#lab", "/optimizer": "/#lab", "/try": "/#lab", "/method": "/#method", "/example": "/#latte", "/pricing": "/#work", "/prices": "/#work", "/harga": "/#work", "/engagements": "/#work", "/services": "/#work", "/process": "/#process", "/contact": "https://contact.margindatalab.com/", "/kontak": "https://contact.margindatalab.com/", "/gratis": "https://contact.margindatalab.com/", "/free": "https://contact.margindatalab.com/", "/analisis": "https://contact.margindatalab.com/", "/pay": "https://pay.margindatalab.com/", "/bayar": "https://pay.margindatalab.com/", "/order": "https://pay.margindatalab.com/", "/pesan": "https://pay.margindatalab.com/", "/book": "https://pay.margindatalab.com/", "/audit": "https://pay.margindatalab.com/?paket=audit", "/sprint": "https://pay.margindatalab.com/?paket=sprint", "/partner": "https://pay.margindatalab.com/?paket=partner", "/thanks": "/terima-kasih", "/sample": "/sample-audit-en", "/sample-audit": "/sample-audit-en", "/contoh": "/contoh-audit-id", "/contoh-audit": "/contoh-audit-id", "/privacy": "/privasi"}; // filled in by tools/build_site.py
const HEADERS = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Strict-Transport-Security": "max-age=31536000"}; // filled in by tools/build_site.py

const FROM = "site@margindatalab.com";
const PACKAGES = {
  audit: "Delivery Margin Audit — Rp 1,8jt",
  sprint: "Implementation Sprint — Rp 7,5jt / 3 minggu",
  partner: "Ongoing Pricing Partner — Rp 2,5jt / bulan",
};
const TOPICS = { gratis: "Analisis gratis", tanya: "Pertanyaan", lain: "Lainnya" };
const FIELDS = { // [form name, label in the email, required]
  contact: [["topik", "Topik", 1], ["cafe", "Kafe", 1], ["link", "Link GoFood/GrabFood", 0],
            ["name", "Nama", 1], ["wa", "WhatsApp", 1], ["email", "Email", 0], ["note", "Pesan", 0]],
  order: [["paket", "Paket", 1], ["cafe", "Kafe", 1], ["name", "Nama", 1], ["wa", "WhatsApp", 1],
          ["email", "Email", 1], ["invoice", "Nama di invoice", 0], ["note", "Catatan", 0]],
};

// Form data -> {type, subject, body, replyTo} | {error: field} | {spam: true}.
export function readLead(form, now = Date.now()) {
  const get = (k) => String(form.get(k) ?? "").trim().slice(0, k === "note" ? 2000 : 300);
  const type = get("type");
  if (!Object.hasOwn(FIELDS, type)) return { error: "type" };
  const t = Number(get("t"));
  if (get("website") || (t > 0 && now - t < 3000)) return { spam: true };
  const v = {};
  for (const [k, , required] of FIELDS[type]) {
    v[k] = get(k);
    if (required && !v[k]) return { error: k };
  }
  if ((v.wa.match(/\d/g) || []).length < 8) return { error: "wa" };
  if (v.email && !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v.email)) return { error: "email" };
  if (type === "order" && !Object.hasOwn(PACKAGES, v.paket)) return { error: "paket" };
  if (type === "contact" && !Object.hasOwn(TOPICS, v.topik)) return { error: "topik" };
  const cafe = v.cafe.replace(/\s+/g, " ").slice(0, 60);
  const subject = type === "order"
    ? `Pesanan ${PACKAGES[v.paket].split(" —")[0]} — ${cafe}`
    : `${TOPICS[v.topik]} — ${cafe}`;
  const shown = (k) => (k === "paket" ? PACKAGES[v.paket] : k === "topik" ? TOPICS[v.topik] : v[k]);
  const lines = FIELDS[type].map(([k, label]) => `${label}: ${shown(k) || "-"}`);
  lines.push("", `Chat: https://wa.me/${v.wa.replace(/\D/g, "").replace(/^0/, "62")}`);
  return { type, subject, body: lines.join("\n"), replyTo: v.email };
}

const b64 = (s) => {
  let bin = "";
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

export function mime(lead, to, id, date = new Date()) {
  return [
    `From: MarginLab site <${FROM}>`,
    `To: <${to}>`,
    ...(lead.replyTo ? [`Reply-To: <${lead.replyTo}>`] : []),
    `Subject: =?UTF-8?B?${b64(lead.subject)}?=`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: <${id}@margindatalab.com>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(lead.body.replace(/\r?\n/g, "\r\n")).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}

async function lead(request, env, url) {
  if (request.method !== "POST") return Response.redirect(`https://contact.${MAIN}/`, 303);
  const back = (q) => Response.redirect(new URL(`/terima-kasih?${q}`, url), 303);
  let lead;
  try {
    lead = readLead(await request.formData());
  } catch {
    lead = { error: "form" };
  }
  if (lead.spam) return back("t=contact");
  if (lead.error) return back(`e=${lead.error}`);
  try {
    const raw = mime(lead, env.LEAD_TO, crypto.randomUUID());
    await env.MAIL.send(new EmailMessage(FROM, env.LEAD_TO, raw));
  } catch (err) {
    // Kept in the Worker's logs so the lead is not lost (dashboard -> Observability).
    console.log("lead email failed:", String(err), "\n" + lead.subject + "\n" + lead.body);
    return back(`e=send&t=${lead.type}`);
  }
  return back(`t=${lead.type}`);
}

// Which response a request gets, before any asset is read: a redirect, the lead
// handler, or the asset path to serve. Exported for tests.
export function route(url) {
  const host = url.hostname, path = url.pathname;
  if (host === "www." + MAIN) return { redirect: `https://${MAIN}${path}${url.search}`, status: 301 };
  const page = SITES[host];
  if (page) {
    if (path === "/") return { asset: page };
    if (path === "/api/lead") return { lead: true };
    if (SHARED.test(path)) return { asset: path };
    return { redirect: `https://${MAIN}${path}${url.search}`, status: 302 };
  }
  if (path === "/api/lead") return { lead: true };
  const to = REDIRECTS[path.replace(/\/$/, "") || "/"];
  if (to) {
    const dest = new URL(to, url);
    if (!dest.search && url.search) dest.search = url.search;
    return { redirect: dest.href, status: 302 }; // 302: browsers don't cache it forever
  }
  return { asset: null };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const r = route(url);
    if (r.redirect) return Response.redirect(r.redirect, r.status);
    if (r.lead) return lead(request, env, url);
    const req = r.asset ? new Request(new URL(r.asset, url), request) : request;
    const res = await env.ASSETS.fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(HEADERS)) out.headers.set(k, v);
    if (/\.png$/.test(url.pathname)) out.headers.set("Cache-Control", "public, max-age=604800");
    return out;
  },
};
