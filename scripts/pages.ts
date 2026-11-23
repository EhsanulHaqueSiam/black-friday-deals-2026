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

const logo = (d: PageDeal, cls = "logo") =>
  `<img class="${cls}" src="https://icons.duckduckgo.com/ip3/${esc(host(d.url))}.ico" alt="" loading="lazy" width="28" height="28" data-initial="${esc(d.name[0] ?? "?")}">`;
const codeBtn = (c: string, label = "Copy") => `<button class="btn code" data-code="${esc(c)}" title="Copy ${esc(c)}">${esc(c)}<i>${esc(label)}</i></button>`;
const goBtn = (d: PageDeal, label = "Get deal") => `<a class="btn go" href="${esc(d.url)}" target="_blank" rel="noopener">${esc(label)} <span aria-hidden="true">↗</span></a>`;

function shell(o: { title: string; description: string; path: string; body: string; noindex?: boolean }) {
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
<meta name="theme-color" content="#000000">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%23000'/><text x='16' y='22' font-family='Arial' font-weight='700' font-size='15' text-anchor='middle' fill='%23ff6a2b'>%25</text></svg>">
<link rel="stylesheet" href="${BASE}style.css">
</head>
<body class="page">
<header class="top">
  <a class="brand" href="${BASE}">BF<i>26</i> deals</a>
  <form class="search" action="${BASE}" role="search"><span class="sr">Search deals</span><input name="q" type="search" placeholder="Search deals, codes, brands" autocomplete="off"><kbd>/</kbd></form>
  <a class="btn ghost suggest" href="${SUGGEST}" target="_blank" rel="noopener">+ Suggest a deal</a>
</header>
${o.body}
<footer class="sitefoot">
  <nav>${(Object.keys(TAXONOMY) as Category[]).filter((c) => c !== ADULT).map((c) => `<a href="${catPath(c)}">${esc(c)}</a>`).join("")}</nav>
  <p>Black Friday &amp; Cyber Monday 2026 deals, merged from 28 community lists and web research. Always check the price at checkout. <a href="${REPO}">Source on GitHub</a></p>
</footer>
<div id="toast" class="toast" role="status"></div>
<script src="${BASE}page.js"></script>
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
  const body = `<main class="dealpage">
  <nav class="crumb">${crumbs.join(" / ")}</nav>
  <div class="dh">${logo(d, "logo lg")}<div><h1>${esc(d.name)}</h1>${d.description ? `<p>${esc(d.description)}</p>` : ""}</div></div>
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
  ${related.length ? `<section class="rel"><h2 class="lbl">MORE ${esc((d.subcategory ?? d.category).toUpperCase())} DEALS</h2>${related.map(row).join("")}</section>` : ""}
  <p class="claim">Your product? <a href="${esc(update)}" target="_blank" rel="noopener">Update this listing</a>.</p>
  <details class="badge"><summary>Add the "Listed on BF26 deals" badge to your site</summary><img src="${BASE}badge.svg" alt="Listed on BF26 deals" width="168" height="28"><textarea readonly rows="3">${esc(badge)}</textarea></details>
</main>`;
  return shell({ title, description: `${d.name}: ${d.headline}.${d.codes.length ? ` Code ${d.codes[0]}.` : ""}${d.ends ? ` Ends ${fmt(d.ends)}.` : ""} ${d.description ?? ""}`.trim(), path: dealPath(d), body, noindex: d.category === ADULT });
}

function categoryPage(c: Category, s: string | undefined, ds: PageDeal[], all: PageDeal[]) {
  const inCat = all.filter((d) => d.category === c);
  const subs = [...(TAXONOMY[c] as readonly string[])].map((x) => [x, inCat.filter((d) => d.subcategory === x).length] as const).filter(([, n]) => n);
  const name = s ?? c;
  const crumbs = [`<a href="${BASE}">All deals</a>`, s ? `<a href="${catPath(c)}">${esc(c)}</a>` : ""].filter(Boolean).join(" / ");
  const codes = ds.filter((d) => d.codes.length).length;
  const sorted = [...ds].sort((a, b) => (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name));
  const body = `<main class="catpage">
  <nav class="crumb">${crumbs}</nav>
  <h1>${esc(name)} Black Friday deals</h1>
  <p class="intro">${ds.length} live Black Friday and Cyber Monday 2026 offers${s ? ` in ${esc(c)}` : ""}, ${codes} with promo codes. Biggest discounts first.</p>
  <nav class="subs"><a href="${catPath(c)}" class="${s ? "" : "on"}">All ${inCat.length}</a>${subs.map(([x, n]) => `<a href="${catPath(c, x)}" class="${x === s ? "on" : ""}">${esc(x)} ${n}</a>`).join("")}</nav>
  <section class="group">${sorted.map(row).join("")}</section>
</main>`;
  return shell({ title: `${name} Black Friday & Cyber Monday 2026 deals (${ds.length})`, description: `${ds.length} live ${name} Black Friday 2026 deals, ${codes} with promo codes.`, path: catPath(c, s), body, noindex: c === ADULT });
}

export function renderSite(deals: PageDeal[], builtAt: string) {
  for (const dir of ["docs/deal", "docs/c"]) rmSync(dir, { recursive: true, force: true }); // drop pages of expired deals
  const write = (path: string, html: string) => {
    const file = `docs/${path.slice(BASE.length)}index.html`;
    mkdirSync(file.replace(/index\.html$/, ""), { recursive: true });
    writeFileSync(file, html);
  };
  for (const d of deals) {
    const related = deals.filter((x) => x.id !== d.id && x.category === d.category && x.subcategory === d.subcategory).sort((a, b) => (b.discount ?? -1) - (a.discount ?? -1)).slice(0, 6);
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
  pages.push(...deals.filter((d) => d.category !== ADULT).map(dealPath));
  writeFileSync(
    "docs/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${SITE}${p.slice(BASE.length)}</loc><lastmod>${builtAt}</lastmod></url>`).join("\n")}\n</urlset>\n`,
  );
  writeFileSync("docs/robots.txt", `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
  return pages.length;
}

// Crawlable category index for the home page (injected between <!--cats--> markers).
export const categoryNav = (deals: PageDeal[]) =>
  (Object.keys(TAXONOMY) as Category[])
    .filter((c) => c !== ADULT && deals.some((d) => d.category === c))
    .map((c) => `<a href="${catPath(c)}">${esc(c)}</a>`)
    .join("");
