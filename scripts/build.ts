// Merges every deal list in sources/ plus data/extra*.json, applies the tags in data/enrich/*.json,
// and writes data/deals.json, docs/data.json (website), data/enrich-queue.json and README.md.
// Run: node scripts/build.ts   (TODAY=YYYY-MM-DD to pin the date)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import {
  TAXONOMY, PLATFORMS, PRICING, ADULT, guessCategory, isCategory, isSubcategory,
  type Category, type Platform, type Pricing,
} from "./taxonomy.ts";

const TODAY = new Date(process.env.TODAY ?? new Date().toISOString().slice(0, 10));
const YEAR = 2026;

type Deal = {
  id: string;
  name: string;
  url: string;
  category: Category;
  subcategory?: string;
  platforms: Platform[];
  pricing?: Pricing;
  description?: string; // our own one-liner, from enrichment
  headline: string; // short offer line for the site; data/headlines/*.json, else the deal's first clause
  deal: string;
  codes: string[];
  discount?: number; // biggest "NN% off" in the deal text
  ends?: string; // YYYY-MM-DD, best guess from the deal text
  newCustomersOnly?: boolean;
  upcoming?: boolean; // announced, not live yet
  sources: string[];
  path: string; // source section path, only used for the fallback category
  about?: string; // source list's description, input for enrichment only (never published)
};
// Tags from data/enrich/*.json (or given inline by a web-research entry).
type Tags = { category: string; subcategory: string; platforms: string[]; pricing: string; description: string };
type Raw = Omit<Deal, "id" | "category" | "platforms" | "headline"> & { tags?: Tags; manual?: boolean };

// Every 2026 Black Friday deal list on GitHub with parseable deals (found with `gh search repos`).
// Freshest and most code-rich first: on duplicates the earlier one wins ties. Append new lists at
// the end so existing deal ids (and their tags in data/enrich/) stay stable.
const SOURCES = [
  ["trungdq88/Awesome-Black-Friday-Cyber-Monday", "table"],
  ["mRs-/Black-Friday-Deals", "table"],
  ["danmindru/rare-big-deal", "table"],
  ["twf-nikhila/Awesome-Black-Friday-Cyber-Monday-deals", "table"],
  ["Pimjo/black-friday-deals", "table"],
  ["dqhieu/black-friday-deals", "table"],
  ["bergside/awesome-black-friday", "bergside"],
  ["v3nomtech/infosec-cert-black-friday-2026", "table"],
  ["sprfrkr/awesome-black-friday-for-developers", "table"],
  ["Shashankt255/black-friday-deals-2026", "table"],
  ["KevinKaul/black-friday-deals-2026", "table"],
  ["thuongtin/awesome-bfcm-2026", "table"],
  ["labex-labs/black-friday-cyber-monday-deals", "table"],
  ["thoughtcook/verified-black-friday", "table"],
  ["longseespace/mac-black-friday", "table"],
  ["MichaelCyger/Domains-Black-Friday-Cyber-Monday", "table"],
  ["tushargugnani/awesome-black-friday-for-developers", "table"],
  ["thephux/awesome-ios-black-friday", "table"],
  ["carmentune/best-black-friday-saas-deals", "table"],
  ["ps-lo/InfoSec-and-Tech-Black-Friday", "table"],
  ["Somi-AI/black-friday-deals", "table"],
  ["imrishit98/Black-Friday-and-Cyber-Monday-Deals", "table"],
  ["tubeagentkit/awesome-black-friday-ai-deals", "table"],
  ["Themefic-Team/black-friday-deals", "table"],
  ["javabuddy/best-black-friday-cyber-monday-deals-for-developers", "table"],
  ["fansize/awesome-black-friday", "table"],
  ["kacperszurek/blackfriday", "list"],
  ["refinism-B/Awesome-Black-Friday-2026-zh", "table"],
] as const;

const SKIP_SECTION = /sponsor|featured|table of contents|previous|earlier|archive|watchlist|ending next|other places|how to|add your|submit|submission|about|why|license|legend|what'?s new|no bf deal|free stuff|categories|tips|disclaimer|credits|contribut|special request|affiliate|\b2025\b/i;

// Markdown/HTML -> plain text that stays readable inside our own table.
const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/[💸♾️🔥⭐️]/gu, "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+\.(?=\s|$)/g, ".")
    .replace(/\s*·\s*(·\s*)+/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·,]+|[\s·,]+$/g, "")
    .trim();

const NOT_CODES = new Set(["OFF", "FREE", "USD", "EUR", "GBP", "NOW", "NEW", "PRO", "PLUS", "ALL", "AND", "LIVE", "BOGO", "SAVE", "LTD", "ONLY", "YEARLY", "ANNUAL", "MONTHLY", "LIFETIME", "TEAM", "BASIC", "STANDARD", "PREMIUM", "STARTER", "BUSINESS", "INDIVIDUAL", "PERSONAL", "SOLO", "MAX", "ULTRA", "CODE", "COUPON", "NOTE", "UTC", "EST", "PST", "PT", "ET", "API", "AI", "VPN", "SSL", "VPS", "MCP", "CLI", "SDK", "SEO", "UI", "UX", "PDF", "MAC", "IOS", "BFCM", "LAUNCH"]);

// Promo codes: `backticked` or <code> tokens, bold tokens with digits, the token after "code"/"coupon"/"promo", or ?promo= in links.
const extractCodes = (raw: string): string[] => {
  const found = new Set<string>();
  const add = (c: string) => {
    c = c.trim().replace(/[.,;:)]+$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/.test(c)) return;
    if (NOT_CODES.has(c.toUpperCase()) || /^\d+$/.test(c) || /^(19|20)\d\d$/.test(c)) return;
    if (!/[A-Z]/.test(c) && !/\d/.test(c)) return; // plain lowercase words are prose
    if (/^\d+(%|x|k|gb|tb|mo|yr)$/i.test(c)) return;
    found.add(c);
  };
  for (const m of raw.matchAll(/`([^`]+)`/g)) add(m[1]);
  for (const m of raw.matchAll(/<code>([^<]+)<\/code>/gi)) add(m[1]);
  for (const m of raw.matchAll(/(?:code|coupon|promo)[^A-Za-z0-9`*]{0,4}[`*]*([A-Za-z0-9_-]{3,30})/gi))
    if ((/[A-Z0-9]/.test(m[1]) && m[1] === m[1].toUpperCase()) || /\d/.test(m[1])) add(m[1]);
  for (const m of raw.matchAll(/\*\*([A-Z0-9][A-Z0-9_-]{3,29})\*\*/g)) if (/\d/.test(m[1])) add(m[1]);
  for (const m of raw.matchAll(/[?&](?:promo|coupon|discount|code)=([A-Za-z0-9_-]{3,30})/gi)) add(m[1]);
  return [...found];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
// Latest date mentioned in the text; that is almost always the end date.
const extractEnd = (text: string): string | undefined => {
  const dates: Date[] = [];
  const yearOf = (month: number, y?: string) => (y ? Number(y) : month <= 1 ? YEAR + 1 : YEAR);
  for (const m of text.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) dates.push(utc(+m[1], +m[2] - 1, +m[3]));
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/gi)) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    dates.push(utc(yearOf(mo, m[3]), mo, +m[2]));
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d\d))?/gi)) {
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    dates.push(utc(yearOf(mo, m[3]), mo, +m[1]));
  }
  const valid = dates.filter((d) => !Number.isNaN(+d) && d.getUTCFullYear() >= YEAR && d.getUTCFullYear() <= YEAR + 1);
  return valid.length ? new Date(Math.max(...valid.map(Number))).toISOString().slice(0, 10) : undefined;
};

const extractDiscount = (text: string) => {
  const pcts = [...text.matchAll(/(\d{1,3})\s?%\s*(?:off|discount)|(?:save|up to)\s*(\d{1,3})\s?%/gi)]
    .map((m) => Number(m[1] ?? m[2]))
    .filter((n) => n > 0 && n <= 100);
  return pcts.length ? Math.max(...pcts) : undefined;
};

const finish = (name: string, url: string, path: string, rawDeal: string, source: string, about?: string, upcoming?: boolean): Raw | undefined => {
  const deal = clean(rawDeal.replace(/[⏳❌ℹ️✅]/gu, ""));
  if (!name || !deal || deal.length < 3 || !/^https?:\/\//.test(url)) return; // the site puts url in href
  if (/\b2025\b/.test(rawDeal) && !/\b2026\b/.test(rawDeal)) return; // leftover from last year
  // Watchlist rows that only say a sale hasn't started ("no BF", "NO PROMO YET", "Not announced").
  if (/^(not announced|no offer|tbd|tba|n\/a|none)\b|not (announced|live) yet|no offer confirmed|\bno (bf|black friday)\b|no promo yet|\bno sale\b|\[?2026 tba\]?|\bdeal tba\b|no promo (?!code)|no 2026 (promo|deal|sale)/i.test(deal)) return;
  return {
    name, url, path, deal, about: about && clean(about),
    codes: extractCodes(rawDeal + " " + url),
    ends: extractEnd(deal),
    discount: extractDiscount(deal),
    newCustomersOnly: /\bnew (customers?|users?|subscribers?|accounts?|members?)\b/i.test(deal) || undefined,
    upcoming: upcoming || undefined,
    sources: [source],
  };
};

const splitRow = (line: string) =>
  line.trim().replace(/^\||\|$/g, "")
    .split(/\|(?![^\[]*\])(?![^(]*\))/) // pipes outside [link text] and (urls)
    .map((c) => c.trim());

function* sections(md: string) {
  let section = "", sub = "";
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const title = clean(h[2]);
      if (h[1].length <= 2) [section, sub] = [title, ""];
      else sub = title;
      continue;
    }
    if (!section || SKIP_SECTION.test(section) || SKIP_SECTION.test(sub)) continue;
    yield { line, path: `${section} > ${sub}` };
  }
}

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;
// Table header words -> column role. Lists name their columns differently; anything else is deal text.
const NAME_COL = /^(product|name|app|apps|tool|service|vendor|platform|provider|company|brand|course|deal)$/;
const DESC_COL = /desc|what it|what to|about|why|focus|overview|summary|說明/;
const SKIP_COL = /^(#|link|links|source|sources|order|status|checked|verified|platforms?|category|categories|get deal|url|website)$/;
const GENERIC_LINK = /^(link|visit|order|get( the)? deal|deal|website|buy|here|source|github|shop|claim|offer details|redeem)\b/i;
const STATUS = /[⏳❌ℹ️✅]/u;

// One table row -> deal, using the header row (when it names its columns) to tell the name,
// description and deal columns apart; otherwise "name link, then description, then deal".
function tableRow(cells: string[], header: string[], path: string, source: string): Raw | undefined {
  const key = header.map((h) => h.toLowerCase().replace(/[^a-z說明 ]/g, "").trim());
  const hasHeader = key.length === cells.length && key.some((h) => DESC_COL.test(h) || /deal|offer|discount|code|price|ends|expires|dates?/.test(h));
  let ni = hasHeader ? key.findIndex((h) => NAME_COL.test(h) && (h !== "deal" || LINK.test(cells[key.indexOf(h)]))) : -1;
  if (ni < 0 || !clean(cells[ni] ?? "")) ni = cells.findIndex((c) => LINK.test(c) && !GENERIC_LINK.test(clean(c.match(LINK)![1])));
  if (ni < 0) return;
  const own = cells[ni].match(LINK);
  let name: string = clean(own ? own[1] : cells[ni].split(/<br\s*\/?>/i)[0]);
  // "Tool, 50% off ..., Black Friday 2026": the offer belongs in the deal, not the name.
  if (name.includes(", ") && (name.length > 40 || /\d+ ?% off|black friday|cyber monday|\$\d/i.test(name))) name = name.split(", ")[0];
  const url = own?.[2] ?? cells.map((c) => c.match(LINK)?.[2]).find((u) => u && !u.includes("github.com"));
  if (!name || !url || NAME_COL.test(name.toLowerCase())) return;

  let about = /<br\s*\/?>/i.test(cells[ni]) ? cells[ni].split(/<br\s*\/?>/i).slice(1).join(" ") : "";
  const parts: string[] = [];
  if (hasHeader) {
    cells.forEach((c, i) => {
      if (i === ni || !/[\p{L}\p{N}]/u.test(clean(c))) return; // empty, dash or emoji-only cells
      if (DESC_COL.test(key[i])) about ||= c;
      else if (SKIP_COL.test(key[i])) parts.push(c.match(STATUS)?.[0] ?? "");
      // short cells such as "$5.00" read better with their column name
      else parts.push(clean(c).length < 25 && key[i] && !/deal|offer|discount|promo/.test(key[i]) ? `${clean(header[i])}: ${c}` : c);
    });
  } else {
    const rest = cells.slice(ni + 1);
    if (!about && rest.length > 1) about = rest.shift()!;
    parts.push(...rest);
  }
  const rawDeal = parts.filter(Boolean).join(" · ");
  const status = rawDeal.match(STATUS)?.[0];
  if (status === "❌" || status === "ℹ️") return;
  const d = finish(name, url, path, rawDeal, source, about, status === "⏳");
  // An "Ends"/"Expires" column is the end date; other dates in the row are often "checked on" notes.
  const endCol = hasHeader ? key.findIndex((h) => /^(ends?|expires?|end date|valid until|until|validity)$/.test(h)) : -1;
  if (d && endCol >= 0) d.ends = extractEnd(clean(cells[endCol]));
  return d;
}

function parseTable(md: string, source: string): Raw[] {
  const out: Raw[] = [];
  let prev: string[] = [];
  let header: string[] = [];
  for (const { line, path } of sections(md)) {
    const t = line.trim();
    if (!t.startsWith("|")) {
      if (t) [prev, header] = [[], []]; // a table ended
      continue;
    }
    if (/^\|\s*:?-{2,}/.test(t)) {
      header = prev.map(clean);
      continue;
    }
    const cells = splitRow(line);
    prev = cells;
    // Card grids: several "[Name](url)<br>offer" cells in one row, one deal each.
    const cards = cells.filter((c) => /^\**\[[^\]]+\]\(https?:[^)]+\)\**[^<]{0,40}<br/i.test(c));
    if (cards.length >= 2) {
      for (const c of cards) {
        const [, n, u] = c.match(LINK)!;
        const d = finish(clean(n), u, path, c.split(/<br\s*\/?>/i).slice(1).join(" · "), source);
        if (d) out.push(d);
      }
      continue;
    }
    const d = tableRow(cells, header, path, source);
    if (!d) continue;
    // Same product on consecutive rows (domain lists have one row per TLD): one deal with every line.
    const last = out.at(-1);
    if (last && last.name === d.name && last.sources[0] === source) {
      last.deal += ` / ${d.deal}`;
      last.codes = [...new Set([...last.codes, ...d.codes])];
      last.ends = [last.ends, d.ends].filter(Boolean).sort().pop();
      last.discount = Math.max(last.discount ?? 0, d.discount ?? 0) || undefined;
    } else out.push(d);
  }
  return out;
}

// "- [Name](url) - description - offer" bullet lists.
function parseList(md: string, source: string): Raw[] {
  const out: Raw[] = [];
  for (const { line, path } of sections(md)) {
    const m = line.match(/^\s*[-*] .*?\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\s*[-–:]\s*(.*)/);
    const d = m && finish(clean(m[1]), m[2], path, m[3], source);
    if (d) out.push(d);
  }
  return out;
}

// bergside: "- **[Name](affiliate)** - description" followed by a <details> block with the terms.
function parseBergside(md: string, source: string): Raw[] {
  const out: Raw[] = [];
  let cur: { name: string; url: string; about: string; path: string; body: string[] } | undefined;
  const flush = () => {
    if (!cur) return;
    const text = cur.body.join(" ");
    const offer = text.match(/\[Offer details\]\((https?:\/\/[^)\s]+)\)/)?.[1];
    const d = finish(cur.name, offer ?? cur.url, cur.path, text.replace(/\[(Offer details|Promotion terms)\]\([^)]*\)/g, ""), source, cur.about);
    if (d) out.push(d);
    cur = undefined;
  };
  for (const { line, path } of sections(md)) {
    const item = line.match(/^- .*?\*\*\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\*\*\s*-\s*(.*)/);
    if (item) {
      flush();
      cur = { name: clean(item[1]), url: item[2], about: item[3], path, body: [] };
    } else if (cur && line.trim()) cur.body.push(line.replace(/<\/?(details|summary)>/g, " ").trim());
  }
  flush();
  return out;
}

// --- load -------------------------------------------------------------------
const fileFor = (repo: string) => `sources/${repo.replace("/", "_")}.md`;
// --fetch refreshes sources/ with each list's current README (needs the gh CLI, logged in).
if (process.argv.includes("--fetch"))
  for (const [repo] of SOURCES) {
    const b64 = execFileSync("gh", ["api", `repos/${repo}/readme`, "--jq", ".content"], { encoding: "utf8" });
    writeFileSync(fileFor(repo), Buffer.from(b64, "base64").toString("utf8"));
  }
const raws: Raw[] = [];
const perSource: Record<string, number> = {};
for (const [repo, kind] of SOURCES) {
  if (!existsSync(fileFor(repo))) throw new Error(`missing ${fileFor(repo)}: run with --fetch`);
  const md = readFileSync(fileFor(repo), "utf8");
  const rows = kind === "bergside" ? parseBergside(md, repo) : kind === "list" ? parseList(md, repo) : parseTable(md, repo);
  perSource[repo] = rows.length;
  raws.push(...rows);
}

// Deals found by web research. Shape: { name, url, category, deal, codes, ends?, upcoming?, source }.
type Extra = { name: string; url: string; category: string; deal: string; codes?: string[]; ends?: string; upcoming?: boolean; source: string }
  & Partial<Pick<Tags, "subcategory" | "platforms" | "pricing" | "description">>;
// data/extra.json is checked by hand, so it loads first and wins ties against agent research.
const extraFiles = readdirSync("data").filter((f) => /^extra.*\.json$/.test(f)).sort((a, b) => +(b === "extra.json") - +(a === "extra.json"));
for (const f of extraFiles) {
  for (const e of JSON.parse(readFileSync(`data/${f}`, "utf8")) as Extra[]) {
    const d = finish(e.name, e.url, e.category, e.deal, e.source, undefined, e.upcoming);
    const tags = e.subcategory ? { category: e.category, subcategory: e.subcategory, platforms: e.platforms ?? [], pricing: e.pricing ?? "", description: e.description ?? "" } : undefined;
    if (d) raws.push({ ...d, codes: e.codes?.length ? e.codes : d.codes, ends: e.ends ?? d.ends, tags, manual: f === "extra.json" || undefined });
  }
}

// --- merge duplicates ---------------------------------------------------------
// Name without taglines: "Quotion - Apple Notes to blogs" -> "quotion"
const nameKey = (n: string) =>
  n.split(/\s[-–—:|]\s|\s\(|:\s/)[0].toLowerCase().replace(/\.(com|app|io|ai|dev|co|so)$/, "").replace(/[^a-z0-9]/g, "");
const urlKey = (u: string) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return u;
  }
};
// Web-researched deals (source is a URL) were checked against the vendor's 2026 page, so they win.
const score = (d: Raw) =>
  (d.manual ? 32 : 0) + (d.sources.some((s) => s.startsWith("http")) ? 8 : 0) + (d.codes.length ? 4 : 0) + (d.ends ? 2 : 0) + (d.upcoming ? 0 : 1);

const byKey = new Map<string, Raw>();
const merged: Raw[] = [];
for (const d of raws) {
  const keys = [nameKey(d.name) && `n:${nameKey(d.name)}`, `u:${urlKey(d.url)}`].filter(Boolean);
  const hit = keys.map((k) => byKey.get(k)).find(Boolean);
  if (!hit) {
    merged.push(d);
    keys.forEach((k) => byKey.set(k, d));
    continue;
  }
  const sources = [...new Set([...hit.sources, ...d.sources])];
  const about = hit.about ?? d.about;
  if (score(d) > score(hit)) Object.assign(hit, d, { name: hit.name }); // first name keeps the id (and its tags) stable
  Object.assign(hit, { sources, about });
  keys.forEach((k) => byKey.set(k, hit));
}

// --- ids + enrichment -------------------------------------------------------------
const tags: Record<string, Tags> = {};
if (existsSync("data/enrich"))
  for (const f of readdirSync("data/enrich").filter((f) => f.endsWith(".json")))
    Object.assign(tags, JSON.parse(readFileSync(`data/enrich/${f}`, "utf8")));

// Short offer lines written per deal id; until one exists, the deal text's first clause.
const headlines: Record<string, string> = {};
if (existsSync("data/headlines"))
  for (const f of readdirSync("data/headlines").filter((f) => f.endsWith(".json")))
    Object.assign(headlines, JSON.parse(readFileSync(`data/headlines/${f}`, "utf8")));
const autoHeadline = (deal: string) => {
  const first = deal.split(/ · |; |\. (?=[A-Z])/)[0];
  return first.length > 90 ? first.slice(0, 88).replace(/\s+\S*$/, "") + "…" : first;
};

const seen = new Set<string>();
const bad: string[] = [];
const deals: Deal[] = merged.map((r) => {
  let id = nameKey(r.name) || urlKey(r.url).replace(/[^a-z0-9]/g, "");
  for (let n = 2; seen.has(id); n++) id = `${nameKey(r.name)}-${n}`;
  seen.add(id);
  const t = tags[id] ?? r.tags;
  if (t && !(isCategory(t.category) && isSubcategory(t.category, t.subcategory))) bad.push(`${id}: ${t.category} > ${t.subcategory}`);
  const ok = t && isCategory(t.category) && isSubcategory(t.category, t.subcategory);
  return {
    ...r,
    id,
    category: ok ? (t.category as Category) : guessCategory(r.path),
    subcategory: ok ? t.subcategory : undefined,
    platforms: (t?.platforms ?? []).filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p)),
    pricing: PRICING.find((p) => p === t?.pricing),
    description: t?.description,
    headline: headlines[id] ?? autoHeadline(r.deal),
    // The headline names the main offer; the deal text's biggest % can be an unrelated "up to".
    discount: (headlines[id] && extractDiscount(headlines[id])) || r.discount,
  };
});
if (bad.length) console.warn(`ignored ${bad.length} tags outside the taxonomy:\n  ${bad.slice(0, 20).join("\n  ")}`);

const expired = deals.filter((d) => d.ends && new Date(d.ends) < TODAY);
// Enrichment agents mark listings with no actual offer ("No offer confirmed yet") this way.
const notDeals = deals.filter(
  (d) => d.description?.startsWith("NOT A DEAL") || /^(tba|free|free to use|free, self-hosted)$|no storewide (sale|discount)/i.test(d.headline),
);
const live = deals
  .filter((d) => !expired.includes(d) && !notDeals.includes(d))
  .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

// --- write data ----------------------------------------------------------------------
const publish = ({ path, about, tags: _, manual: __, ...d }: Deal & { tags?: Tags; manual?: boolean }) => d;
mkdirSync("docs", { recursive: true });
writeFileSync("data/deals.json", JSON.stringify(live.map(publish), null, 2) + "\n");
const stats = { live: live.length, withCodes: live.filter((d) => d.codes.length).length, sources: SOURCES.length, sourceRepos: SOURCES.map(([r]) => r), builtAt: TODAY.toISOString().slice(0, 10) };
// Editors' picks: [{ id, why }] chosen by hand; ids that are no longer live drop out.
const picks = existsSync("data/picks.json")
  ? (JSON.parse(readFileSync("data/picks.json", "utf8")) as { id: string; why: string }[]).filter((p) => live.some((d) => d.id === p.id))
  : [];
writeFileSync("docs/data.json", JSON.stringify({ ...stats, taxonomy: TAXONOMY, picks, deals: live.map(publish) }));
writeFileSync(
  "data/enrich-queue.json",
  JSON.stringify(live.filter((d) => !d.subcategory).map((d) => ({ id: d.id, name: d.name, url: d.url, section: d.path, about: d.about, deal: d.deal.slice(0, 240) })), null, 1) + "\n",
);

// --- README -------------------------------------------------------------------------
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
const srcTag = (s: string) => (s.startsWith("http") ? `[web](${s})` : `[${s.split("/")[0]}](https://github.com/${s})`);
const row = (d: Deal) =>
  `| [${cell(d.name)}](${d.url}) | ${cell(d.description ?? "")} | ${d.upcoming ? "**Coming soon.** " : ""}${cell(d.deal.length > 280 ? d.deal.slice(0, 277) + "..." : d.deal)} | ${d.codes.map((c) => `\`${c}\``).join(" ")} | ${shortDate(d.ends)} | ${d.sources.map(srcTag).join(" ")} |`;
const HEAD = "| Product | What it is | Deal | Code | Ends | Source |\n|---|---|---|---|---|---|";

const cats = (Object.keys(TAXONOMY) as Category[])
  .map((c) => {
    const ds = live.filter((d) => d.category === c);
    const subs = [...TAXONOMY[c], undefined]
      .map((s) => [s ?? "More", ds.filter((d) => d.subcategory === s)] as const)
      .filter(([, x]) => x.length);
    return { c, ds, subs };
  })
  .filter((x) => x.ds.length);

const soon = new Date(+TODAY + 3 * 864e5);
const endingSoon = live.filter((d) => d.ends && new Date(d.ends) <= soon && d.category !== ADULT).sort((a, b) => a.ends!.localeCompare(b.ends!));

const readme = `# Black Friday & Cyber Monday 2026 Deals, All in One List

**${stats.live} live deals**, **${stats.withCodes} with promo codes**, in ${cats.length} categories. Merged from ${SOURCES.length} community deal lists on GitHub plus big-brand deals (VPNs, domains, hosting, password managers, courses, streaming, hardware) found by web research. Duplicates and expired deals are removed.

**Browse, search and filter on the website: https://ehsanulhaquesiam.github.io/black-friday-deals-2026/**

Black Friday is **Nov 27, 2026**, Cyber Monday is **Nov 30, 2026**. Last built **${stats.builtAt}**.

> Always check the price at checkout. "Ends" is the latest date mentioned in the deal, so treat it as a guide.

## Categories

${cats.map(({ c, ds, subs }) => `- **[${c}](#${anchor(c)})** (${ds.length}): ${subs.map(([s, x]) => `${s} ${x.length}`).join(", ")}`).join("\n")}

## Ending in the next 3 days

${HEAD}
${endingSoon.map(row).join("\n")}

${cats
  .map(({ c, subs }) => {
    const body = subs.map(([s, x]) => `### ${s}\n\n${HEAD}\n${x.map(row).join("\n")}\n`).join("\n");
    return c === ADULT ? `## ${c}\n\n<details><summary>18+ only. Click to show.</summary>\n\n${body}\n</details>\n` : `## ${c}\n\n${body}`;
  })
  .join("\n")}
## Sources

Merged from these lists. Thank you to their maintainers and contributors.

${SOURCES.map(([s]) => `- [${s}](https://github.com/${s})`).join("\n")}
- Web research: vendor Black Friday pages and dated 2026 roundups, linked per deal as "web".

${raws.length} rows parsed, ${merged.length} unique deals after merging, ${expired.length} expired and ${notDeals.length} unconfirmed listings removed. Descriptions are written for this list.

## Rebuild

\`\`\`sh
node scripts/build.ts --fetch  # pull every list's latest README (needs gh), then rebuild
node scripts/build.ts          # rebuild data/deals.json, docs/data.json and README.md (Node 23.6+)
\`\`\`

All data is in [data/deals.json](data/deals.json). To add a deal, add it to \`data/extra.json\` and open a PR.
`;
writeFileSync("README.md", readme);
console.table(perSource);
console.log({ parsed: raws.length, unique: merged.length, expired: expired.length, ...stats, sourceRepos: undefined, tagged: live.filter((d) => d.subcategory).length, queue: live.filter((d) => !d.subcategory).length });
