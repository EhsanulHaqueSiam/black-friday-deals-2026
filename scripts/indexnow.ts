// Tells IndexNow search engines (Bing, Yandex, Seznam, Naver; Bing also feeds ChatGPT search and
// Copilot) about every URL in docs/sitemap.xml. The key file docs/<key>.txt proves site ownership.
// Run after a build: node scripts/indexnow.ts
import { readFileSync } from "node:fs";

const KEY = "97cd80c18d08ec6e9d75fa368b790052";
const HOST = "ehsanulhaquesiam.github.io";
const urls = [...readFileSync("docs/sitemap.xml", "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (let i = 0; i < urls.length; i += 10000) {
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/black-friday-deals-2026/${KEY}.txt`, urlList: urls.slice(i, i + 10000) }),
  });
  console.log(`IndexNow: ${r.status} for ${urls.slice(i, i + 10000).length} URLs`);
}
