// Run: node --test scripts/
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parsePrice, priceText } from "./pages.ts";

test("parsePrice reads the deal price, not savings or the old price", () => {
  const cases: [string, string][] = [
    ["$119.88 → $64.99 for 1 TB photo editing", "$64.99"],
    ["M5 16GB/512GB for $1,049", "$1049"],
    ["50% off first year of Unlimited, $59.99 → $29.99/yr", "$29.99/yr"],
    ["70% off VPN Plus 1-year, $2.99/mo", "$2.99/mo"],
    ["20% off, $33 → $26.40", "$26.40"],
    ["3 months of Pro free, normally $15/mo", ""],
    ["$500 off every turbo kit", ""],
    ["Up to $200 off selected Linux laptops", ""],
    ["Lifetime $69 once (was $948)", "$69"],
    ["$50 credit for new accounts", ""],
    ["60% off lifetime Premium", ""],
  ];
  for (const [text, want] of cases) assert.equal(priceText(parsePrice(text)), want, text);
});
