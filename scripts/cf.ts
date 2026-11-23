// Makes the Cloudflare Pages copy of the site: docs/ -> dist/, with the GitHub Pages path prefix
// (/black-friday-deals-2026/) rewritten to the root. Run after build: node scripts/cf.ts
import { cpSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE } from "./pages.ts";

rmSync("dist", { recursive: true, force: true });
cpSync("docs", "dist", { recursive: true });
let n = 0;
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".html")) {
      const s = readFileSync(p, "utf8");
      const out = s.replaceAll(`"${BASE}`, '"/');
      if (out !== s) (writeFileSync(p, out), n++);
    }
  }
};
walk("dist");
console.log(`dist/ ready for Cloudflare Pages (${n} pages rewritten)`);
