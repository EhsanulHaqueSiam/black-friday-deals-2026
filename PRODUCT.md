# Product

BF26 deals is one searchable directory of every Black Friday and Cyber Monday 2026 deal on software, AI tools, VPNs, hosting, courses, games and hardware: about 2,800 deals and 1,000 promo codes merged from community lists and web research. It lives at https://bf26-deals.pages.dev (GitHub Pages mirror).

## Who uses it

Shoppers hunting for a specific deal or code (search first, often on a phone), and people browsing for what's worth buying before it ends. Most arrive from a shared link: a friend's message, a post on X or Reddit, or a search result for "<product> Black Friday code".

## What success looks like

Shares. A visitor copies a code, gets the deal, and sends the page or the deal on. The moments worth sharing get the most care: copying a code, the countdown, the "Don't miss" block (last chance, ending by day, best brands), editors' picks, deal pages and the share buttons.

## Surface modes

- Home (`docs/index.html`, `app.js`): Operate. Find a deal fast; the front view adds a light Persuade layer (countdown, last chance, chart, picks).
- Deal and category pages (`scripts/pages.ts`): Read, with one action (copy, get, share).

## Constraints

- Vanilla JS and CSS, no framework. 2,800+ rows on one page: render cost stays low (`content-visibility`, no per-row listeners).
- SEO and answer engines matter: static rows, JSON-LD, sitemap, llms.txt are part of the product.
- No accounts. Likes and views go to an anonymous counter on Cloudflare; "For you" lives only in the visitor's browser.

Assumptions: written from the build brief and the code, not from a user interview.
