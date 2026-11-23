// Turns a "Suggest a deal" GitHub issue into a directory entry.
//   node scripts/submission.ts check  -> prints a markdown review comment (exit 1 if it can't be added)
//   node scripts/submission.ts add    -> appends the deal to data/extra-community.json, prints its page URL
// The issue comes in through env (ISSUE_BODY, ISSUE_URL), never through the shell command line:
// issue text is untrusted input.
import { readFileSync, writeFileSync } from "node:fs";
import { TAXONOMY, isCategory } from "./taxonomy.ts";

const SITE = "https://ehsanulhaquesiam.github.io/black-friday-deals-2026/";
const mode = process.argv[2];
const body = process.env.ISSUE_BODY ?? "";
const issueUrl = process.env.ISSUE_URL ?? "";

// Issue forms render as "### Label\n\nvalue" blocks; "_No response_" means empty.
function fields(md: string) {
  const out: Record<string, string> = {};
  for (const block of md.split(/^### /m).slice(1)) {
    const [label, ...rest] = block.split("\n");
    const value = rest.join("\n").trim();
    out[label.trim().toLowerCase()] = value === "_No response_" ? "" : value;
  }
  return out;
}
const f = fields(body);
const get = (prefix: string) => Object.entries(f).find(([k]) => k.startsWith(prefix))?.[1] ?? "";

const name = get("product name").replace(/[\r\n]+/g, " ").slice(0, 80);
const url = get("offer or product url").trim();
const deal = get("the offer").replace(/\s+/g, " ").slice(0, 600);
const codes = get("promo code").split(/[\s,]+/).map((c) => c.trim()).filter((c) => /^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$/.test(c)).slice(0, 8);
const ends = get("ends").trim();
const category = get("category").trim();
const description = get("one line about").replace(/\s+/g, " ").slice(0, 110);
const source = get("where the offer is announced").trim();
const vendor = /- \[x\] I work for this company/i.test(body);

const problems: string[] = [];
const notes: string[] = [];
const ok: string[] = [];

if (!name) problems.push("Product name is missing.");
if (!/^https:\/\/[^\s]+$/.test(url)) problems.push("Offer URL must be a full https:// link.");
if (deal.length < 10) problems.push("Describe the offer (discount, price, who qualifies).");
if (!isCategory(category)) problems.push(`Category must be one of: ${Object.keys(TAXONOMY).join(", ")}.`);
if (ends && !/^2026-(11|12)-\d\d$|^2027-01-\d\d$/.test(ends)) problems.push("End date should look like 2026-12-01.");
if (/\b(crypto|casino|betting|forex|signals|free premium|crack)\b/i.test(`${name} ${deal}`)) problems.push("This kind of offer isn't listed (see the rules).");
if (!ends) notes.push('No end date given. Add one so it shows in "Ending soon".');
if (!codes.length) notes.push("No promo code given, so it will show as \"No code needed\".");

// Duplicate check against the live directory (same name or same website).
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
type Live = { id: string; name: string; url: string };
const live = JSON.parse(readFileSync("data/deals.json", "utf8")) as Live[];
const dup = live.find((d) => d.name.toLowerCase() === name.toLowerCase() || (host(url) && host(d.url) === host(url) && !/apps\.apple\.com|github\.com|gumroad\.com|x\.com/.test(host(url))));
if (dup) notes.push(`Already listed as [${dup.name}](${SITE}deal/${dup.id}/). Approving updates that listing.`);
else if (name) ok.push("Not already listed");

if (/^https:\/\//.test(url)) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (deal directory link check)" }, signal: AbortSignal.timeout(15000) });
    if (r.status === 404 || r.status === 410) problems.push(`Offer URL returns ${r.status}.`);
    else if (r.status >= 400) notes.push(`Offer URL answered ${r.status} to the bot (often a bot wall); a maintainer will open it.`);
    else ok.push(`Link works (${r.status})`);
  } catch {
    notes.push("Couldn't reach the offer URL from GitHub's servers; a maintainer will check it.");
  }
}
if (isCategory(category)) ok.push(`Category: ${category}`);

if (mode === "check") {
  const lines = [
    "**Submission check**",
    "",
    ...ok.map((x) => `- ✅ ${x}`),
    ...notes.map((x) => `- ⚠️ ${x}`),
    ...problems.map((x) => `- ❌ ${x}`),
    "",
    `Preview: **${name || "?"}**: ${deal.slice(0, 140) || "?"}${codes.length ? ` · code \`${codes[0]}\`` : ""}${vendor ? " · listed by the company" : ""}`,
    "",
    problems.length ? "Edit the issue to fix the ❌ items; this check runs again on every edit." : "Looks good. A maintainer adds the `approved` label to publish it.",
  ];
  console.log(lines.join("\n"));
  process.exit(problems.length ? 1 : 0);
}

if (mode === "add") {
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  const file = "data/extra-community.json";
  const list = JSON.parse(readFileSync(file, "utf8")) as Array<Record<string, unknown>>;
  const entry = {
    name,
    url,
    category,
    deal,
    codes,
    ...(ends ? { ends } : {}),
    ...(description ? { description } : {}),
    ...(vendor ? { vendor: true } : {}),
    source: source && /^https:\/\//.test(source) ? source : issueUrl || url,
    issue: issueUrl,
  };
  // A new submission for the same product replaces the older community entry.
  const kept = list.filter((e) => String(e.name).toLowerCase() !== name.toLowerCase());
  writeFileSync(file, JSON.stringify([...kept, entry], null, 2) + "\n");
  const id = name.split(/\s[-–—:|]\s|\s\(|:\s/)[0].toLowerCase().replace(/\.(com|app|io|ai|dev|co|so)$/, "").replace(/[^a-z0-9]/g, "");
  console.log(`${SITE}deal/${dup?.id ?? id}/`);
}
