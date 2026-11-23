// Static directory pages for GitHub Pages: one page per deal (/deal/<id>/), one per category and
// subcategory (/c/<cat>/, /c/<cat>/<sub>/), plus sitemap.xml and robots.txt. Vendor links are plain
// followed links: listing here gives every vendor a real backlink. Called from build.ts.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ADULT, TAXONOMY, type Category } from "./taxonomy.ts";
import { HUBS, aboutPage, hubDeals, hubPage, hubPath, hubTitle, hubsFor } from "./hubs.ts";

export const SITE = "https://bf26-deals.pages.dev/";
// SITE is the primary (canonical) address; BASE is the path prefix of the GitHub Pages mirror build.
// scripts/cf.ts rewrites BASE to "/" for the Cloudflare Pages copy.
export const BASE = "/black-friday-deals-2026/";
export const REPO = "https://github.com/EhsanulHaqueSiam/black-friday-deals-2026";
export const SUGGEST = `${REPO}/issues/new?template=deal.yml`;

export type PageDeal = {
  id: string;
  name: string;
  url: string;
  category: Category;
  subcategory?: string;
  platforms: string[];
  pricing?: string;
  description?: string;
  headline: string;
  deal: string;
  codes: string[];
  discount?: number;
  ends?: string;
  newCustomersOnly?: boolean;
  upcoming?: boolean;
  vendor?: boolean;
  sources: string[];
};

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const slug = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const origin = (u: string) => {
  try {
    return new URL(u).origin;
  } catch {
    return u;
  }
};
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const PLATFORM: Record<string, string> = { web: "Web", mac: "Mac", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android", "browser-extension": "Browser extension", wordpress: "WordPress", physical: "Physical product" };
export const dealPath = (d: PageDeal) => `${BASE}deal/${d.id}/`;
export const catPath = (c: string, s?: string) => `${BASE}c/${slug(c)}/${s ? `${slug(s)}/` : ""}`;
const abs = (path: string) => SITE + path.slice(BASE.length);
// "November 30, 2026" (or "Nov 30" with year=false): the form answer engines quote.
export const fmtLong = (iso: string, year = true) =>
  new Date(iso).toLocaleDateString("en-US", { month: year ? "long" : "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const sentence = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
// Cut at a word boundary so titles and descriptions fit what Google shows.
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n + 1).replace(/[\s,;:(]+\S*$/, "").replace(/[\s,;:]+$/, ""));

// What a deal costs when the offer text says so: "$588 → $199" is 199, "$2.99/mo" is 2.99 a month.
// "$100 off", "$50 credit", "save $20" and "was $588" are not prices.
// shortcut: assumes "$" means USD; upgrade if deals start quoting other dollar currencies.
export function parsePrice(text: string): { price: number; unit?: "MON" | "ANN" } | undefined {
  const arrow = text.lastIndexOf("→");
  const found: { price: number; unit?: "MON" | "ANN"; at: number }[] = [];
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)(?:\s*\/\s*(mo|month|yr|year)\b)?/gi)) {
    const before = text.slice(Math.max(0, m.index - 12), m.index), after = text.slice(m.index + m[0].length);
    if (/(save|saving|up to|over|worth|was|value|normally|regularly|usually|reg\.?)\s*$/i.test(before) || /^\s*(off|credits?|discount|savings?|value|worth|bonus|gift|in\b)/i.test(after)) continue;
    const price = Number(m[1].replace(/,/g, ""));
    if (price > 0) found.push({ price, unit: m[2] ? (/^m/i.test(m[2]) ? "MON" : "ANN") : undefined, at: m.index });
  }
  const pick = (arrow >= 0 && found.find((f) => f.at > arrow)) || found[0];
  return pick && { price: pick.price, unit: pick.unit };
}
export const priceText = (p?: ReturnType<typeof parsePrice>) => (p ? `$${Number.isInteger(p.price) ? p.price : p.price.toFixed(2)}${p.unit === "MON" ? "/mo" : p.unit === "ANN" ? "/yr" : ""}` : "");

// Per-page "last changed" dates. A page's date moves only when its content key changes, so sitemap
// lastmod and dateModified stay truthful instead of all moving on every daily rebuild.
// Kept in data/lastmod.json (generated, committed by CI): path -> content hash, changed, first seen.
type Mod = { h: string; d: string; p: string };
const LASTMOD = "data/lastmod.json";
let OLD: Record<string, Mod> = {};
const MODS: Record<string, Mod> = {};
let TODAY = "";
export function modified(path: string, key: unknown): Mod {
  const h = createHash("sha1").update(JSON.stringify(key)).digest("hex").slice(0, 12);
  const old = OLD[path];
  return (MODS[path] = old?.h === h ? old : { h, d: TODAY, p: old?.p ?? TODAY });
}
export const updatedLine = (m: Mod) => `<p class="updated">Updated <time datetime="${m.d}">${fmtLong(m.d)}</time></p>`;
// WebPage node with real dates; `extra` adds mainEntity, speakable, or a narrower @type.
export const webPage = (path: string, name: string, m: Mod, extra: object = {}) => ({
  "@type": "WebPage", "@id": `${abs(path)}#webpage`, url: abs(path), name, inLanguage: "en",
  isPartOf: { "@type": "WebSite", "@id": `${SITE}#website`, name: "BF26 deals", url: SITE },
  datePublished: m.p, dateModified: m.d, ...extra,
});
// Editors' picks and household brands lead every "best" answer; set once per build by build.ts.
let FEATURED: string[] = [];
export function initPages(builtAt: string, featured: string[]) {
  TODAY = builtAt;
  FEATURED = featured;
  OLD = existsSync(LASTMOD) ? JSON.parse(readFileSync(LASTMOD, "utf8")) : {};
}
const rank = (d: PageDeal) => { const i = FEATURED.indexOf(d.id); return i < 0 ? Infinity : i; };
// Best first: featured deals, then the most popular. The first item is "the best X deal" site-wide.
export const ranked = (ds: PageDeal[]) => [...ds].sort((a, b) => rank(a) - rank(b) || popular(a, b));

// Popularity GitHub Pages can show: how many independent community lists carry the deal.
const lists = (d: PageDeal) => d.sources.filter((s) => !s.startsWith("http")).length;
// Live engagement from the Cloudflare site (/api/stats), fetched by build.ts; same weights as app.js.
let STATS: Record<string, Partial<Record<"view" | "click" | "share" | "search" | "like", number>>> = {};
export const setStats = (s: typeof STATS) => void (STATS = s);
const pop = (d: PageDeal) => { const s = STATS[d.id] ?? {}; return 8 * (s.like ?? 0) + 5 * (s.share ?? 0) + 3 * (s.click ?? 0) + 2 * (s.search ?? 0) + (s.view ?? 0) + 3 * lists(d); };
export const popular = (a: PageDeal, b: PageDeal) => pop(b) - pop(a) || (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name);
const logo = (d: PageDeal, cls = "logo") =>
  `<img class="${cls}" src="https://icons.duckduckgo.com/ip3/${esc(host(d.url))}.ico" alt="" loading="lazy" width="28" height="28" data-initial="${esc(d.name[0] ?? "?")}">`;
const codeBtn = (c: string, label = "Copy") => `<button class="btn code" data-code="${esc(c)}" title="Copy ${esc(c)}">${esc(c)}<i>${esc(label)}</i></button>`;
export const goBtn = (d: PageDeal, label = "Get deal") => `<a class="btn go" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(label)} <span aria-hidden="true">↗</span></a>`;

let ASSET_V = { css: "", page: "" }; // content hashes from build.ts, for cache-busting
// JSON-LD for search engines and answer engines; "</" is escaped so text can't close the script tag.
export const ldScript = (items: object[]) => items.map((x) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...x }).replace(/</g, "\\u003c")}</script>`).join("\n");
export const breadcrumb = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path.slice(BASE.length) })),
});
// Fonts load without blocking first paint (text shows in the fallback font, then swaps).
export const FONTS = `<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap"></noscript>`;
// "<" and ">" percent-encoded so naive HTML parsers don't read the data URI as markup.
const ICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%23000'/%3E%3Ctext x='16' y='22' font-family='Arial' font-weight='700' font-size='15' text-anchor='middle' fill='%23ff6a2b'%3E%25%3C/text%3E%3C/svg%3E">`;
// Links to every "best X" guide; in the footer of every page and on the home page.
export const hubNav = () => `<nav class="hubs">${HUBS.map((h) => `<a href="${hubPath(h)}">${esc(hubTitle(h))}</a>`).join("")}</nav>`;
export function shell(o: { title: string; description: string; path: string; body: string; noindex?: boolean; ld?: object[] }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(SITE + o.path.slice(BASE.length))}">
${o.noindex ? '<meta name="robots" content="noindex">' : ""}
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(SITE + o.path.slice(BASE.length))}">
<meta property="og:image" content="${SITE}og.png">
<meta property="og:site_name" content="BF26 deals">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}og.png">
${ldScript(o.ld ?? [])}
<meta name="theme-color" content="#000000">
${ICON}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${FONTS}
<link rel="stylesheet" href="${BASE}style.css?v=${ASSET_V.css}">
</head>
<body class="page">
<header class="top">
  <a class="brand" href="${BASE}">BF<i>26</i> deals</a>
  <form class="search" action="${BASE}" role="search"><span class="sr">Search deals</span><input name="q" type="search" placeholder="Search deals, codes, brands" autocomplete="off"><kbd>/</kbd></form>
  <a class="btn ghost suggest" href="${BASE}submit/">List your product</a>
</header>
${o.body}
<footer class="sitefoot">
  <nav>${(Object.keys(TAXONOMY) as Category[]).filter((c) => c !== ADULT).map((c) => `<a href="${catPath(c)}">${esc(c)}</a>`).join("")}</nav>
  ${hubNav()}
  <nav class="forco"><a href="${BASE}about/">About</a><a href="${BASE}submit/">List your product</a><a href="${REPO}/issues/new?template=report.yml">Report a deal</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Contribute</a></nav>
  <p>Black Friday &amp; Cyber Monday 2026 deals, merged from 28 community lists and web research. Always check the price at checkout. <a href="${REPO}">Source on GitHub</a></p>
</footer>
<div id="toast" class="toast" role="status"></div>
<script src="${BASE}page.js?v=${ASSET_V.page}"></script>
</body>
</html>
`;
}

// Same compact row as the home page; the name opens the deal's own page.
function row(d: PageDeal) {
  const pct = d.discount && !d.headline.includes(`${d.discount}%`) ? `<span class="pct">${d.discount}% off</span>` : "";
  return `<article class="row static">
    ${logo(d)}
    <div class="n"><a href="${dealPath(d)}">${esc(d.name)}</a>${d.description ? `<small>${esc(d.description)}</small>` : ""}</div>
    <div class="act">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode">No code needed</span>`}${goBtn(d)}</div>
    <div class="h">${d.upcoming ? `<span class="soonTag">Soon</span>` : ""}${pct}${esc(d.headline)}</div>
    <div class="sub">${d.ends ? `<span class="left">ends ${fmt(d.ends)}</span>` : ""}${d.codes.length > 1 ? `<span class="left">${d.codes.length} codes</span>` : ""}</div>
  </article>`;
}

// Share links always point at this site's deal page; visitors then click "Get deal".
function shareBox(d: PageDeal) {
  const url = SITE + dealPath(d).slice(BASE.length);
  const text = `${d.name}: ${d.headline}${d.codes.length ? `, code ${d.codes[0]}` : ""}`;
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  const nets: [string, string][] = [
    ["X", `https://x.com/intent/post?text=${t}&url=${u}`],
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`],
    ["Telegram", `https://t.me/share/url?url=${u}&text=${t}`],
    ["Reddit", `https://www.reddit.com/submit?url=${u}&title=${t}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["Email", `mailto:?subject=${encodeURIComponent(`Black Friday deal: ${d.name}`)}&body=${encodeURIComponent(`${text}\n${url}`)}`],
  ];
  return `<div class="sharebox"><span class="lbl2">Share this deal</span><div class="shares">
    <button class="btn ghost" data-share data-url="${esc(url)}" data-text="${esc(text)}">Share</button>
    <button class="btn ghost" data-copylink="${esc(url)}">Copy link</button>
    ${nets.map(([n, href]) => `<a class="btn ghost net" href="${esc(href)}" target="_blank" rel="noopener">${n}</a>`).join("")}
  </div></div>`;
}

function dealPage(d: PageDeal, related: PageDeal[]) {
  const crumbs = [`<a href="${BASE}">All deals</a>`, `<a href="${catPath(d.category)}">${esc(d.category)}</a>`];
  if (d.subcategory) crumbs.push(`<a href="${catPath(d.category, d.subcategory)}">${esc(d.subcategory)}</a>`);
  const facts = [d.pricing && d.pricing[0].toUpperCase() + d.pricing.slice(1), d.platforms.map((p) => PLATFORM[p] ?? p).join(", "), d.newCustomersOnly ? "New customers only" : ""].filter(Boolean);
  const sources = d.sources.map((s) => (s.startsWith("http") ? `<a href="${esc(s)}" rel="noopener">${esc(host(s))}</a>` : `<a href="https://github.com/${esc(s)}" rel="noopener">${esc(s)}</a>`));
  const update = `${REPO}/issues/new?template=deal.yml&title=${encodeURIComponent(`Update: ${d.name}`)}`;
  const badge = `<a href="${SITE}deal/${d.id}/"><img src="${SITE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"></a>`;
  const title = clip(`${d.name} Black Friday 2026 ${d.codes.length ? "Promo Code" : "Deal"}: ${d.headline}`, 70);
  const m = modified(dealPath(d), d);
  const price = parsePrice(d.headline);
  const qa = dealAnswers(d, price);
  const hubs = hubsFor(d).filter((h) => d.category !== ADULT);
  const body = `<main class="dealpage" data-deal="${esc(d.id)}">
  <nav class="crumb">${crumbs.join(" / ")}</nav>
  <div class="dh">${logo(d, "logo lg")}<div><h1>${esc(d.name)} Black Friday 2026 deal${d.vendor ? ` <span class="vtag" title="Submitted by someone who works for the company">✓ Listed by the company</span>` : ""}</h1>${d.description ? `<p>${esc(d.description)}</p>` : ""}${updatedLine(m)}</div></div>
  <section class="offer">
    <div class="o1">${d.discount ? `<span class="big">${d.discount}% off</span>` : `<span class="big sm">Black Friday offer</span>`}${d.ends ? `<span class="left">ends ${fmt(d.ends)}</span>` : ""}</div>
    <p class="hl">${d.upcoming ? `<span class="soonTag">Coming soon</span>` : ""}${esc(d.headline)}</p>
    <div class="acts">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode btn">No code needed</span>`}${goBtn(d, `Get deal on ${host(d.url) || "site"}`)}</div>
    ${d.codes.length > 1 ? `<details class="more-codes"><summary>${d.codes.length - 1} more code${d.codes.length > 2 ? "s" : ""}</summary><div class="codes">${d.codes.slice(1).map((c) => codeBtn(c)).join("")}</div></details>` : ""}
  </section>
  ${shareBox(d)}
  ${facts.length ? `<p class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p>` : ""}
  <h2 class="lbl">FULL TERMS</h2>
  <p class="terms">${esc(d.deal)}</p>
  <p class="srcs">Sources: ${sources.join(", ")}</p>
  <h2 class="lbl">QUICK ANSWERS</h2>
  <section class="qa">${qa.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join("")}</section>
  ${hubs.length ? `<p class="hublink">Compare: ${hubs.map((h) => `<a href="${hubPath(h)}">${esc(hubTitle(h))}</a>`).join(", ")}</p>` : ""}
  <div class="report"><span>Code didn't work or the deal ended?</span><a class="btn ghost" href="${esc(`${REPO}/issues/new?template=report.yml&title=${encodeURIComponent(`Report: ${d.name}`)}&product=${encodeURIComponent(d.name)}&page=${encodeURIComponent(`${SITE}deal/${d.id}/`)}`)}" target="_blank" rel="noopener">Report it</a></div>
  ${related.length ? `<section class="rel"><h2 class="lbl">MORE ${esc((d.subcategory ?? d.category).toUpperCase())} DEALS</h2>${related.map(row).join("")}</section>` : ""}
  <p class="claim">Your product? <a href="${esc(update)}" target="_blank" rel="noopener">Update this listing</a>.</p>
  <details class="badge"><summary>Add the "Listed on BF26 deals" badge to your site</summary><img src="${BASE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"><textarea readonly rows="3">${esc(badge)}</textarea></details>
</main>`;
  const crumbsLd: [string, string][] = [["All deals", BASE], [d.category, catPath(d.category)]];
  if (d.subcategory) crumbsLd.push([d.subcategory, catPath(d.category, d.subcategory)]);
  crumbsLd.push([d.name, dealPath(d)]);
  const url = abs(dealPath(d));
  const availability = d.upcoming ? "https://schema.org/PreOrder" : "https://schema.org/InStock";
  const seller = { "@type": "Organization", name: d.name, url: origin(d.url) };
  const offerText = `${d.headline}${d.codes.length ? `. Code: ${d.codes.join(", ")}` : ""}`;
  // Google requires a price on Product offers, so Product is used only when the headline states one;
  // otherwise the page's main entity is a plain Offer on a Service, which no rich result validates.
  const main = price
    ? {
        "@type": "Product", name: d.name, description: d.description ?? d.headline, url, image: `${SITE}og.png`,
        brand: { "@type": "Brand", name: d.name }, category: [d.category, d.subcategory].filter(Boolean).join(" > "),
        offers: {
          "@type": "Offer", url: d.url, description: offerText, availability, seller,
          price: price.price, priceCurrency: "USD", ...(d.ends ? { priceValidUntil: d.ends } : {}),
          ...(price.unit ? { priceSpecification: { "@type": "UnitPriceSpecification", price: price.price, priceCurrency: "USD", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: price.unit } } } : {}),
        },
      }
    : {
        "@type": "Offer", name: `${d.name} Black Friday 2026 deal`, description: offerText, url: d.url, availability, seller,
        ...(d.ends ? { validThrough: d.ends } : {}),
        itemOffered: { "@type": "Service", name: d.name, url: d.url, ...(d.description ? { description: d.description } : {}) },
      };
  const description = clip([`${d.name} Black Friday 2026: ${sentence(d.headline)}`, d.codes.length ? `Code ${d.codes[0]}.` : "No code needed.", d.ends ? `Ends ${fmtLong(d.ends)}.` : "", d.newCustomersOnly ? "New customers only." : "", d.description ? sentence(d.description) : ""].filter(Boolean).join(" "), 158);
  return shell({
    title, description, path: dealPath(d), body, noindex: d.category === ADULT,
    ld: [webPage(dealPath(d), title, m, { mainEntity: main }), breadcrumb(crumbsLd), { "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }],
  });
}

// Self-contained answers for one deal (code, end date, price, eligibility), shown on its page and
// marked up as FAQPage so answer engines can quote a full sentence.
function dealAnswers(d: PageDeal, price?: ReturnType<typeof parsePrice>) {
  const out = [
    {
      q: `Is there a ${d.name} Black Friday 2026 promo code?`,
      a: d.codes.length
        ? `Yes: use ${d.codes.length > 1 ? `one of the codes ${d.codes.join(", ")}` : `code ${d.codes[0]}`} at checkout. ${sentence(d.headline)}`
        : `No code is needed. ${sentence(d.headline)} The discount applies on ${host(d.url) || "the vendor's site"}.`,
    },
    {
      q: `When does the ${d.name} Black Friday deal end?`,
      a: `${d.upcoming ? "It is announced but not live yet. " : ""}${d.ends ? `It ends ${fmtLong(d.ends)}.` : "No end date is announced. Most Black Friday 2026 deals run until Cyber Monday, November 30, 2026."}`,
    },
  ];
  if (price) out.push({ q: `How much is ${d.name} on Black Friday 2026?`, a: `${priceText(price)} with this deal: ${sentence(d.headline)}` });
  if (d.newCustomersOnly) out.push({ q: `Can existing ${d.name} customers get the deal?`, a: "No, it is for new customers only." });
  return out;
}

function categoryPage(c: Category, s: string | undefined, ds: PageDeal[], all: PageDeal[]) {
  const inCat = all.filter((d) => d.category === c);
  const subs = [...(TAXONOMY[c] as readonly string[])].map((x) => [x, inCat.filter((d) => d.subcategory === x).length] as const).filter(([, n]) => n);
  const name = s ?? c;
  const crumbs = [`<a href="${BASE}">All deals</a>`, s ? `<a href="${catPath(c)}">${esc(c)}</a>` : ""].filter(Boolean).join(" / ");
  const codes = ds.filter((d) => d.codes.length).length;
  const sorted = ranked(ds);
  const path = catPath(c, s);
  const m = modified(path, sorted.map((d) => [d.id, d.headline, d.codes, d.ends]));
  const guides = HUBS.filter((h) => catPath(...h.all) === path || (!s && h.all[0] === c));
  const top = sorted.length >= 4 ? sorted.slice(0, 3) : [];
  const body = `<main class="catpage">
  <nav class="crumb">${crumbs}</nav>
  <h1>${esc(name)} Black Friday deals 2026</h1>
  ${updatedLine(m)}
  <p class="intro">${sorted[0] ? `Best right now: <a href="${dealPath(sorted[0])}"><b>${esc(sorted[0].name)}</b></a>, ${esc(sorted[0].headline)}${sorted[0].codes.length ? ` (code <code>${esc(sorted[0].codes[0])}</code>)` : ""}. ` : ""}${ds.length} live Black Friday and Cyber Monday 2026 offers${s ? ` in ${esc(c)}` : ""}, ${codes} with promo codes. Editors' picks first, then the most popular.${guides.length ? ` Compare the best: ${guides.map((h) => `<a href="${hubPath(h)}">${esc(hubTitle(h))}</a>`).join(", ")}.` : ""}</p>
  <nav class="subs"><a href="${catPath(c)}" class="${s ? "" : "on"}">All ${inCat.length}</a>${subs.map(([x, n]) => `<a href="${catPath(c, x)}" class="${x === s ? "on" : ""}">${esc(x)} ${n}</a>`).join("")}</nav>
  ${top.length ? `<section class="toppicks"><h2 class="lbl">TOP PICKS IN ${esc(name.toUpperCase())}</h2><div class="tp">${top
    .map((d, i) => `<div class="tc"><span class="rank">#${i + 1}</span><a class="tn" href="${dealPath(d)}">${logo(d)}<b>${esc(d.name)}</b></a>${d.discount ? `<span class="big">${d.discount}% off</span>` : ""}<p>${esc(d.headline)}</p><div class="tact">${d.codes.length ? codeBtn(d.codes[0]) : ""}${goBtn(d)}</div></div>`)
    .join("")}</div></section>` : ""}
  <section class="group"><h2 class="lbl">ALL ${ds.length} DEALS</h2>${sorted.map(row).join("")}</section>
</main>`;
  const crumbsLd: [string, string][] = [["All deals", BASE], [c, catPath(c)]];
  if (s) crumbsLd.push([s, catPath(c, s)]);
  const list = {
    "@type": "ItemList",
    name: `${name} Black Friday 2026 deals`,
    numberOfItems: Math.min(ds.length, 50),
    itemListElement: sorted.slice(0, 50).map((d, i) => ({ "@type": "ListItem", position: i + 1, name: `${d.name}: ${d.headline}`, url: SITE + dealPath(d).slice(BASE.length) })),
  };
  const best = sorted[0] ? ` Best: ${sorted[0].name}, ${sorted[0].headline}.` : "";
  return shell({ title: `${name} Black Friday 2026 Deals (${ds.length})`, description: `${ds.length} live ${name} Black Friday 2026 deals, ${codes} with promo codes.${best}`, path, body, noindex: c === ADULT, ld: [webPage(path, `${name} Black Friday 2026 deals`, m, { "@type": "CollectionPage" }), breadcrumb(crumbsLd), list] });
}


// "List your product": what a listing gets and how submission works (for companies).
function submitPage(deals: PageDeal[]) {
  const body = `<main class="submitpage">
  <h1>List your Black Friday deal</h1>
  <p class="lead">Free. ${deals.length.toLocaleString()} deals and growing, read by people actively looking to buy this week. Your listing goes live as soon as it is approved.</p>
  <div class="cta"><a class="btn go" href="${SUGGEST}" target="_blank" rel="noopener">Submit your deal (2 min form) <span aria-hidden="true">↗</span></a><a class="btn ghost" href="${REPO}/issues/new?template=deal.yml&title=${encodeURIComponent("Update: ")}" target="_blank" rel="noopener">Update an existing listing</a></div>
  <h2 class="lbl">WHAT YOUR LISTING GETS</h2>
  <div class="gets">
    <div class="g"><b>Its own page</b><span>/deal/your-product/ with your offer, codes and a direct link to your site.</span></div>
    <div class="g"><b>A real backlink</b><span>A normal followed link from your page, plus your category page and the sitemap.</span></div>
    <div class="g"><b>Search, filters and "ending soon"</b><span>Found by name, category, platform and deadline views.</span></div>
    <div class="g"><b>"Listed by the company" tag</b><span>Tick "I work for this company" in the form and your page shows it.</span></div>
  </div>
  <h2 class="lbl">HOW IT WORKS</h2>
  <ol class="steps">
    <li><b>Fill the form on GitHub</b><span>Product, offer, code, end date, category and where it's announced. A free GitHub account is needed.</span></li>
    <li><b>A bot checks it</b><span>Within a minute it replies: link works, not a duplicate, valid category, and a preview of your listing.</span></li>
    <li><b>It's approved and goes live</b><span>Approval publishes your page automatically and the bot replies with the link.</span></li>
  </ol>
  <h2 class="lbl">RULES</h2>
  <ul class="rules">
    <li>A real 2026 Black Friday, Cyber Monday or Black Week offer that anyone can check on a public page.</li>
    <li>No permanent prices, free tiers or "coming soon" without details.</li>
    <li>No crypto, casino, trading signals, piracy or "free premium" offers.</li>
  </ul>
  <h2 class="lbl">SHOW YOU'RE LISTED</h2>
  <div class="badgebox"><img src="${BASE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"><span>Copy the badge snippet from your deal page.</span></div>
</main>`;
  return shell({ title: "List your Black Friday 2026 deal for free", description: "Add your product's Black Friday or Cyber Monday 2026 deal to the directory: its own page, a followed link, search and category placement.", path: `${BASE}submit/`, body });
}

export function renderSite(deals: PageDeal[], builtAt: string, v: { css: string; page: string }, sources: number) {
  ASSET_V = v;
  for (const dir of ["docs/deal", "docs/c", "docs/best", "docs/about"]) rmSync(dir, { recursive: true, force: true }); // drop pages of expired deals
  const write = (path: string, html: string) => {
    const file = `docs/${path.slice(BASE.length)}index.html`;
    mkdirSync(file.replace(/index\.html$/, ""), { recursive: true });
    writeFileSync(file, html);
  };
  for (const d of deals) {
    const related = deals.filter((x) => x.id !== d.id && x.category === d.category && x.subcategory === d.subcategory).sort(popular).slice(0, 6);
    write(dealPath(d), dealPage(d, related));
  }
  const pages: string[] = [BASE];
  for (const c of Object.keys(TAXONOMY) as Category[]) {
    const inCat = deals.filter((d) => d.category === c);
    if (!inCat.length) continue;
    write(catPath(c), categoryPage(c, undefined, inCat, deals));
    if (c !== ADULT) pages.push(catPath(c));
    for (const s of TAXONOMY[c] as readonly string[]) {
      const inSub = inCat.filter((d) => d.subcategory === s);
      if (!inSub.length) continue;
      write(catPath(c, s), categoryPage(c, s, inSub, deals));
      if (c !== ADULT) pages.push(catPath(c, s));
    }
  }
  for (const h of HUBS) {
    if (!hubDeals(h, deals).length) continue;
    write(hubPath(h), hubPage(h, deals));
    pages.push(hubPath(h));
  }
  const about = aboutPage(deals.filter((d) => d.category !== ADULT), sources);
  write(about.path, about.html);
  pages.push(about.path);
  write(`${BASE}submit/`, submitPage(deals));
  writeFileSync("docs/404.html", shell({ title: "Page not found | BF26 deals", description: "This deal page doesn't exist or the deal has ended.", path: `${BASE}404`, noindex: true, body: `<main class="submitpage"><h1>This deal isn't here</h1><p class="lead">It may have ended, or the link is wrong. Search above or start from the categories below.</p><div class="cta"><a class="btn go" href="${BASE}">See all live deals</a><a class="btn ghost" href="${BASE}submit/">List your product</a></div></main>` }));
  pages.push(`${BASE}submit/`, ...deals.filter((d) => d.category !== ADULT).map(dealPath));
  writeFileSync(
    "docs/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${abs(p)}</loc><lastmod>${MODS[p]?.d ?? builtAt}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
  // Search and AI crawlers are all welcome; listed by name so the intent is explicit.
  const bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "DuckAssistBot", "meta-externalagent", "CCBot"];
  // Only pages built this time are kept, so expired deals drop out of the file too.
  writeFileSync(LASTMOD, JSON.stringify(Object.fromEntries(Object.entries(MODS).sort(([a], [b]) => a.localeCompare(b))), null, 0).replace(/\},"/g, '},\n"') + "\n");
  writeFileSync("docs/robots.txt", `${bots.map((b) => `User-agent: ${b}\nAllow: /\n`).join("\n")}\nUser-agent: *\nAllow: /\n\nSitemap: ${SITE}sitemap.xml\n`);
  return pages.length;
}

// Crawlable category index for the home page (injected between <!--cats--> markers).
export const categoryNav = (deals: PageDeal[]) =>
  (Object.keys(TAXONOMY) as Category[])
    .filter((c) => c !== ADULT && deals.some((d) => d.category === c))
    .map((c) => `<a href="${catPath(c)}">${esc(c)}</a>`)
    .join("");

// --- Home page extras for crawlers and answer engines -----------------------------------------
// Returns HTML/JSON-LD injected into docs/index.html, and writes llms.txt / llms-full.txt.
export function renderHome(deals: PageDeal[], picks: { id: string; why: string }[], builtAt: string) {
  const visible = deals.filter((d) => d.category !== ADULT);
  const codes = visible.filter((d) => d.codes.length).length;
  // "Best" answers use the same order as the /best/ guides and category pages (see initPages).
  const top = (test: (d: PageDeal) => boolean) => ranked(visible.filter(test))[0];
  const line = (d?: PageDeal) => (d ? `${d.name}: ${d.headline}${d.codes.length ? ` (code ${d.codes[0]})` : ""}${d.ends ? `, ends ${fmt(d.ends)}` : ""}` : "");
  const link = (d?: PageDeal) => (d ? `<a href="${dealPath(d)}">${esc(d.name)}</a>: ${esc(d.headline)}${d.codes.length ? ` (code <code>${esc(d.codes[0])}</code>)` : ""}` : "");
  const soon = visible.filter((d) => d.ends && Date.parse(d.ends) - Date.parse(builtAt) <= 2 * 864e5).sort(popular);

  // Answer-first FAQ: each answer names the current best deal, so answer engines can quote it.
  const best: [string, PageDeal | undefined][] = [...HUBS.map((h) => [h.what, top(h.test)] as [string, PageDeal | undefined]), ["game", top((d) => d.category === "Gaming")]];
  const faq: { q: string; html: string; text: string }[] = [
    { q: "When is Black Friday 2026?", text: "Black Friday 2026 is Friday, November 27, 2026, and Cyber Monday is Monday, November 30, 2026. Most deals in this directory run until November 30 or December 1.", html: "Black Friday 2026 is <b>Friday, November 27</b>, and Cyber Monday is <b>Monday, November 30</b>. Most deals here run until November 30 or December 1." },
    { q: "How many Black Friday 2026 deals are listed here?", text: `${visible.length} live deals, ${codes} with promo codes, merged from 28 community deal lists plus web, X and Reddit research. Updated daily; expired deals are removed.`, html: `<b>${visible.length.toLocaleString()} live deals</b>, ${codes.toLocaleString()} with promo codes, merged from 28 community deal lists plus web, X and Reddit research. Updated daily; expired deals are removed.` },
    ...best.filter(([, d]) => d).map(([what, d]) => ({ q: `What is the best ${what} Black Friday deal in 2026?`, text: `${line(d)}.`, html: `${link(d)}.` })),
    { q: "Which Black Friday deals end soonest?", text: soon.length ? `${soon.length} deals end within 48 hours, including ${soon.slice(0, 3).map((d) => d.name).join(", ")}.` : "See the Last chance section for deals ending soon.", html: soon.length ? `${soon.length} deals end within 48 hours, including ${soon.slice(0, 3).map((d) => `<a href="${dealPath(d)}">${esc(d.name)}</a>`).join(", ")}.` : "See Last chance above." },
    { q: "How do I list my product's Black Friday deal?", text: `Use the free submission form at ${SITE}submit/. Each listing gets its own page with a link to your site.`, html: `Use the free <a href="${BASE}submit/">submission form</a>. Each listing gets its own page with a link to your site.` },
  ];
  const faqHtml = `<section class="faq"><h2>Black Friday 2026: quick answers</h2><p class="updated">Updated <time datetime="${builtAt}">${fmtLong(builtAt)}</time>. <a href="${BASE}about/">How deals are checked</a>.</p>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.html}</p></details>`).join("")}<h2>Best Black Friday 2026 deals by type</h2>${hubNav()}</section>`;
  const ld = ldScript([
    { "@type": "Organization", "@id": `${SITE}#org`, name: "BF26 deals", url: SITE, logo: `${SITE}og.png`, sameAs: [REPO] },
    { "@type": "WebPage", "@id": `${SITE}#webpage`, url: SITE, name: "Black Friday & Cyber Monday 2026 deals and promo codes", dateModified: builtAt, isPartOf: { "@id": `${SITE}#website` }, publisher: { "@id": `${SITE}#org` }, speakable: { "@type": "SpeakableSpecification", cssSelector: [".faq"] } },
    { "@type": "WebSite", "@id": `${SITE}#website`, publisher: { "@id": `${SITE}#org` }, name: "BF26 deals", url: SITE, description: `Directory of ${visible.length} Black Friday and Cyber Monday 2026 deals with promo codes.`, potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
    { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } })) },
    { "@type": "ItemList", name: "Editors' picks: Black Friday 2026", itemListElement: picks.map((p, i) => visible.find((d) => d.id === p.id)).filter(Boolean).map((d, i) => ({ "@type": "ListItem", position: i + 1, name: `${d!.name}: ${d!.headline}`, url: SITE + dealPath(d!).slice(BASE.length) })) },
  ]);
  // What crawlers see before app.js runs: the 60 most popular deals as plain rows.
  const ssr = `<section class="group"><h2 class="sechead">MOST POPULAR DEALS</h2>${[...visible].sort(popular).slice(0, 60).map(row).join("")}</section>`;

  // llms.txt: a compact guide for AI agents; llms-full.txt: every deal, one line each.
  const cats = (Object.keys(TAXONOMY) as Category[]).filter((c) => c !== ADULT && visible.some((d) => d.category === c));
  writeFileSync(
    "docs/llms.txt",
    `# BF26 deals: Black Friday & Cyber Monday 2026 deals directory

> ${visible.length} live Black Friday and Cyber Monday 2026 deals (${codes} with promo codes) on software, AI tools, VPNs, hosting, domains, courses, games and hardware. Merged from 28 community deal lists plus web, X and Reddit research, deduplicated, tagged and updated daily. Built ${builtAt}.

Black Friday 2026 is Friday, November 27. Cyber Monday is Monday, November 30. Prices and codes come from vendors and deal lists; check at checkout.

Updated ${fmtLong(builtAt)}. How deals are sourced, checked and ranked: ${SITE}about/

## Best deal by type (guides with comparison tables)
${HUBS.map((h) => { const ds = hubDeals(h, visible); return ds.length ? `- [${hubTitle(h)}](${abs(hubPath(h))}): ${line(ds[0])}; ${ds.length} deals` : ""; }).filter(Boolean).join("\n")}

## Best deal per category
${cats.map((c) => { const d = top((x) => x.category === c); return `- [${c}](${SITE}c/${slug(c)}/): ${line(d)}`; }).join("\n")}

## Editors' picks
${picks.map((p) => visible.find((d) => d.id === p.id)).filter(Boolean).map((d) => `- [${d!.name}](${SITE}${dealPath(d!).slice(BASE.length)}): ${line(d)}`).join("\n")}

## Data
- [Every deal, one line each](${SITE}llms-full.txt)
- [All deals as JSON](${SITE}data.json): fields name, url, category, subcategory, headline, deal, codes, ends, discount
- [Sitemap](${SITE}sitemap.xml)
- [Subcategories](${SITE}sitemap.xml): every /c/<category>/<subcategory>/ page lists its deals, best first
- [About and method](${SITE}about/)
- [Submit a deal](${SITE}submit/)
- [Source on GitHub](${REPO})
`,
  );
  writeFileSync(
    "docs/llms-full.txt",
    `# BF26 deals: every live Black Friday 2026 deal (${visible.length}), built ${builtAt}
# Format: Name | Category > Subcategory | Offer | Codes | Ends | Deal page | Vendor URL
${[...visible].sort(popular).map((d) => [d.name, [d.category, d.subcategory].filter(Boolean).join(" > "), d.headline, d.codes.join(" ") || "-", d.ends ?? "-", SITE + dealPath(d).slice(BASE.length), d.url].join(" | ")).join("\n")}
`,
  );
  return { ld, ssr, faqHtml };
}
