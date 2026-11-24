// Draws one 1200x630 share image per deal into dist/og/<id>.png, so a shared deal link previews
// that offer (name, discount, code, end date). Runs at deploy time after cf.ts: node scripts/og.ts
// Only dist/ gets the images; docs/ (the git-tracked GitHub Pages mirror) links to the Cloudflare copies.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { renderAsync } from "@resvg/resvg-js";
import { ADULT } from "./taxonomy.ts";

type Deal = { id: string; name: string; headline: string; category: string; subcategory?: string; discount?: number; codes: string[]; ends?: string; upcoming?: boolean };

const W = 1200, X = 80, R = 1120;
const ACC = "#ff6a2b";
const FONT_DIR = new URL("og-fonts/", import.meta.url).pathname;
const font = { fontFiles: ["Anton.ttf", "Geist-Regular.ttf", "Geist-Bold.ttf", "GeistMono-SemiBold.ttf"].map((f) => FONT_DIR + f), loadSystemFonts: false, defaultFontFamily: "Geist" };

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// shortcut: per-character width estimate in em for Geist, not real glyph metrics; errs wide so text never overflows.
const em = (c: string) => (/[il.,:;'|!\s]/.test(c) ? 0.3 : /[fjrtI()\[\]-]/.test(c) ? 0.4 : /[mwMW@%]/.test(c) ? 0.9 : /[A-Z0-9]/.test(c) ? 0.68 : 0.58);
const width = (s: string, size: number) => [...s].reduce((w, c) => w + em(c), 0) * size;

// Greedy word wrap into at most `max` lines; the last line ends in "…" when text is cut.
export function wrap(text: string, size: number, maxW: number, max: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (width(next, size) <= maxW || !line) line = next;
    else (lines.push(line), (line = word));
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines;
  let last = lines[max - 1];
  while (last && width(`${last}…`, size) > maxW) last = last.slice(0, -1);
  return [...lines.slice(0, max - 1), `${last.trimEnd()}…`];
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function svg(d: Deal) {
  const pct = d.discount ? `${d.discount}%` : "";
  const colW = pct ? 640 : R - X;
  // Drop a leading "70% off," from the headline when the big number already says it.
  const head = pct ? d.headline.replace(new RegExp(`^(up to )?${d.discount}% off,?\\s*`, "i"), "").replace(/^./, (c) => c.toUpperCase()) : d.headline;
  const nameSize = [80, 64, 52].find((s) => wrap(d.name, s, colW, 2).every((l) => !l.endsWith("…"))) ?? 48;
  const name = wrap(d.name, nameSize, colW, nameSize === 48 ? 3 : 2);
  const lines = wrap(head, 34, colW, 3);
  const nameTop = 250, headTop = nameTop + (name.length - 1) * nameSize * 1.08 + 64;
  const code = d.codes[0];
  const codeW = code ? code.length * 26 * 0.6 + 124 : 0; // Geist Mono: every glyph is 0.6em
  const ends = d.ends ? `Ends ${fmt(d.ends)}` : d.upcoming ? "Starting soon" : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="630" viewBox="0 0 ${W} 630">
<rect width="${W}" height="630" fill="#000"/>
<rect width="${W}" height="8" fill="${ACC}"/>
<text x="${X}" y="112" font-family="Geist" font-weight="700" font-size="36" fill="#fff">BF<tspan fill="${ACC}">26</tspan> deals</text>
<text x="${R}" y="110" text-anchor="end" font-family="Geist Mono" font-weight="600" font-size="20" fill="#8a8a8a">${xml((d.subcategory ?? d.category).toUpperCase().slice(0, 40))}</text>
${name.map((l, i) => `<text x="${X}" y="${nameTop + i * nameSize * 1.08}" font-family="Geist" font-weight="700" font-size="${nameSize}" fill="#fff">${xml(l)}</text>`).join("\n")}
${lines.map((l, i) => `<text x="${X}" y="${headTop + i * 46}" font-family="Geist" font-size="34" fill="#c8c8c8">${xml(l)}</text>`).join("\n")}
${pct && /^up to/i.test(d.headline) ? `<text x="${R}" y="214" text-anchor="end" font-family="Anton" font-size="44" fill="#fff" letter-spacing="2">UP TO</text>` : ""}
${pct ? `<text x="${R}" y="400" text-anchor="end" font-family="Anton" font-size="200" fill="${ACC}">${pct}</text><text x="${R}" y="470" text-anchor="end" font-family="Anton" font-size="56" fill="#fff" letter-spacing="2">OFF</text>` : ""}
${code ? `<rect x="${X}" y="520" width="${codeW}" height="60" rx="12" fill="none" stroke="${ACC}" stroke-width="2"/><text x="${X + 24}" y="559" font-family="Geist Mono" font-weight="600" font-size="20" fill="#8a8a8a">CODE</text><text x="${X + 100}" y="560" font-family="Geist Mono" font-weight="600" font-size="26" fill="${ACC}">${xml(code)}</text>` : `<text x="${X}" y="560" font-family="Geist" font-size="28" fill="#8a8a8a">No code needed</text>`}
${ends ? `<text x="${code ? X + codeW + 28 : X + 230}" y="560" font-family="Geist" font-size="28" fill="#8a8a8a">${ends}</text>` : ""}
<text x="${R}" y="560" text-anchor="end" font-family="Geist Mono" font-weight="600" font-size="20" fill="#5c5c5c">bf26-deals.pages.dev</text>
</svg>`;
}

if (import.meta.main) {
  const { deals } = JSON.parse(readFileSync("dist/data.json", "utf8")) as { deals: Deal[] };
  const todo = deals.filter((d) => d.category !== ADULT);
  mkdirSync("dist/og", { recursive: true });
  const t = Date.now();
  let i = 0;
  // A few renders at once; resvg's async render runs on the libuv thread pool.
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < todo.length) {
      const d = todo[i++];
      const png = await renderAsync(svg(d), { font, fitTo: { mode: "width", value: W } });
      writeFileSync(`dist/og/${d.id}.png`, png.asPng());
    }
  }));
  console.log(`og: ${todo.length} share images in ${((Date.now() - t) / 1000).toFixed(1)}s`);
}
