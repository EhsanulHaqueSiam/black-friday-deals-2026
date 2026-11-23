// "Best X Black Friday deals 2026" guides (/best/<slug>/) for high-intent searches, plus the
// /about/ page (sources, method, disclosure). Each guide answers first, names one best pick (the
// same one the home FAQ and llms.txt name), compares the top deals in a table and ends with an
// FAQ built from live data. Rendered by renderSite in pages.ts.
import {
  BASE, REPO, SITE, breadcrumb, catPath, dealPath, esc, fmtLong, goBtn, ldScript, modified,
  parsePrice, priceText, ranked, shell, updatedLine, webPage, type PageDeal,
} from "./pages.ts";
import { ADULT, type Category } from "./taxonomy.ts";

export type Hub = {
  slug: string;
  what: string; // singular noun used in questions: "VPN", "web hosting", "Mac app"
  plural: string; // heading label: "VPN", "Web Hosting", "Mac Apps"
  test: (d: PageDeal) => boolean;
  all: [Category, string?]; // the full category page this guide summarizes
};

// "Mac apps" means Mac-first apps (no Windows build), so cross-platform services like VPNs don't win it.
export const HUBS: Hub[] = [
  { slug: "vpn", what: "VPN", plural: "VPN", test: (d) => d.subcategory === "VPN", all: ["Security & Privacy", "VPN"] },
  { slug: "web-hosting", what: "web hosting", plural: "Web Hosting", test: (d) => d.subcategory === "Web & WordPress Hosting", all: ["Hosting & Cloud", "Web & WordPress Hosting"] },
  { slug: "ai-tools", what: "AI tool", plural: "AI Tools", test: (d) => d.category === "AI Tools", all: ["AI Tools"] },
  { slug: "mac-apps", what: "Mac app", plural: "Mac Apps", test: (d) => d.platforms.includes("mac") && !d.platforms.includes("windows") && d.category !== "Hardware & Electronics", all: ["Mac & Desktop Utilities"] },
  { slug: "online-courses", what: "online course", plural: "Online Courses", test: (d) => d.category === "Learning", all: ["Learning"] },
  { slug: "password-managers", what: "password manager", plural: "Password Managers", test: (d) => d.subcategory === "Password Managers", all: ["Security & Privacy", "Password Managers"] },
  { slug: "developer-tools", what: "developer tool", plural: "Developer Tools", test: (d) => d.category === "Developer Tools", all: ["Developer Tools"] },
  { slug: "domains", what: "domain", plural: "Domains", test: (d) => d.subcategory === "Domains", all: ["Hosting & Cloud", "Domains"] },
];
export const hubPath = (h: Hub) => `${BASE}best/${h.slug}/`;
export const hubTitle = (h: Hub) => `Best ${h.plural} Black Friday Deals 2026`;
// The deals a guide ranks, best first; the first one is "the best X deal" everywhere on the site.
export const hubDeals = (h: Hub, deals: PageDeal[]) => ranked(deals.filter((d) => d.category !== ADULT && h.test(d)));
export const hubsFor = (d: PageDeal) => HUBS.filter((h) => h.test(d));

const TOP = 10;
const code = (d: PageDeal) => (d.codes.length ? `code ${d.codes[0]}` : "no code needed");

export function hubPage(h: Hub, deals: PageDeal[]) {
  const ds = hubDeals(h, deals);
  const top = ds.slice(0, TOP);
  const [best, ...rest] = top;
  const path = hubPath(h);
  const m = modified(path, top.map((d) => [d.id, d.headline, d.codes, d.ends]));
  const allPath = catPath(...h.all);
  const withCodes = ds.filter((d) => d.codes.length);
  const biggest = [...ds].filter((d) => d.discount).sort((a, b) => b.discount! - a.discount!)[0];
  const ends = ds.map((d) => d.ends).filter(Boolean).sort() as string[];

  const answer = `The best ${h.what} Black Friday deal in 2026 is <a href="${dealPath(best)}"><b>${esc(best.name)}</b></a>: ${esc(best.headline)} (${esc(code(best))}${best.ends ? `, ends ${fmtLong(best.ends)}` : ""}).${rest.length ? ` Also worth a look: ${rest.slice(0, 2).map((d) => `<a href="${dealPath(d)}">${esc(d.name)}</a> (${esc(d.headline)})`).join(" and ")}.` : ""} ${ds.length} ${h.what} deals are live; the top ${top.length} are compared below.`;
  const faq: { q: string; a: string }[] = [
    { q: `What is the best ${h.what} Black Friday deal in 2026?`, a: `${best.name}: ${best.headline}, ${code(best)}${best.ends ? `, ends ${fmtLong(best.ends)}` : ""}.` },
    ...(biggest ? [{ q: `Which ${h.what} has the biggest Black Friday 2026 discount?`, a: `${biggest.name}, at ${biggest.discount}% off: ${biggest.headline}.` }] : []),
    ...(withCodes.length ? [{ q: `Which ${h.what} Black Friday deals have promo codes?`, a: `${withCodes.length} of ${ds.length} do, including ${withCodes.slice(0, 4).map((d) => `${d.name} (${d.codes[0]})`).join(", ")}.` }] : []),
    { q: `When do ${h.what} Black Friday deals end?`, a: ends.length ? `The first ends ${fmtLong(ends[0])} and the last ${fmtLong(ends.at(-1)!)}. Deals without a date usually run through Cyber Monday, November 30, 2026.` : "Most run through Cyber Monday, November 30, 2026." },
  ];
  const table = `<div class="cmpwrap"><table class="cmp"><thead><tr><th>#</th><th>Deal</th><th>Offer</th><th>Price</th><th>Code</th><th>Ends</th><th></th></tr></thead><tbody>${top
    .map((d, i) => `<tr><td>${i + 1}</td><td><a href="${dealPath(d)}">${esc(d.name)}</a></td><td>${esc(d.headline)}</td><td>${esc(priceText(parsePrice(d.headline)) || "-")}</td><td>${d.codes.length ? `<code>${esc(d.codes[0])}</code>` : "None needed"}</td><td>${d.ends ? fmtLong(d.ends, false) : "-"}</td><td>${goBtn(d, "Get")}</td></tr>`)
    .join("")}</tbody></table></div>`;
  const title = hubTitle(h);
  const body = `<main class="catpage hubpage">
  <nav class="crumb"><a href="${BASE}">All deals</a> / <a href="${allPath}">${esc(h.all[1] ?? h.all[0])}</a></nav>
  <h1>${esc(title)}</h1>
  ${updatedLine(m)}
  <p class="intro answer">${answer}</p>
  <h2 class="lbl">TOP ${top.length} ${esc(h.plural.toUpperCase())} DEALS COMPARED</h2>
  ${table}
  <h2 class="lbl">QUESTIONS</h2>
  <section class="qa">${faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("")}</section>
  <p class="intro">See all <a href="${allPath}">${ds.length} ${esc(h.what)} deals</a>, or other guides: ${HUBS.filter((x) => x !== h).map((x) => `<a href="${hubPath(x)}">${esc(x.plural)}</a>`).join(", ")}. <a href="${BASE}about/">How deals are picked</a>.</p>
</main>`;
  const ld = [
    webPage(path, title, m, { speakable: { "@type": "SpeakableSpecification", cssSelector: [".answer", ".qa"] } }),
    breadcrumb([["All deals", BASE], [h.all[1] ?? h.all[0], allPath], [title, path]]),
    { "@type": "ItemList", name: title, numberOfItems: top.length, itemListOrder: "https://schema.org/ItemListOrderDescending", itemListElement: top.map((d, i) => ({ "@type": "ListItem", position: i + 1, name: `${d.name}: ${d.headline}`, url: SITE + dealPath(d).slice(BASE.length) })) },
    { "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  const description = `Best ${h.what} Black Friday 2026 deal: ${best.name}, ${best.headline}. Top ${top.length} of ${ds.length} ${h.what} deals compared by price, code and end date.`;
  return shell({ title: `${title}, Compared`, description, path, body, ld });
}

// Who runs the site, where deals come from, how they are ranked and what links may carry.
export function aboutPage(deals: PageDeal[], sources: number) {
  const path = `${BASE}about/`;
  const m = modified(path, ["about-v1", sources]);
  const body = `<main class="submitpage">
  <h1>About BF26 deals</h1>
  ${updatedLine(m)}
  <p class="lead">BF26 deals is an open-source directory of ${deals.length.toLocaleString()} live Black Friday and Cyber Monday 2026 deals on software, AI tools, VPNs, hosting, courses, games and hardware. The code and data are public on <a href="${REPO}">GitHub</a>.</p>
  <h2 class="lbl">WHERE DEALS COME FROM</h2>
  <p>${sources} community deal lists on GitHub, plus web research: vendor sale pages, dated 2026 roundups and posts by the vendors themselves on X and Reddit. Companies can also <a href="${BASE}submit/">submit their own deal</a>; a maintainer approves each one. Every deal page links its sources.</p>
  <h2 class="lbl">HOW THE LIST IS KEPT ACCURATE</h2>
  <ul class="rules">
    <li>The site is rebuilt every day. Deals past their end date, links that no longer load and "coming soon" placeholders are removed.</li>
    <li>Duplicates across lists are merged into one deal; vendor pages and hand-checked entries win over list rows.</li>
    <li>Each page shows the date its deal last changed. Prices and codes come from vendors and deal lists, so check the price at checkout.</li>
    <li>Anyone can <a href="${REPO}/issues/new?template=report.yml">report a deal</a> that ended or a code that failed.</li>
  </ul>
  <h2 class="lbl">HOW DEALS ARE RANKED</h2>
  <p>Editors' picks and household brands come first. After them, deals are ranked by what visitors do (likes, shares, "Get deal" clicks, searches, views) and by how many independent lists carry the deal. "Best" answers on this site use that same order.</p>
  <h2 class="lbl">LINKS</h2>
  <p>Vendor links go straight to the vendor. Some are copied from the source lists and may carry those lists' referral or tracking parameters.</p>
</main>`;
  const ld = [
    webPage(path, "About BF26 deals", m, { "@type": "AboutPage" }),
    breadcrumb([["All deals", BASE], ["About", path]]),
  ];
  return { path, html: shell({ title: "About BF26 deals: sources, method and ranking", description: `How the BF26 Black Friday 2026 deals directory works: ${sources} community lists plus vendor research, rebuilt daily, expired deals removed, and how deals are ranked.`, path, body, ld }) };
}
