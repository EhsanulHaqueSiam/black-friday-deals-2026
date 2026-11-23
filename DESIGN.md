# Design: Scoreboard

Dark, dense deal directory with poster numerals: discounts and the countdown read like a stadium scoreboard. Everything else stays quiet so the numbers carry the page. Chosen from three mocks (Ticket, Scoreboard, Editorial) on 2026-11-24.

## Color

- Background `#000`, text `#fff`; secondary text `--dim #8a8a8a`, `--faint #5c5c5c`; hairlines `--line #1e1e1e`, `--hair #121212`; panels `#0a0a0a`.
- One accent, `--acc #ff6a2b`, for discounts, urgency ("Ends today", the two busiest chart days, the countdown label and colons) and confirmed states (copied, liked).
- Category dots use muted `oklch(0.72 0.12 <hue>)` from `catColor()`.

## Type

- `--display`: Anton, only for numerals (card discounts, countdown digits, chart values, stat row, deal page offer).
- `--sans`: Geist for everything else. Section heads 700 20px, tracking -0.025em.
- `--mono`: Geist Mono for promo codes and small data labels only.
- Tabular numbers site-wide.

## Components

- Code button: dashed outline, the code in mono, a "Copy" label. On copy it flips (rotateX) onto an orange "Copied" face, the check draws itself, confetti bursts once, and a toast confirms. Same markup in `app.js` and `pages.ts`; behavior in `fx.js`.
- Season strip (front view): "Black Friday in" plus D:H:M:S in Anton with rolling digits, the deal week Nov 24 to Dec 1 as an 8-segment track with an orange fill and a "now" needle, and "Share the list".
- Last chance cards: Anton discount, headline, then a bottom bar with the code and "Get". Tabs are a segmented control with one sliding indicator.
- Ending-by-day chart: bars grow from the baseline once, the first time the chart is in view; tooltip on hover and focus; tap filters by day.
- Like: up chevron that hops, a count that rolls, orange fill when on.
- Share: on mouse and trackpad, a popover beside the button with a preview of what's shared, seven networks (icons from `nets.svg`) and a copy-link row. On phones, the native share sheet. Deal pages list the networks inline.
- Picks: pointer tilt with a soft glare (fine pointers only).

## Motion rules

- Every animation is one-shot, triggered by an action or by a block entering view. Nothing loops; the countdown ticks once a second only while on screen.
- Ease `cubic-bezier(.23,1,.32,1)`; UI 120 to 320ms, toast 400ms, chart grow 760ms with a 32ms stagger.
- Transform and opacity only, plus a 2px blur on the label crossfade.
- `prefers-reduced-motion`: state changes stay (colors, labels, toast), movement and confetti go.

## Sources

Mobbin (Rains and Base44 countdowns, Waymo and talabat code boxes, ShopBack share row, Peerlist upvotes), ui-sdk.dev (segmented control, popover, tooltip behaviors), tastebase (NumberFlow rolling digits, Torph label morph, Sonner toast), anime.js (line drawing), Bklit (chart entrance). Mocks: https://ij2rrtpsu8y9.postplan.dev
