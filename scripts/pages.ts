// Static directory pages for GitHub Pages: one page per deal (/deal/<id>/), one per category and
// subcategory (/c/<cat>/, /c/<cat>/<sub>/), plus sitemap.xml and robots.txt. Vendor links are plain
// followed links: listing here gives every vendor a real backlink. Called from build.ts.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { ADULT, TAXONOMY, type Category } from "./taxonomy.ts";

export const SITE = "https://ehsanulhaquesiam.github.io/black-friday-deals-2026/";
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

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const slug = (s: string) => s.toLowerCase().replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
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
const catPath = (c: string, s?: string) => `${BASE}c/${slug(c)}/${s ? `${slug(s)}/` : ""}`;

// Popularity GitHub Pages can show: how many independent community lists carry the deal.
const lists = (d: PageDeal) => d.sources.filter((s) => !s.startsWith("http")).length;
const popular = (a: PageDeal, b: PageDeal) => lists(b) - lists(a) || (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name);
const logo = (d: PageDeal, cls = "logo") =>
  `<img class="${cls}" src="https://icons.duckduckgo.com/ip3/${esc(host(d.url))}.ico" alt="" loading="lazy" width="28" height="28" data-initial="${esc(d.name[0] ?? "?")}">`;
const codeBtn = (c: string, label = "Copy") => `<button class="btn code" data-code="${esc(c)}" title="Copy ${esc(c)}">${esc(c)}<i>${esc(label)}</i></button>`;
const goBtn = (d: PageDeal, label = "Get deal") => `<a class="btn go" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(label)} <span aria-hidden="true">↗</span></a>`;

let ASSET_V = { css: "", page: "" }; // content hashes from build.ts, for cache-busting
// JSON-LD for search engines and answer engines; "</" is escaped so text can't close the script tag.
export const ldScript = (items: object[]) => items.map((x) => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", ...x }).replace(/</g, "\\u003c")}</script>`).join("\n");
export const breadcrumb = (items: [string, string][]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + path.slice(BASE.length) })),
});
function shell(o: { title: string; description: string; path: string; body: string; noindex?: boolean; ld?: object[] }) {
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
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23000'/><text x='16' y='22' font-family='Arial' font-weight='700' font-size='15' text-anchor='middle' fill='%23ff6a2b'>%25</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap">
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
  <nav class="forco"><a href="${BASE}submit/">List your product</a><a href="${REPO}/issues/new?template=report.yml">Report a deal</a><a href="${REPO}/blob/main/CONTRIBUTING.md">Contribute</a></nav>
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

function dealPage(d: PageDeal, related: PageDeal[]) {
  const crumbs = [`<a href="${BASE}">All deals</a>`, `<a href="${catPath(d.category)}">${esc(d.category)}</a>`];
  if (d.subcategory) crumbs.push(`<a href="${catPath(d.category, d.subcategory)}">${esc(d.subcategory)}</a>`);
  const facts = [d.pricing && d.pricing[0].toUpperCase() + d.pricing.slice(1), d.platforms.map((p) => PLATFORM[p] ?? p).join(", "), d.newCustomersOnly ? "New customers only" : ""].filter(Boolean);
  const sources = d.sources.map((s) => (s.startsWith("http") ? `<a href="${esc(s)}" rel="noopener">${esc(host(s))}</a>` : `<a href="https://github.com/${esc(s)}" rel="noopener">${esc(s)}</a>`));
  const update = `${REPO}/issues/new?template=deal.yml&title=${encodeURIComponent(`Update: ${d.name}`)}`;
  const badge = `<a href="${SITE}deal/${d.id}/"><img src="${SITE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"></a>`;
  const title = `${d.name} Black Friday 2026: ${d.headline}`;
  const body = `<main class="dealpage" data-deal="${esc(d.id)}">
  <nav class="crumb">${crumbs.join(" / ")}</nav>
  <div class="dh">${logo(d, "logo lg")}<div><h1>${esc(d.name)}${d.vendor ? ` <span class="vtag" title="Submitted by someone who works for the company">✓ Listed by the company</span>` : ""}</h1>${d.description ? `<p>${esc(d.description)}</p>` : ""}</div></div>
  <section class="offer">
    <div class="o1">${d.discount ? `<span class="big">${d.discount}% off</span>` : `<span class="big sm">Black Friday offer</span>`}${d.ends ? `<span class="left">ends ${fmt(d.ends)}</span>` : ""}</div>
    <p class="hl">${d.upcoming ? `<span class="soonTag">Coming soon</span>` : ""}${esc(d.headline)}</p>
    <div class="acts">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode btn">No code needed</span>`}${goBtn(d, `Get deal on ${host(d.url) || "site"}`)}</div>
    ${d.codes.length > 1 ? `<details class="more-codes"><summary>${d.codes.length - 1} more code${d.codes.length > 2 ? "s" : ""}</summary><div class="codes">${d.codes.slice(1).map((c) => codeBtn(c)).join("")}</div></details>` : ""}
  </section>
  ${facts.length ? `<p class="facts">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p>` : ""}
  <h2 class="lbl">FULL TERMS</h2>
  <p class="terms">${esc(d.deal)}</p>
  <p class="srcs">Sources: ${sources.join(", ")}</p>
  <div class="report"><span>Code didn't work or the deal ended?</span><a class="btn ghost" href="${esc(`${REPO}/issues/new?template=report.yml&title=${encodeURIComponent(`Report: ${d.name}`)}&product=${encodeURIComponent(d.name)}&page=${encodeURIComponent(`${SITE}deal/${d.id}/`)}`)}" target="_blank" rel="noopener">Report it</a></div>
  ${related.length ? `<section class="rel"><h2 class="lbl">MORE ${esc((d.subcategory ?? d.category).toUpperCase())} DEALS</h2>${related.map(row).join("")}</section>` : ""}
  <p class="claim">Your product? <a href="${esc(update)}" target="_blank" rel="noopener">Update this listing</a>.</p>
  <details class="badge"><summary>Add the "Listed on BF26 deals" badge to your site</summary><img src="${BASE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"><textarea readonly rows="3">${esc(badge)}</textarea></details>
</main>`;
  const crumbsLd: [string, string][] = [["All deals", BASE], [d.category, catPath(d.category)]];
  if (d.subcategory) crumbsLd.push([d.subcategory, catPath(d.category, d.subcategory)]);
  crumbsLd.push([d.name, dealPath(d)]);
  const product = {
    "@type": "Product",
    name: d.name,
    description: d.description ?? d.headline,
    url: SITE + dealPath(d).slice(BASE.length),
    image: `https://icons.duckduckgo.com/ip3/${host(d.url)}.ico`,
    brand: { "@type": "Brand", name: d.name },
    category: [d.category, d.subcategory].filter(Boolean).join(" > "),
    offers: {
      "@type": "Offer",
      url: d.url,
      description: `${d.headline}${d.codes.length ? `. Code: ${d.codes.join(", ")}` : ""}`,
      availability: d.upcoming ? "https://schema.org/PreOrder" : "https://schema.org/InStock",
      ...(d.ends ? { priceValidUntil: d.ends } : {}),
    },
  };
  return shell({ title, description: `${d.name}: ${d.headline}.${d.codes.length ? ` Code ${d.codes[0]}.` : ""}${d.ends ? ` Ends ${fmt(d.ends)}.` : ""} ${d.description ?? ""}`.trim(), path: dealPath(d), body, noindex: d.category === ADULT, ld: [breadcrumb(crumbsLd), product] });
}

function categoryPage(c: Category, s: string | undefined, ds: PageDeal[], all: PageDeal[]) {
  const inCat = all.filter((d) => d.category === c);
  const subs = [...(TAXONOMY[c] as readonly string[])].map((x) => [x, inCat.filter((d) => d.subcategory === x).length] as const).filter(([, n]) => n);
  const name = s ?? c;
  const crumbs = [`<a href="${BASE}">All deals</a>`, s ? `<a href="${catPath(c)}">${esc(c)}</a>` : ""].filter(Boolean).join(" / ");
  const codes = ds.filter((d) => d.codes.length).length;
  const sorted = [...ds].sort(popular);
  const top = sorted.length >= 4 ? sorted.slice(0, 3) : [];
  const body = `<main class="catpage">
  <nav class="crumb">${crumbs}</nav>
  <h1>${esc(name)} Black Friday deals</h1>
  <p class="intro">${sorted[0] ? `Best right now: <a href="${dealPath(sorted[0])}"><b>${esc(sorted[0].name)}</b></a>, ${esc(sorted[0].headline)}${sorted[0].codes.length ? ` (code <code>${esc(sorted[0].codes[0])}</code>)` : ""}. ` : ""}${ds.length} live Black Friday and Cyber Monday 2026 offers${s ? ` in ${esc(c)}` : ""}, ${codes} with promo codes. Most popular first.</p>
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
    numberOfItems: ds.length,
    itemListElement: sorted.slice(0, 50).map((d, i) => ({ "@type": "ListItem", position: i + 1, name: `${d.name}: ${d.headline}`, url: SITE + dealPath(d).slice(BASE.length) })),
  };
  const best = sorted[0] ? ` Best: ${sorted[0].name}, ${sorted[0].headline}.` : "";
  return shell({ title: `${name} Black Friday & Cyber Monday 2026 deals (${ds.length})`, description: `${ds.length} live ${name} Black Friday 2026 deals, ${codes} with promo codes.${best}`, path: catPath(c, s), body, noindex: c === ADULT, ld: [breadcrumb(crumbsLd), list] });
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

export function renderSite(deals: PageDeal[], builtAt: string, v: { css: string; page: string }) {
  ASSET_V = v;
  for (const dir of ["docs/deal", "docs/c"]) rmSync(dir, { recursive: true, force: true }); // drop pages of expired deals
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
  write(`${BASE}submit/`, submitPage(deals));
  pages.push(`${BASE}submit/`, ...deals.filter((d) => d.category !== ADULT).map(dealPath));
  writeFileSync(
    "docs/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${SITE}${p.slice(BASE.length)}</loc><lastmod>${builtAt}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
  // Search and AI crawlers are all welcome; listed by name so the intent is explicit.
  const bots = ["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot", "Applebot-Extended", "DuckAssistBot", "meta-externalagent", "CCBot"];
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
export function renderHome(deals: PageDeal[], picks: { id: string; why: string }[], builtAt: string, brands: string[] = []) {
  const visible = deals.filter((d) => d.category !== ADULT);
  const codes = visible.filter((d) => d.codes.length).length;
  // "Best" answers prefer editors' picks and household brands, then the most-listed deal.
  const featured = [...picks.map((p) => p.id), ...brands];
  const rank = (d: PageDeal) => { const i = featured.indexOf(d.id); return i < 0 ? Infinity : i; };
  const top = (test: (d: PageDeal) => boolean) => visible.filter(test).sort((a, b) => rank(a) - rank(b) || popular(a, b))[0];
  const line = (d?: PageDeal) => (d ? `${d.name}: ${d.headline}${d.codes.length ? ` (code ${d.codes[0]})` : ""}${d.ends ? `, ends ${fmt(d.ends)}` : ""}` : "");
  const link = (d?: PageDeal) => (d ? `<a href="${dealPath(d)}">${esc(d.name)}</a>: ${esc(d.headline)}${d.codes.length ? ` (code <code>${esc(d.codes[0])}</code>)` : ""}` : "");
  const soon = visible.filter((d) => d.ends && Date.parse(d.ends) - Date.parse(builtAt) <= 2 * 864e5).sort(popular);

  // Answer-first FAQ: each answer names the current best deal, so answer engines can quote it.
  const best: [string, PageDeal | undefined][] = [
    ["VPN", top((d) => d.subcategory === "VPN")],
    ["password manager", top((d) => d.subcategory === "Password Managers")],
    ["web hosting", top((d) => d.subcategory === "Web & WordPress Hosting")],
    ["domain", top((d) => d.subcategory === "Domains")],
    ["AI tool", top((d) => d.category === "AI Tools")],
    ["developer tool", top((d) => d.category === "Developer Tools")],
    ["Mac app", top((d) => d.platforms.includes("mac") && d.category === "Mac & Desktop Utilities")],
    ["online course", top((d) => d.category === "Learning")],
    ["game", top((d) => d.category === "Gaming")],
  ];
  const faq: { q: string; html: string; text: string }[] = [
    { q: "When is Black Friday 2026?", text: "Black Friday 2026 is Friday, November 27, 2026, and Cyber Monday is Monday, November 30, 2026. Most deals in this directory run until November 30 or December 1.", html: "Black Friday 2026 is <b>Friday, November 27</b>, and Cyber Monday is <b>Monday, November 30</b>. Most deals here run until November 30 or December 1." },
    { q: "How many Black Friday 2026 deals are listed here?", text: `${visible.length} live deals, ${codes} with promo codes, merged from 28 community deal lists plus web, X and Reddit research. Updated daily; expired deals are removed.`, html: `<b>${visible.length.toLocaleString()} live deals</b>, ${codes.toLocaleString()} with promo codes, merged from 28 community deal lists plus web, X and Reddit research. Updated daily; expired deals are removed.` },
    ...best.filter(([, d]) => d).map(([what, d]) => ({ q: `What is the best ${what} Black Friday deal in 2026?`, text: `${line(d)}.`, html: `${link(d)}.` })),
    { q: "Which Black Friday deals end soonest?", text: soon.length ? `${soon.length} deals end within 48 hours, including ${soon.slice(0, 3).map((d) => d.name).join(", ")}.` : "See the Last chance section for deals ending soon.", html: soon.length ? `${soon.length} deals end within 48 hours, including ${soon.slice(0, 3).map((d) => `<a href="${dealPath(d)}">${esc(d.name)}</a>`).join(", ")}.` : "See Last chance above." },
    { q: "How do I list my product's Black Friday deal?", text: `Use the free submission form at ${SITE}submit/. Each listing gets its own page with a link to your site.`, html: `Use the free <a href="${BASE}submit/">submission form</a>. Each listing gets its own page with a link to your site.` },
  ];
  const faqHtml = `<section class="faq"><h2>Black Friday 2026: quick answers</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${f.html}</p></details>`).join("")}</section>`;
  const ld = ldScript([
    { "@type": "WebSite", name: "BF26 deals", url: SITE, description: `Directory of ${visible.length} Black Friday and Cyber Monday 2026 deals with promo codes.`, potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
    { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } })) },
    { "@type": "ItemList", name: "Editors' picks: Black Friday 2026", itemListElement: picks.map((p, i) => visible.find((d) => d.id === p.id)).filter(Boolean).map((d, i) => ({ "@type": "ListItem", position: i + 1, name: `${d!.name}: ${d!.headline}`, url: SITE + dealPath(d!).slice(BASE.length) })) },
  ]);
  // What crawlers see before app.js runs: the 60 most popular deals as plain rows.
  const ssr = `<section class="group"><h3 class="sechead">MOST POPULAR DEALS</h3>${[...visible].sort(popular).slice(0, 60).map(row).join("")}</section>`;

  // llms.txt: a compact guide for AI agents; llms-full.txt: every deal, one line each.
  const cats = (Object.keys(TAXONOMY) as Category[]).filter((c) => c !== ADULT && visible.some((d) => d.category === c));
  writeFileSync(
    "docs/llms.txt",
    `# BF26 deals: Black Friday & Cyber Monday 2026 deals directory

> ${visible.length} live Black Friday and Cyber Monday 2026 deals (${codes} with promo codes) on software, AI tools, VPNs, hosting, domains, courses, games and hardware. Merged from 28 community deal lists plus web, X and Reddit research, deduplicated, tagged and updated daily. Built ${builtAt}.

Black Friday 2026 is Friday, November 27. Cyber Monday is Monday, November 30. Prices and codes come from vendors and deal lists; check at checkout.

## Best deal per category
${cats.map((c) => { const d = top((x) => x.category === c); return `- [${c}](${SITE}c/${slug(c)}/): ${line(d)}`; }).join("\n")}

## Editors' picks
${picks.map((p) => visible.find((d) => d.id === p.id)).filter(Boolean).map((d) => `- [${d!.name}](${SITE}${dealPath(d!).slice(BASE.length)}): ${line(d)}`).join("\n")}

## Data
- [Every deal, one line each](${SITE}llms-full.txt)
- [All deals as JSON](${SITE}data.json): fields name, url, category, subcategory, headline, deal, codes, ends, discount
- [Sitemap](${SITE}sitemap.xml)
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
