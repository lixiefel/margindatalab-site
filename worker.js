// margindatalab.com and its subdomains, served by one Cloudflare Worker:
//   margindatalab.com          the main site
//   contact.margindatalab.com  the contact form (questions, leave your details)
//   pay.margindatalab.com      sends visitors to the contact form (the order page and the
//                              package prices were archived on 2026-10-31)
// It also does the short links and security headers, and turns the form into an email
// to Felix. The recipient is the secret LEAD_TO, set in the Cloudflare dashboard (never
// in this repo); it must be a verified Email Routing destination.
import { EmailMessage } from "cloudflare:email";

const MAIN = "margindatalab.com";
const SITES = { // subdomain -> the page it shows at "/"
  ["contact." + MAIN]: "/kontak",
};
const MOVED = { // subdomain -> where it now sends every visitor
  ["pay." + MAIN]: `https://contact.${MAIN}/`,
};
// Paths a subdomain serves itself; anything else there goes to the main site.
const SHARED = /^\/(api\/lead|terima-kasih|privasi|form\.css|form\.js|lang\.js|id\.js|og\.png|icon-\d+\.png|site\.webmanifest)$/;
const REDIRECTS = {"/marginlab.html": "/", "/home": "/", "/lab": "/#lab", "/optimizer": "/#lab", "/try": "/#lab", "/method": "/#method", "/example": "/#latte", "/process": "/#process", "/contact": "https://contact.margindatalab.com/", "/kontak": "https://contact.margindatalab.com/", "/gratis": "https://contact.margindatalab.com/", "/free": "https://contact.margindatalab.com/", "/analisis": "https://contact.margindatalab.com/", "/pricing": "https://contact.margindatalab.com/", "/prices": "https://contact.margindatalab.com/", "/harga": "https://contact.margindatalab.com/", "/engagements": "https://contact.margindatalab.com/", "/services": "https://contact.margindatalab.com/", "/pay": "https://contact.margindatalab.com/", "/bayar": "https://contact.margindatalab.com/", "/order": "https://contact.margindatalab.com/", "/pesan": "https://contact.margindatalab.com/", "/book": "https://contact.margindatalab.com/", "/audit": "https://contact.margindatalab.com/", "/sprint": "https://contact.margindatalab.com/", "/partner": "https://contact.margindatalab.com/", "/thanks": "/terima-kasih", "/sample": "/sample-audit-en", "/sample-audit": "/sample-audit-en", "/contoh": "/contoh-audit-id", "/contoh-audit": "/contoh-audit-id", "/privacy": "/privasi"}; // filled in by tools/build_site.py
const HEADERS = {"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()", "Strict-Transport-Security": "max-age=31536000"}; // filled in by tools/build_site.py

const FROM = "site@margindatalab.com";
const TOPICS = { tanya: "Pertanyaan", lain: "Lainnya" };
const FIELDS = { // [form name, label in the email, required]
  contact: [["topik", "Topik", 1], ["cafe", "Kafe", 1], ["link", "Link kafe", 0],
            ["name", "Nama", 1], ["wa", "WhatsApp", 1], ["email", "Email", 0], ["note", "Pesan", 0]],
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
  if (!Object.hasOwn(TOPICS, v.topik)) return { error: "topik" };
  const cafe = v.cafe.replace(/\s+/g, " ").slice(0, 60);
  const subject = `${TOPICS[v.topik]} — ${cafe}`;
  const shown = (k) => (k === "topik" ? TOPICS[v.topik] : v[k]);
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
  if (MOVED[host]) return { redirect: MOVED[host], status: 302 };
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
