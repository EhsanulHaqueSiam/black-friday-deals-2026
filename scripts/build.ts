// Merges every deal list in sources/ (markdown READMEs) plus data/extra.json
// into data/deals.json and README.md. Run: node scripts/build.ts
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const TODAY = new Date(process.env.TODAY ?? new Date().toISOString().slice(0, 10));
const YEAR = 2026;

type Deal = {
  name: string;
  url: string;
  category: Category;
  deal: string;
  codes: string[];
  ends?: string; // YYYY-MM-DD, best guess from the deal text
  upcoming?: boolean; // listed but not live yet
  sources: string[];
};

// Source repos, freshest and most code-rich first: on duplicates the earlier one wins ties.
const SOURCES = [
  "trungdq88/Awesome-Black-Friday-Cyber-Monday",
  "mRs-/Black-Friday-Deals",
  "danmindru/rare-big-deal",
  "twf-nikhila/Awesome-Black-Friday-Cyber-Monday-deals",
  "Pimjo/black-friday-deals",
  "KevinKaul/black-friday-deals-2026",
] as const;

// Ordered: the first rule whose pattern matches "Section > Subsection" wins.
const CATEGORIES = [
  ["VPN, Privacy & Security", /vpn|privacy|security|password/i],
  ["Hosting, Cloud & Domains", /hosting|domain|vps|server|cloud/i],
  ["AI Tools", /\bai\b|\bml\b/i],
  ["Courses, Books & Learning", /course|book|learning|education|reference|training|cert/i],
  ["Gaming & Hardware", /gam|electronic|hardware|console|peripheral|laptop|monitor|chair/i],
  ["WordPress & No-Code", /wordpress|no-?code|website builder/i],
  ["UI Kits, Templates & Icons", /ui kit|template|icon|boilerplate|starter|design asset/i],
  ["Developer Tools", /develop|dev tools|\bapi/i],
  ["Design, Photo & Video", /design|graphic|photo|image|video|audio|podcast|creative|screenshot/i],
  ["Marketing, SEO & Social", /marketing|seo|social|lead gen|newsletter|email/i],
  ["Business & Finance", /business|financ|startup|operations|bundle/i],
  ["Productivity", /productiv|notes|task|focus|writing|todo|planning|automation/i],
  ["Mac & Desktop Apps", /mac|desktop|menu bar|window|clipboard|tvos/i],
  ["iOS & Mobile Apps", /ios|mobile/i],
  ["Health & Lifestyle", /health|fitness|lifestyle|travel|home|navigation|hobby/i],
  ["Utilities", /utilit/i],
] as const;
type Category = (typeof CATEGORIES)[number][0] | "Other";

const SKIP_SECTION = /sponsor|featured|content|previous|earlier|other places|how to|add your|submission|about|why|license|legend|what'?s new|no bf deal|free stuff|categories/i;

const categorize = (path: string): Category => CATEGORIES.find(([, re]) => re.test(path))?.[0] ?? "Other";

// Markdown/HTML cell -> plain text that stays readable inside our own table.
const clean = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, " · ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|~~/g, "")
    .replace(/[💸♾️🔥⭐️]/gu, "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*·\s*(·\s*)+/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·]+|[\s·]+$/g, "")
    .trim();

const NOT_CODES = new Set(["OFF", "FREE", "USD", "EUR", "GBP", "NOW", "NEW", "PRO", "PLUS", "ALL", "AND", "LIVE", "BOGO", "SAVE", "LTD", "ONLY", "YEARLY", "ANNUAL", "MONTHLY", "LIFETIME", "TEAM", "BASIC", "STANDARD", "PREMIUM", "STARTER", "BUSINESS", "INDIVIDUAL", "PERSONAL", "SOLO", "MAX", "ULTRA", "CODE", "COUPON", "NOTE", "UTC", "EST", "PST", "PT", "ET", "API", "AI", "VPN", "SSL", "VPS", "MCP", "CLI", "SDK", "SEO", "UI", "UX", "PDF", "MAC", "IOS", "BFCM"]);

// Promo codes: `backticked` or **bold** tokens, or the token after "code"/"coupon"/"promo".
const extractCodes = (raw: string): string[] => {
  const found = new Set<string>();
  const add = (c: string) => {
    c = c.trim().replace(/[.,;:)]+$/, "");
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/.test(c)) return;
    if (NOT_CODES.has(c.toUpperCase()) || /^\d+$/.test(c) || /^(19|20)\d\d$/.test(c)) return;
    if (!/[A-Z]/.test(c) && !/\d/.test(c)) return; // plain lowercase words are prose, not codes
    if (/^\d+(%|x|k|gb|tb|mo|yr)$/i.test(c)) return;
    found.add(c);
  };
  for (const m of raw.matchAll(/`([^`]+)`/g)) add(m[1]);
  for (const m of raw.matchAll(/<code>([^<]+)<\/code>/gi)) add(m[1]);
  for (const m of raw.matchAll(/(?:code|coupon|promo)[^A-Za-z0-9`*]{0,4}[`*]*([A-Za-z0-9_-]{3,30})/gi)) {
    if (/[A-Z0-9]/.test(m[1]) && m[1] === m[1].toUpperCase()) add(m[1]);
    else if (/\d/.test(m[1])) add(m[1]);
  }
  for (const m of raw.matchAll(/\*\*([A-Z0-9][A-Z0-9_-]{3,29})\*\*/g)) if (/\d/.test(m[1])) add(m[1]);
  for (const m of raw.matchAll(/[?&](?:promo|coupon|discount|code)=([A-Za-z0-9_-]{3,30})/gi)) add(m[1]);
  return [...found];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// Latest Nov-Jan date mentioned anywhere in the text; that is almost always the end date.
const extractEnd = (text: string): string | undefined => {
  const dates: Date[] = [];
  for (const m of text.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)\b/g)) dates.push(new Date(`${m[1]}-${m[2]}-${m[3]}`));
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d\d))?/gi)) {
    const month = MONTHS.indexOf(m[1].toLowerCase());
    const year = m[3] ? Number(m[3]) : month === 0 ? YEAR + 1 : YEAR;
    dates.push(new Date(Date.UTC(year, month, Number(m[2]))));
  }
  for (const m of text.matchAll(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:,?\s+(20\d\d))?/gi)) {
    const month = MONTHS.indexOf(m[2].toLowerCase());
    const year = m[3] ? Number(m[3]) : month === 0 ? YEAR + 1 : YEAR;
    dates.push(new Date(Date.UTC(year, month, Number(m[1]))));
  }
  const valid = dates.filter((d) => !Number.isNaN(+d) && d.getUTCFullYear() >= YEAR && d.getUTCFullYear() <= YEAR + 1);
  if (!valid.length) return;
  return new Date(Math.max(...valid.map(Number))).toISOString().slice(0, 10);
};

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    // split on pipes that are not inside [link text] or (urls)
    .split(/\|(?![^\[]*\])(?![^(]*\))/)
    .map((c) => c.trim());

function parseMarkdown(md: string, source: string): Deal[] {
  const deals: Deal[] = [];
  let section = "";
  let sub = "";
  for (const line of md.split("\n")) {
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const title = clean(h[2]);
      if (h[1].length <= 2) [section, sub] = [title, ""];
      else sub = title;
      continue;
    }
    if (!line.trim().startsWith("|") || /^\|\s*:?-{2,}/.test(line.trim())) continue;
    if (SKIP_SECTION.test(section) || SKIP_SECTION.test(sub) || !section) continue;

    const cells = splitRow(line);
    const i = cells.findIndex((c) => /\[[^\]]+\]\(https?:\/\/[^)]+\)/.test(c));
    if (i < 0) continue;
    const link = cells[i].match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/)!;
    const name = clean(link[1]);
    if (!name || /^(product|name|tool)$/i.test(name)) continue;

    const rest = cells.slice(i + 1);
    const inlineDesc = /<br\s*\/?>/i.test(cells[i]);
    const dealCells = inlineDesc ? rest : rest.slice(1);
    const rawDeal = (dealCells.length ? dealCells : rest).join(" · ");
    const status = rawDeal.match(/[⏳❌ℹ️✅]/u)?.[0];
    if (status === "❌" || status === "ℹ️") continue;
    if (/\b2025\b/.test(rawDeal) && !/\b2026\b/.test(rawDeal)) continue; // leftover from last year

    const deal = clean(rawDeal.replace(/[⏳❌ℹ️✅]/gu, ""));
    if (!deal || deal.length < 3) continue;
    deals.push({
      name,
      url: link[2],
      category: categorize(`${section} > ${sub}`),
      deal,
      codes: extractCodes(rawDeal + " " + link[2]),
      ends: extractEnd(deal),
      upcoming: status === "⏳" || undefined,
      sources: [source],
    });
  }
  return deals;
}

// Name without taglines: "Quotion - Apple Notes to blogs" -> "quotion"
const nameKey = (n: string) =>
  n.split(/\s[-–—:|]\s|\s\(/)[0].toLowerCase().replace(/\.(com|app|io|ai|dev|co|so)$/, "").replace(/[^a-z0-9]/g, "");
const urlKey = (u: string) => {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase();
  } catch {
    return u;
  }
};
// Web-researched deals (source is a URL) were checked against the vendor's 2026 page, so they win.
const score = (d: Deal) =>
  (d.sources.some((s) => s.startsWith("http")) ? 8 : 0) + (d.codes.length ? 4 : 0) + (d.ends ? 2 : 0) + (d.upcoming ? 0 : 1);

function merge(all: Deal[]): Deal[] {
  const byKey = new Map<string, Deal>();
  const out: Deal[] = [];
  for (const d of all) {
    const keys = [`n:${nameKey(d.name)}`, `u:${urlKey(d.url)}`];
    const hit = keys.map((k) => byKey.get(k)).find(Boolean);
    if (!hit) {
      out.push(d);
      keys.forEach((k) => byKey.set(k, d));
      continue;
    }
    const sources = [...new Set([...hit.sources, ...d.sources])];
    if (score(d) > score(hit)) Object.assign(hit, { ...d, category: hit.category });
    hit.sources = sources;
    keys.forEach((k) => byKey.set(k, hit));
  }
  return out;
}

// --- load -------------------------------------------------------------------
const fileFor = (repo: string) => `sources/${repo.replace("/", "_")}.md`;
let all: Deal[] = [];
for (const repo of SOURCES) all.push(...parseMarkdown(readFileSync(fileFor(repo), "utf8"), repo));

// Deals found by web research (treg). Same shape, written by hand or by research agents.
for (const f of readdirSync("data").filter((f) => /^extra.*\.json$/.test(f))) {
  const extra = JSON.parse(readFileSync(`data/${f}`, "utf8")) as Array<Omit<Deal, "category" | "sources"> & { category: string; source: string }>;
  for (const e of extra) {
    const category = (CATEGORIES.find(([c]) => c === e.category)?.[0] ?? categorize(e.category)) as Category;
    all.push({ ...e, category, codes: e.codes ?? [], ends: e.ends ?? extractEnd(e.deal), sources: [e.source] });
  }
}

const parsed = all.length;
all = merge(all);
const expired = all.filter((d) => d.ends && new Date(d.ends) < TODAY);
const live = all
  .filter((d) => !expired.includes(d))
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

writeFileSync("data/deals.json", JSON.stringify(live, null, 2) + "\n");

// --- render -----------------------------------------------------------------
const cell = (s: string) => s.replace(/\|/g, "\\|");
const anchor = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
const order = [...CATEGORIES.map(([c]) => c), "Other"];
const groups = order.map((c) => [c, live.filter((d) => d.category === c)] as const).filter(([, ds]) => ds.length);
const withCodes = live.filter((d) => d.codes.length).length;
const sourceLink = (s: string) =>
  s.startsWith("http") ? `[web](${s})` : `[${s.split("/")[0]}](https://github.com/${s})`;
const shortDate = (d?: string) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

const readme = `# Black Friday & Cyber Monday 2026 Deals, All in One List

**${live.length} live deals** in one place, **${withCodes} with promo codes**. Built by merging the biggest community deal lists on GitHub, removing duplicates and expired deals, then adding big-brand deals (VPNs, hosting, domains, password managers, cloud, courses) found by web research.

Black Friday is **Nov 27, 2026**, Cyber Monday is **Nov 30, 2026**. Last built: **${TODAY.toISOString().slice(0, 10)}**.

> Prices and codes come from the vendors' own listings and the lists below. Always check the price at checkout. "Ends" is the latest date mentioned in the deal, so treat it as a guide.

## Categories

${groups.map(([c, ds]) => `- [${c}](#${anchor(c)}) (${ds.length})`).join("\n")}

${groups
  .map(
    ([c, ds]) => `## ${c}

| Product | Deal | Code | Ends | Source |
|---|---|---|---|---|
${ds
  .map(
    (d) =>
      `| [${cell(d.name)}](${d.url}) | ${d.upcoming ? "**Coming soon.** " : ""}${cell(d.deal.length > 300 ? d.deal.slice(0, 297) + "..." : d.deal)} | ${d.codes.map((c) => `\`${c}\``).join(" ")} | ${shortDate(d.ends)} | ${d.sources.map(sourceLink).join(" ")} |`,
  )
  .join("\n")}
`,
  )
  .join("\n")}
## Sources

Merged from these lists (thank you to their maintainers and contributors):

${SOURCES.map((s) => `- [${s}](https://github.com/${s})`).join("\n")}
- Web research: vendor Black Friday pages and deal roundups, linked per deal as "web".

${parsed} rows parsed, ${all.length} unique deals after merging, ${expired.length} expired deals removed.

## Rebuild

\`\`\`sh
./scripts/fetch.sh     # refresh sources/ from GitHub (needs gh)
node scripts/build.ts  # regenerate data/deals.json and README.md (Node 23.6+)
\`\`\`

The full data is in [data/deals.json](data/deals.json). To add a deal, add it to \`data/extra.json\` and open a PR.
`;
writeFileSync("README.md", readme);
console.log({ parsed, unique: all.length, expired: expired.length, live: live.length, withCodes });
