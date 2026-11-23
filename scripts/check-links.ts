// Checks every live deal URL and writes data/deadlinks.json ({ id: reason }) for pages that are
// gone (404/410) or whose domain does not resolve. The build drops those deals.
// Run: node scripts/check-links.ts   (about a minute; 24 requests at a time)
import { readFileSync, writeFileSync } from "node:fs";

type D = { id: string; url: string; name: string };
const deals = (JSON.parse(readFileSync("data/deals.json", "utf8")) as D[]).filter((d) => !/^https?:\/\/(x|twitter)\.com\//.test(d.url));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

async function check(d: D): Promise<string | undefined> {
  for (const method of ["HEAD", "GET"] as const) {
    try {
      const r = await fetch(d.url, { method, redirect: "follow", headers: { "user-agent": UA }, signal: AbortSignal.timeout(15000) });
      if (r.status === 404 || r.status === 410) {
        if (method === "HEAD") continue; // some servers 404 HEAD only
        return `HTTP ${r.status}`;
      }
      return; // 2xx, 3xx, 401/403/429/5xx: treat as alive (bot walls and rate limits are common)
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      if (cause === "ENOTFOUND" || cause === "EAI_AGAIN") return "domain not found";
      if (method === "GET") return; // timeouts and TLS quirks: do not drop on a flaky network
    }
  }
}

const dead: Record<string, string> = {};
let i = 0;
await Promise.all(
  Array.from({ length: 24 }, async () => {
    while (i < deals.length) {
      const d = deals[i++];
      const why = await check(d);
      if (why) dead[d.id] = `${why}: ${d.url}`;
    }
  }),
);
writeFileSync("data/deadlinks.json", JSON.stringify(dead, null, 1) + "\n");
console.log({ checked: deals.length, dead: Object.keys(dead).length });
