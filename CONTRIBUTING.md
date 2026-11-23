# Adding a deal

Every deal in this directory gets its own page on the website (for example
`https://ehsanulhaquesiam.github.io/black-friday-deals-2026/deal/namecheap/`) with a normal link to your
product, and shows up in its category page, the search and the sitemap.

## The quick way

[Open the "Suggest a deal" form](https://github.com/EhsanulHaqueSiam/black-friday-deals-2026/issues/new?template=deal.yml).
Fill in the product, the offer and where it is announced. It is added in the next build.

## By pull request

Add an entry to [`data/extra-community.json`](data/extra-community.json):

```json
{
  "name": "Your Product",
  "url": "https://yourproduct.com/pricing",
  "category": "Developer Tools",
  "subcategory": "Databases & API Clients",
  "platforms": ["mac", "windows"],
  "pricing": "one-time",
  "description": "One line about what it does, under 100 characters.",
  "headline": "40% off lifetime license, $49 → $29",
  "deal": "40% off the lifetime license ($49 to $29), new customers, until Dec 1, 2026.",
  "codes": ["BF2026"],
  "ends": "2026-12-01",
  "source": "https://yourproduct.com/blog/black-friday"
}
```

- `category` and `subcategory` come from [`scripts/taxonomy.ts`](scripts/taxonomy.ts), as do `platforms` and `pricing`.
- `headline` is the offer in at most 60 characters, without the product name, code or dates.
- Run `node scripts/build.ts` (Node 23.6+) to check it. CI runs the same build on every pull request.

## Rules

- A real 2026 Black Friday, Cyber Monday or Black Week offer with a page where it can be checked.
  Permanent prices, free tiers and "coming soon" without details are not listed.
- No crypto, casino, trading signals, piracy or "free premium" offers.
- To change or remove a listing, use the "Update this listing" link on its page.

## Badge

Listed products can show this badge (the snippet is on each deal page):

```html
<a href="https://ehsanulhaquesiam.github.io/black-friday-deals-2026/"><img src="https://ehsanulhaquesiam.github.io/black-friday-deals-2026/badge.svg" alt="Listed on BF26 deals" width="168" height="28"></a>
```
