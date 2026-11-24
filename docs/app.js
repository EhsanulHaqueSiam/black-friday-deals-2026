// Deals directory: loads data.json (written by scripts/build.ts) and renders it with
// search, a category tree, platform and deal filters, sorting and copy-to-clipboard codes.
// Filter state lives in the URL hash so any view can be shared.
"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PLATFORM_LABEL = { web: "Web", mac: "Mac", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android", "browser-extension": "Browser extension", wordpress: "WordPress", physical: "Physical product" };
const FLAGS = ["code", "soon", "onetime", "live", "adult"];
const ADULT = "Adult (18+)"; // hidden until the visitor ticks "Show 18+ deals"

let DATA;
let TODAY;
const state = { q: "", cat: "", sub: "", platforms: new Set(), flags: new Set(), sort: "popular", preset: "", day: "", band: "" };

// Quick finds: one tap applies a ready-made filter (and a fitting sort).
const PRESETS = [
  { k: "soon", label: "Ending in 3 days", test: (d) => daysLeft(d) <= 3, sort: "ends" },
  { k: "big", label: "50%+ off", test: (d) => (d.discount ?? 0) >= 50, sort: "discount" },
  { k: "code", label: "Has a code", test: (d) => d.codes.length > 0 },
  { k: "lifetime", label: "Lifetime licenses", test: (d) => d.pricing === "one-time" && d.platforms.some((p) => p !== "physical") },
  { k: "mac", label: "Mac apps", test: (d) => d.platforms.includes("mac") },
  { k: "ai", label: "AI tools", test: (d) => d.category === "AI Tools" },
  { k: "dev", label: "Developer tools", test: (d) => d.category === "Developer Tools" },
  { k: "vpn", label: "VPN & privacy", test: (d) => d.category === "Security & Privacy" },
  { k: "hosting", label: "Hosting & domains", test: (d) => d.category === "Hosting & Cloud" },
  { k: "courses", label: "Courses & books", test: (d) => d.category === "Learning" },
  { k: "design", label: "Design & creative", test: (d) => d.category === "Design" || d.category === "Photo, Video & Audio" },
  { k: "games", label: "Games", test: (d) => d.category === "Gaming" },
  { k: "hardware", label: "Hardware", test: (d) => d.category === "Hardware & Electronics" },
];
const preset = () => PRESETS.find((p) => p.k === state.preset);
// How many independent community lists carry the deal: the popularity signal GitHub Pages can offer.
const lists = (d) => d.sources.filter((s) => !s.startsWith("http")).length;
// Engagement from the Cloudflare site (/api/stats); empty on the GitHub mirror.
let STATS = {};
const LIKED = "bf26.liked";
const liked = new Set((() => { try { return JSON.parse(localStorage.getItem(LIKED) ?? "[]"); } catch { return []; } })());
const likes = (d) => (STATS[d.id]?.like ?? 0);
// Popularity: likes 8, shares 5, Get deal clicks 3, opens from search 2, views 1, community lists 3.
const pop = (d) => { const s = STATS[d.id] ?? {}; return 8 * (s.like ?? 0) + 5 * (s.share ?? 0) + 3 * (s.click ?? 0) + 2 * (s.search ?? 0) + (s.view ?? 0) + 3 * lists(d); };
const beacon = (id, type) => { try { fetch("api/event", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id, type }) }); } catch {} };

const daysLeft = (d) => (d.ends ? Math.round((Date.parse(d.ends) - TODAY) / 864e5) : Infinity);
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Everything except category/subcategory, so the tree counts show what each category would give.
// Discount bands for the "By the numbers" breakdown.
const BANDS = [
  { k: "75", label: "75%+ off", test: (n) => n >= 75 },
  { k: "50", label: "50 to 74%", test: (n) => n >= 50 && n < 75 },
  { k: "25", label: "25 to 49%", test: (n) => n >= 25 && n < 50 },
  { k: "0", label: "under 25%", test: (n) => n > 0 && n < 25 },
];
function passesFilters(d) {
  if (state.day && d.ends !== state.day) return false;
  if (state.band && !(d.discount && BANDS.find((b) => b.k === state.band)?.test(d.discount))) return false;
  if (state.preset && !preset()?.test(d)) return false;
  if (d.category === ADULT && !state.flags.has("adult")) return false;
  if (state.platforms.size && !d.platforms.some((p) => state.platforms.has(p))) return false;
  if (state.flags.has("code") && !d.codes.length) return false;
  if (state.flags.has("soon") && !(daysLeft(d) <= 3)) return false;
  if (state.flags.has("onetime") && d.pricing !== "one-time") return false;
  if (state.flags.has("live") && d.upcoming) return false;
  if (state.q && !score(d)) return false;
  return true;
}

// --- search ---------------------------------------------------------------------------------
// Every query word must match somewhere; the product name (and its website) counts most, so
// "proton" lists Proton VPN before deals that only mention Proton. One typo is forgiven.
const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
const within1 = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
const index = new Map(); // id -> precomputed lowercase fields
function fields(d) {
  let f = index.get(d.id);
  if (!f) {
    const name = norm(d.name);
    f = {
      name,
      words: name.split(/[^a-z0-9]+/).filter(Boolean),
      host: norm(host(d.url)),
      text: norm(`${d.description ?? ""} ${d.headline}`),
      cat: norm(`${d.category} ${d.subcategory ?? ""}`),
      rest: norm(`${d.deal} ${d.codes.join(" ")}`),
    };
    index.set(d.id, f);
  }
  return f;
}
function score(d) {
  const f = fields(d);
  const q = norm(state.q).trim();
  let total = f.name === q ? 200 : f.name.startsWith(q) ? 120 : 0;
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const s =
      f.words.some((x) => x === w) ? 60 :
      f.words.some((x) => x.startsWith(w)) ? 45 :
      f.name.includes(w) ? 30 :
      f.host.includes(w) ? 25 :
      f.text.includes(w) ? 12 :
      f.cat.includes(w) ? 8 :
      f.rest.includes(w) ? 4 :
      w.length >= 4 && f.words.some((x) => within1(x, w)) ? 20 : 0;
    if (!s) return 0;
    total += s;
  }
  return total;
}

function render() {
  const base = DATA.deals.filter(passesFilters);
  const shown = base.filter((d) => (!state.cat || d.category === state.cat) && (!state.sub || (d.subcategory ?? "More") === state.sub));
  renderTree(base);
  renderChips();
  renderList(shown);
  afterRender();
  const extra = [state.day ? `ending ${fmtDate(state.day)}` : "", state.band ? BANDS.find((b) => b.k === state.band)?.label : ""].filter(Boolean).join(", ");
  $("#title").innerHTML = `<b>${shown.length.toLocaleString()}</b> deals${state.cat ? ` in ${esc(state.sub || state.cat)}` : ""}${extra ? ` ${esc(extra)} <button class="clear" data-clear>Clear</button>` : ""}`;
  writeHash();
}

function renderTree(base) {
  const count = (c, s) => base.filter((d) => d.category === c && (s === undefined || (d.subcategory ?? "More") === s)).length;
  let html = `<li><button data-cat="" class="${state.cat ? "" : "on"}">All<em>${base.length}</em></button></li>`;
  for (const [cat, subs] of Object.entries(DATA.taxonomy)) {
    const n = count(cat);
    if (!n && state.cat !== cat) continue;
    html += `<li><button data-cat="${esc(cat)}" class="${state.cat === cat && !state.sub ? "on" : ""}"><span><i class="dot" style="--c:${catColor(cat)}"></i>${esc(cat)}</span><em>${n}</em></button></li>`;
    if (state.cat !== cat) continue;
    for (const s of [...subs, "More"]) {
      const m = count(cat, s);
      if (m) html += `<li class="sub"><button data-cat="${esc(cat)}" data-sub="${esc(s)}" class="${state.sub === s ? "on" : ""}">${esc(s)}<em>${m}</em></button></li>`;
    }
  }
  $("#cats").innerHTML = html;
}

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
// Line icons (Lucide shapes), drawn with currentColor.
const svg = (paths) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
const I = {
  arrow: svg('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'),
  up: svg('<path d="m6 15 6-6 6 6"/>'),
  left: svg('<path d="m15 18-6-6 6-6"/>'),
  right: svg('<path d="m9 18 6-6-6-6"/>'),
  share: svg('<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
};
const logo = (d) => `<img class="logo" src="https://icons.duckduckgo.com/ip3/${esc(host(d.url))}.ico" alt="" loading="lazy" width="28" height="28" data-initial="${esc(d.name[0] ?? "?")}">`;
// The label swaps Copy -> Copied (fx.js flips the button); the toast announces it to screen readers.
const codeBtn = (c) => `<button class="btn code" data-code="${esc(c)}" title="Copy ${esc(c)}"><span class="cv" translate="no">${esc(c)}</span><span class="cl"><span class="c0">${FX.ICON.copy}Copy</span><span class="c1" aria-hidden="true">${FX.ICON.check}Copied</span></span></button>`;
const goBtn = (d, label = "Get deal") => `<a class="btn go" href="${esc(d.url)}" target="_blank" rel="noopener">${label}${I.arrow}</a>`;
const shareBtn = (d) => (d.category === ADULT ? "" : `<button class="btn ghost ic" data-share="${esc(d.id)}" aria-label="Share ${esc(d.name)}" title="Share">${I.share}</button>`);
const dayWord = (n) => (n === 0 ? "last day" : n === 1 ? "1 day left" : `${n} days left`);
const endsText = (d) => (d.ends ? `<span class="left${daysLeft(d) <= 3 ? " hot" : ""}">ends ${fmtDate(d.ends)} · ${dayWord(daysLeft(d))}</span>` : "");
// The discount badge, unless the headline already says it.
const pct = (d) => (d.discount && !d.headline.includes(`${d.discount}%`) ? `<span class="pct">${d.discount}% off</span>` : "");
// Poster-size discount for cards: "70%" in the display face, then a small "off".
const bigPct = (n) => `<span class="n">${n}%</span><span class="off">off</span>`;

// One compact row: logo, name, headline, copy-code + get-deal. Full terms open on click (details()).
function row(d) {
  const on = liked.has(d.id);
  return `<article class="row" data-id="${esc(d.id)}">
    <button class="vote${on ? " on" : ""}" data-like="${esc(d.id)}" aria-pressed="${on}" aria-label="Like ${esc(d.name)}">${I.up}<span class="roll">${likes(d) || ""}</span></button>
    ${logo(d)}
    <div class="n"><a href="${d.category === ADULT ? esc(d.url) : `deal/${esc(d.id)}/`}">${esc(d.name)}</a>${d.vendor ? `<span class="vtag sm" title="Listed by the company">✓</span>` : ""}${d.description ? `<small>${esc(d.description)}</small>` : ""}</div>
    <div class="act">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode">No code needed</span>`}${goBtn(d)}${shareBtn(d)}</div>
    <div class="h">${d.upcoming ? `<span class="soonTag">Soon</span>` : ""}${pct(d)}${esc(d.headline)}</div>
    <div class="sub">${endsText(d)}${lists(d) >= 2 ? `<span class="left">on ${lists(d)} lists</span>` : ""}<button class="more" aria-expanded="false">${d.codes.length > 1 ? `${d.codes.length} codes · ` : ""}details</button></div>
  </article>`;
}

function details(d) {
  const meta = [
    `${esc(d.category)}${d.subcategory ? ` / ${esc(d.subcategory)}` : ""}`,
    esc(d.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", ")),
    esc(d.pricing),
    d.newCustomersOnly ? "new customers only" : "",
  ].filter(Boolean);
  const src = d.sources.map((s) => (s.startsWith("http") ? `<a href="${esc(s)}" rel="noopener">${esc(host(s))}</a>` : `<a href="https://github.com/${esc(s)}" rel="noopener">${esc(s)}</a>`));
  return `<div class="det">
    <p>${esc(d.deal)}</p>
    ${d.codes.length > 1 ? `<div class="codes">${d.codes.map(codeBtn).join("")}</div>` : ""}
    <p class="meta">${meta.join(" · ")}</p>
    <p class="meta">Sources: ${src.join(", ")}</p>
    ${d.category === ADULT ? "" : `<p class="dshare"><button class="btn ghost" data-share="${esc(d.id)}">Share</button><a class="btn ghost" href="deal/${esc(d.id)}/">Open deal page</a></p>`}
  </div>`;
}

// Editors' picks: only on the plain front view, so they never push filtered results down.
// The front view (nothing filtered): only then show picks, best-per-category and "For you".
const isPlain = () => !state.q && !state.cat && !state.preset && !state.day && !state.band && !state.platforms.size && [...state.flags].every((f) => f === "adult") && state.sort === "popular";
function picks() {
  const plain = isPlain();
  const ds = plain ? (DATA.picks ?? []).map((p) => ({ ...DATA.deals.find((d) => d.id === p.id), why: p.why })).filter((d) => d.id) : [];
  if (!ds.length) return "";
  return `<section class="picks"><div class="shead"><div><h2>Editors' picks</h2><p>Deals worth buying even if you weren't shopping.</p></div><span class="arws"><button class="arw" data-scroll="-1" aria-label="Previous picks">${I.left}</button><button class="arw" data-scroll="1" aria-label="More picks">${I.right}</button></span></div><div class="pg">${ds
    .map((d) => `<div class="pc" data-id="${esc(d.id)}"><span class="glare" aria-hidden="true"></span>
      <div class="ptop">${logo(d)}<div><b>${esc(d.name)}</b><span>${esc(d.subcategory ?? d.category)}</span></div>${shareBtn(d)}</div>
      ${d.discount ? `<div class="big">${bigPct(d.discount)}</div>` : ""}
      <div class="ph">${esc(d.discount ? (d.headline.replace(new RegExp(`^(up to )?${d.discount}% off,?\\s*`, "i"), "") || d.headline).replace(/^./, (c) => c.toUpperCase()) : d.headline)}</div>
      <div class="why">${esc(d.why)}</div>
      <div class="pact">${d.codes.length ? codeBtn(d.codes[0]) : ""}${goBtn(d)}</div>
    </div>`)
    .join("")}</div></section>`;
}

function renderList(shown) {
  const list = $("#list");
  if (!shown.length) {
    list.innerHTML = `<p class="empty">No deals match. Try fewer filters.</p>`;
    return;
  }
  const by = {
    popular: (a, b) => pop(b) - pop(a) || (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name),
    discount: (a, b) => (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name),
    ends: (a, b) => daysLeft(a) - daysLeft(b) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  }[state.sort];
  if (state.q && (state.sort === "group" || state.sort === "popular")) {
    const ranked = [...shown].sort((a, b) => score(b) - score(a) || (b.discount ?? -1) - (a.discount ?? -1));
    list.innerHTML = `<section class="group"><h3 class="sechead">BEST MATCHES FOR "${esc(state.q.toUpperCase())}"</h3>${ranked.map(row).join("")}</section>`;
    return;
  }
  if (by) {
    const top = state.sort === "popular" && isPlain() ? dontMiss() + picks() + bestPerCategory() + forYou() : "";
    list.innerHTML = top + `<section class="group">${top ? `<h3 class="sechead">ALL DEALS · ${shown.length.toLocaleString()}</h3>` : ""}${[...shown].sort(by).map(row).join("")}</section>`;
    return;
  }
  // Grouped: category > subcategory in taxonomy order, unknown subcategory last as "More".
  let html = "";
  for (const [cat, subs] of Object.entries(DATA.taxonomy)) {
    for (const s of [...subs, "More"]) {
      const g = shown.filter((d) => d.category === cat && (d.subcategory ?? "More") === s);
      if (g.length) html += `<section class="group"><h3 class="sechead"><i class="dot" style="--c:${catColor(cat)}"></i>${esc(state.cat ? "" : `${cat.toUpperCase()} / `)}${esc(s.toUpperCase())} · ${g.length}</h3>${g.map(row).join("")}</section>`;
    }
  }
  list.innerHTML = html;
}

// --- URL hash <-> state -------------------------------------------------------
function writeHash() {
  const p = new URLSearchParams();
  if (state.q) p.set("q", state.q);
  if (state.cat) p.set("c", state.cat);
  if (state.sub) p.set("s", state.sub);
  if (state.platforms.size) p.set("p", [...state.platforms].join(","));
  if (state.flags.size) p.set("f", [...state.flags].join(","));
  if (state.sort !== "popular") p.set("sort", state.sort);
  if (state.preset) p.set("x", state.preset);
  if (state.day) p.set("d", state.day);
  if (state.band) p.set("b", state.band);
  const h = p.toString();
  history.replaceState(null, "", h ? `#${h}` : location.pathname);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  // Searches sent from the static pages arrive as ?q=
  const fromPage = new URLSearchParams(location.search).get("q");
  if (fromPage && !p.has("q")) p.set("q", fromPage);
  state.q = (p.get("q") ?? "").toLowerCase();
  state.cat = p.get("c") ?? "";
  state.preset = PRESETS.some((x) => x.k === p.get("x")) ? p.get("x") : "";
  state.day = /^\d{4}-\d\d-\d\d$/.test(p.get("d") ?? "") ? p.get("d") : "";
  state.band = BANDS.some((b) => b.k === p.get("b")) ? p.get("b") : "";
  state.sub = p.get("s") ?? "";
  state.platforms = new Set((p.get("p") ?? "").split(",").filter((x) => x in PLATFORM_LABEL));
  state.flags = new Set((p.get("f") ?? "").split(",").filter((x) => FLAGS.includes(x)));
  state.sort = ["group", "discount", "ends", "name"].includes(p.get("sort")) ? p.get("sort") : "popular";
  $("#q").value = p.get("q") ?? "";
  $("#sort").value = state.sort;
  document.querySelectorAll("[data-flag]").forEach((el) => (el.checked = state.flags.has(el.dataset.flag)));
  document.querySelectorAll("[data-platform]").forEach((el) => (el.checked = state.platforms.has(el.dataset.platform)));
}


// --- discovery: quick finds, best per category, "For you" -------------------------------
const popular = (a, b) => pop(b) - pop(a) || (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name);
const dealHref = (d) => (d.category === ADULT ? esc(d.url) : `deal/${esc(d.id)}/`);

function renderChips() {
  const visible = DATA.deals.filter((d) => d.category !== ADULT || state.flags.has("adult"));
  $("#chips").innerHTML =
    `<button class="chip${state.preset ? "" : " on"}" data-preset="">All <b>${visible.length.toLocaleString()}</b></button>` +
    PRESETS.map((p) => `<button class="chip${state.preset === p.k ? " on" : ""}" data-preset="${p.k}">${esc(p.label)} <b>${visible.filter(p.test).length}</b></button>`).join("");
}

// One deal per category: the most listed, then the biggest discount.
function bestPerCategory() {
  const rows = Object.keys(DATA.taxonomy)
    .filter((c) => c !== ADULT)
    .map((c) => DATA.deals.filter((d) => d.category === c).sort(popular)[0])
    .filter(Boolean);
  return `<section class="best"><div class="shead"><div><h2>Best in each category</h2><p>The most-listed deal in every category.</p></div></div>${rows
    .map((d) => `<a class="br" data-id="${esc(d.id)}" href="${dealHref(d)}"><small><i class="dot" style="--c:${catColor(d.category)}"></i>${esc(d.category)}</small>${logo(d)}<span class="bn"><b>${esc(d.name)}</b> <span>${esc(d.headline)}</span></span>${d.discount ? `<em>${d.discount}%</em>` : "<em></em>"}</a>`)
    .join("")}</section>`;
}

// Deals the visitor opened live only in their own browser (localStorage), never sent anywhere.
const VIEWED = "bf26.viewed";
const viewed = () => {
  try {
    return JSON.parse(localStorage.getItem(VIEWED) ?? "[]");
  } catch {
    return [];
  }
};
function remember(id) {
  try {
    localStorage.setItem(VIEWED, JSON.stringify([id, ...viewed().filter((x) => x !== id)].slice(0, 30)));
  } catch {}
}
function forYou() {
  const seen = viewed();
  const last = seen.map((id) => DATA.deals.find((d) => d.id === id)).find(Boolean);
  if (!last) return "";
  const similar = DATA.deals
    .filter((d) => !seen.includes(d.id) && d.category === last.category && (d.category !== ADULT || state.flags.has("adult")))
    .sort((a, b) => (b.subcategory === last.subcategory) - (a.subcategory === last.subcategory) || popular(a, b))
    .slice(0, 8);
  if (!similar.length) return "";
  return `<section class="foryou"><div class="shead"><div><h2>Because you looked at ${esc(last.name)}</h2><p>Similar deals you haven't opened yet.</p></div></div><div class="fy">${similar
    .map((d) => `<a class="fc" data-id="${esc(d.id)}" href="${dealHref(d)}"><span class="ft">${logo(d)}<b>${esc(d.name)}</b></span><span class="fh">${d.discount && !d.headline.includes(`${d.discount}%`) ? `<em>${d.discount}%</em> ` : ""}${esc(d.headline)}</span></a>`)
    .join("")}</div></section>`;
}

// A stable, muted color per category so long lists are easier to scan.
const CAT_HUES = [12, 200, 265, 330, 150, 40, 95, 0, 220, 175, 300, 55, 125, 240, 20, 280, 185, 340];
const catColor = (c) => `oklch(0.72 0.12 ${CAT_HUES[Object.keys(DATA.taxonomy).indexOf(c) % CAT_HUES.length]})`;

// Countdown marks: Black Friday starts at midnight US Eastern; Cyber Monday ends a day later.
const MARKS = [[Date.UTC(2026, 10, 27, 5), "Black Friday in"], [Date.UTC(2026, 11, 1, 8), "Cyber Monday ends in"]];
const nextMark = () => MARKS.find(([t]) => t > Date.now());
// Header pill: "Black Friday in 3d 4h", refreshed once a minute.
function countdown() {
  const next = nextMark(), el = $("#countdown");
  if (!next) return (el.hidden = true);
  const mins = Math.floor((next[0] - Date.now()) / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  el.textContent = `${next[1]} ${d ? `${d}d ` : ""}${h}h${d ? "" : ` ${m}m`}`;
  el.hidden = false;
}

// Season strip on the front view: a big rolling countdown and the deal week as a track with a "now" needle.
const WEEK = [Date.UTC(2026, 10, 24, 5), Date.UTC(2026, 11, 2, 5)]; // Nov 24 to the end of Dec 1, US Eastern
const WEEK_DAYS = ["Nov 24", "25", "Thanksgiving", "Black Friday", "28", "29", "Cyber Monday", "Dec 1"];
const UNITS = { d: "days", h: "hours", m: "min", s: "sec" };
function season() {
  if (!nextMark()) return "";
  return `<section class="season" aria-label="Countdown"><div><span class="cdl">${nextMark()[1]}</span>
    <div class="cd" role="timer">${Object.entries(UNITS).map(([u, label]) => `<span class="u" data-u="${u}"><b class="roll"></b><small>${label}</small></span>`).join('<span class="sep" aria-hidden="true">:</span>')}</div></div>
    <div class="wk" aria-hidden="true">${WEEK_DAYS.map((t, i) => `<span class="seg${i === 3 || i === 6 ? " key" : ""}"><i></i><small>${t}</small></span>`).join("")}<span class="needle"></span></div>
    <button class="btn ghost" data-sharesite>${I.share}<span>Share the list</span></button></section>`;
}
// Ticks once a second, only while the strip is on screen and the tab is visible.
function tick() {
  const s = document.querySelector(".season");
  if (!s || document.hidden) return;
  const r = s.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return;
  const next = nextMark();
  if (!next) return s.remove();
  const left = Math.floor((next[0] - Date.now()) / 1000);
  const parts = { d: Math.floor(left / 86400), h: Math.floor((left % 86400) / 3600), m: Math.floor((left % 3600) / 60), s: left % 60 };
  s.querySelector(".cdl").textContent = next[1];
  s.querySelector(".cd").setAttribute("aria-label", `${parts.d} days ${parts.h} hours ${parts.m} minutes`);
  for (const [u, n] of Object.entries(parts)) FX.digits(s.querySelector(`[data-u="${u}"] .roll`), String(n).padStart(2, "0"), -1);
  s.querySelector(".wk").style.setProperty("--p", Math.min(1, Math.max(0, (Date.now() - WEEK[0]) / (WEEK[1] - WEEK[0]))).toFixed(4));
}

// --- "Don't miss": last chance, ending by day, numbers, best brands ----------------------
let lcTab = ""; // "24" | "48" | "week"; empty = the shortest window that has deals
let grown = false; // the chart's bars grow from the baseline once per visit, the first time it is seen
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const whenText = (d) => {
  const n = daysLeft(d);
  return n === 0 ? "Ends today" : n === 1 ? "Ends tomorrow" : `Ends ${fmtDate(d.ends)}`;
};
const dmPool = () => DATA.deals.filter((d) => d.category !== ADULT || state.flags.has("adult"));
const lcWindows = (pool) => [["24", "Next 24 hours", 0], ["48", "Next 48 hours", 1], ["week", "This week", 7]].map(([k, label, max]) => ({ k, label, ds: pool.filter((d) => d.ends && daysLeft(d) <= max) }));
// Last chance: the tabs are a segmented control (an indicator slides to the chosen tab).
function lastChance(pool) {
  const windows = lcWindows(pool);
  const tab = windows.find((w) => w.k === lcTab) ?? windows.find((w) => w.ds.length) ?? windows[2];
  const cards = [...tab.ds].sort((a, b) => (b.discount ?? -1) - (a.discount ?? -1) || popular(a, b)).slice(0, 14);
  return `<section class="dm lastchance"><div class="shead"><div><h2>Last chance</h2><p>Deals that end soon, biggest discounts first.</p></div></div>
    <div class="tabs"><span class="ind" aria-hidden="true"></span>${windows.map((w) => `<button class="chip${w.k === tab.k ? " on" : ""}" aria-pressed="${w.k === tab.k}" data-lc="${w.k}">${w.label} <b>${w.ds.length.toLocaleString()}</b></button>`).join("")}</div>
    <div class="lc">${cards
      .map((d) => `<div class="lcc" data-id="${esc(d.id)}"><div class="lt"><span class="when${daysLeft(d) === 0 ? " hot" : ""}">${whenText(d)}</span><a class="t" href="${dealHref(d)}">${logo(d)}<b>${esc(d.name)}</b></a>${d.discount ? `<span class="big">${bigPct(d.discount)}</span>` : ""}<p>${esc(d.headline)}</p></div><div class="btns">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode">No code needed</span>`}${goBtn(d, "Get")}${shareBtn(d)}</div></div>`)
      .join("")}</div></section>`;
}
function moveInd(tabs) {
  const on = tabs?.querySelector(".chip.on"), ind = tabs?.querySelector(".ind");
  if (!on || !ind) return;
  const first = !ind.style.width; // place it without sliding the first time
  if (first) ind.style.transition = "none";
  ind.style.width = `${on.offsetWidth}px`;
  ind.style.transform = `translateX(${on.offsetLeft}px)`;
  if (first) (void ind.offsetWidth, (ind.style.transition = ""));
}
const placeInds = () => document.querySelectorAll(".tabs").forEach(moveInd);
function dontMiss() {
  const pool = dmPool();
  const windows = lcWindows(pool);

  // Ending by day: the next 15 days; the two busiest days are highlighted and named in the title.
  const days = Array.from({ length: 15 }, (_, i) => {
    const day = iso(TODAY + i * 864e5);
    return { day, n: pool.filter((d) => d.ends === day).length };
  });
  const max = Math.max(1, ...days.map((x) => x.n));
  const top2 = [...days].sort((a, b) => b.n - a.n).slice(0, 2).filter((x) => x.n >= max * 0.3);
  const hot = new Set(top2.map((x) => x.day));
  const title = top2.length === 2 ? `${(top2[0].n + top2[1].n).toLocaleString()} deals end on ${[...top2].sort((a, b) => a.day.localeCompare(b.day)).map((x) => fmtDate(x.day)).join(" and ")}` : `${days[0].n} deals end today`;
  const label = (x, i) => (i === 0 ? "Today" : x.day.endsWith("-11-27") ? "BF" : x.day.endsWith("-11-30") ? "CM" : String(Number(x.day.slice(8))));
  const chart = `<section class="dm"><div class="shead"><div><h2>${title}</h2><p>Deals ending each day, next two weeks. Tap a day to see its deals.</p></div></div>
    <div class="tl${grown ? " in" : ""}">${days.map((x, i) => `<button class="tbar${hot.has(x.day) ? " hot" : ""}" data-day="${x.day}" style="--h:${Math.max(2, (x.n / max) * 100).toFixed(1)}%;--i:${i}" aria-label="${x.n} deals end ${fmtDate(x.day)}"><span class="col"></span><span class="val">${x.n}</span><span class="tip" aria-hidden="true">${x.n.toLocaleString()} end ${fmtDate(x.day)}</span></button>`).join("")}</div>
    <div class="tlx">${days.map((x, i) => `<span${i === 0 ? ' class="today"' : ""}>${label(x, i)}</span>`).join("")}</div>
    <p class="legend">${pool.filter((d) => !d.ends).length.toLocaleString()} deals have no end date and are not shown.</p></section>`;

  // By the numbers + discount bands.
  const discounts = pool.map((d) => d.discount).filter(Boolean).sort((a, b) => a - b);
  const median = discounts[Math.floor(discounts.length / 2)] ?? 0;
  const bands = BANDS.map((b) => ({ ...b, n: pool.filter((d) => d.discount && b.test(d.discount)).length }));
  const bmax = Math.max(1, ...bands.map((b) => b.n));
  const numbers = `<section class="dm"><div class="nums">
      <div class="num"><b>${pool.length.toLocaleString()}</b><span>live deals</span></div>
      <div class="num"><b>${pool.filter((d) => d.codes.length).length.toLocaleString()}</b><span>with promo codes</span></div>
      <div class="num"><b>${median}%</b><span>typical discount</span></div>
      <div class="num hot"><b>${windows[1].ds.length}</b><span>end in 48 hours</span></div>
    </div>
    <div class="dist">${bands.map((b) => `<button class="r${b.n === bmax ? " hot" : ""}" data-band="${b.k}"><small>${b.label}</small><span class="track"><span class="fill" style="width:${Math.round((b.n / bmax) * 100)}%"></span></span><em>${b.n.toLocaleString()}</em></button>`).join("")}</div></section>`;

  // Best brands: hand-picked household names (data/brands.json).
  const brandDeals = (DATA.brands ?? []).map((id) => DATA.deals.find((d) => d.id === id)).filter(Boolean);
  const brands = brandDeals.length
    ? `<section class="dm"><div class="shead"><div><h2>Best brands on sale</h2><p>Household names, one tap to the deal.</p></div></div><div class="brands">${brandDeals
        .map((d) => `<a class="bd" data-id="${esc(d.id)}" href="${dealHref(d)}">${logo(d)}<b>${esc(d.name)}</b><em>${d.discount ? `${d.discount}% off` : "On sale"}</em></a>`)
        .join("")}</div></section>`
    : "";
  return season() + lastChance(pool) + chart + numbers + brands;
}

// --- search suggestions ---------------------------------------------------------------
// The six best name matches under the search box; Enter or click opens the deal's page.
let sel = -1;
function closeSuggest() {
  $("#suggest").hidden = true;
  $("#q").setAttribute("aria-expanded", "false");
  sel = -1;
}
function suggest() {
  if (!state.q) return closeSuggest();
  const hits = DATA.deals.filter(passesFilters).sort((a, b) => score(b) - score(a));
  if (!hits.length) return closeSuggest();
  sel = -1;
  $("#suggest").innerHTML =
    hits.slice(0, 6).map((d) => `<a class="it" role="option" href="${d.category === ADULT ? esc(d.url) : `deal/${esc(d.id)}/`}">${logo(d)}<span class="nm">${esc(d.name)}<span>${esc(d.headline)}</span></span>${d.codes.length ? `<code>${esc(d.codes[0])}</code>` : ""}</a>`).join("") +
    (hits.length > 6 ? `<button type="button" class="all" data-close>See all ${hits.length} results</button>` : "");
  $("#suggest").hidden = false;
  $("#q").setAttribute("aria-expanded", "true");
}

// --- events ---------------------------------------------------------------------
const toast = FX.toast;
const SITE_URL = () => location.href.split("#")[0].split("?")[0];
const fine = matchMedia("(hover: hover) and (pointer: fine)");

// Share links for one URL: the same networks as the static deal pages.
const nets = (url, text, subject) => {
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  return [
    ["x", "X", `https://x.com/intent/post?text=${t}&url=${u}`],
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`],
    ["telegram", "Telegram", `https://t.me/share/url?url=${u}&text=${t}`],
    ["reddit", "Reddit", `https://www.reddit.com/submit?url=${u}&title=${t}`],
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["email", "Email", `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${text}\n${url}`)}`],
  ];
};

// Share popover for mouse and trackpad users (phones get the native share sheet). Ported from the
// ui-sdk.dev popover behavior: opens beside its button, stays on screen, Escape or a click outside
// closes it and focus returns to the button.
let popFor = null;
function closePop() {
  const pop = $("#sharepop");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  popFor?.setAttribute("aria-expanded", "false");
  popFor = null;
}
function openPop(btn, { url, text, subject, title, line, pct, logoHtml }) {
  let pop = $("#sharepop");
  if (!pop) {
    pop = Object.assign(document.createElement("div"), { id: "sharepop", className: "sharepop", tabIndex: -1, hidden: true });
    pop.setAttribute("role", "dialog");
    document.body.append(pop);
  }
  if (popFor === btn) return closePop();
  closePop();
  pop.setAttribute("aria-label", `Share ${title}`);
  pop.innerHTML = `<div class="sp">${logoHtml}<div><b>${esc(title)}</b><span>${esc(line)}</span></div>${pct ? `<em>${pct}%</em>` : ""}</div>
    <div class="nets">${nets(url, text, subject).map(([id, name, href]) => `<a class="net" href="${esc(href)}" target="_blank" rel="noopener"><svg aria-hidden="true"><use href="nets.svg#${id}"/></svg><small>${name}</small></a>`).join("")}</div>
    <button class="btn link" data-copyurl="${esc(url)}">${I.link}<span>${esc(url.replace(/^https?:\/\//, ""))}</span><i>Copy</i></button>`;
  pop.hidden = false;
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
  const top = r.bottom + 8 + h > innerHeight - 8 && r.top - 8 - h > 8 ? r.top - 8 - h : r.bottom + 8;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.transformOrigin = `${r.right - left - r.width / 2}px ${top > r.top ? "0" : "100%"}`;
  pop.classList.remove("in");
  void pop.offsetWidth;
  pop.classList.add("in");
  popFor = btn;
  btn.setAttribute("aria-expanded", "true");
  pop.focus({ preventScroll: true });
}

// Shares the deal's page on this site (not the vendor link).
async function shareDeal(d, btn) {
  const url = new URL(`deal/${d.id}/`, SITE_URL()).href;
  const text = `${d.name}: ${d.headline}${d.codes.length ? `, code ${d.codes[0]}` : ""}`;
  if (fine.matches || !navigator.share) return openPop(btn, { url, text, subject: `Black Friday deal: ${d.name}`, title: d.name, line: d.headline, pct: d.discount, logoHtml: logo(d) });
  try {
    await navigator.share({ title: `${d.name} Black Friday deal`, text, url });
  } catch {}
}
async function shareSite(btn) {
  const url = SITE_URL();
  const text = `Every Black Friday 2026 deal in one list: ${DATA.deals.length.toLocaleString()} deals, ${DATA.deals.filter((d) => d.codes.length).length.toLocaleString()} promo codes`;
  if (fine.matches || !navigator.share) return openPop(btn, { url, text, subject: "Black Friday 2026 deals, all in one list", title: "BF26 deals", line: text, logoHtml: '<span class="logo ph">%</span>' });
  try {
    await navigator.share({ title: "BF26 deals", text, url });
  } catch {}
}

async function copy(btn) {
  const code = btn.dataset.code;
  FX.copyText(code);
  FX.copied(btn);
  toast(`Copied ${code}`, "Paste it at checkout");
}

// Pointer tilt with a soft glare on editors' picks (mouse and trackpad only).
function tilt(e) {
  const card = e.target.closest?.(".pc");
  if (!card || FX.reduce || !fine.matches) return;
  const r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  card.style.transform = `perspective(900px) rotateX(${((0.5 - py) * 5).toFixed(2)}deg) rotateY(${((px - 0.5) * 6).toFixed(2)}deg)`;
  card.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
  card.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
}

// After each list render: place the tab indicators, start the countdown, and grow the chart once.
const growIO = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); grown = true; growIO.disconnect(); }
}, { threshold: 0.35 });
function afterRender() {
  placeInds();
  tick();
  const tl = document.querySelector(".tl:not(.in)");
  if (tl) growIO.observe(tl);
}

function bind() {
  let debounce;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = e.target.value.trim().toLowerCase();
      render();
      suggest();
    }, 120);
  });
  $("#q").addEventListener("keydown", (e) => {
    const items = [...document.querySelectorAll("#suggest .it")];
    if ($("#suggest").hidden || !items.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle("on", i === sel));
    } else if (e.key === "Enter") {
      if (sel >= 0) location.href = items[sel].href;
      closeSuggest();
    }
  });
  $("#q").addEventListener("focus", suggest);
  $("#q").addEventListener("blur", () => setTimeout(closeSuggest, 150));
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#q")) {
      e.preventDefault();
      $("#q").focus();
    } else if (e.key === "Escape" && document.activeElement === $("#q")) {
      closeSuggest();
      $("#q").value = "";
      state.q = "";
      render();
    }
  });
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    state.cat = b.dataset.cat;
    state.sub = b.dataset.sub ?? "";
    render();
    $("#list").scrollIntoView({ block: "start" });
  });
  $("#side").addEventListener("change", (e) => {
    const { flag, platform } = e.target.dataset;
    const set = flag ? state.flags : platform ? state.platforms : null;
    if (!set) return;
    const key = flag ?? platform;
    e.target.checked ? set.add(key) : set.delete(key);
    render();
  });
  $("#sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    render();
  });
  $("#suggest").addEventListener("mousedown", (e) => e.preventDefault()); // keep focus so blur doesn't close before the click
  $("#suggest").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeSuggest();
  });
  $("#title").addEventListener("click", (e) => {
    if (!e.target.closest("[data-clear]")) return;
    state.day = state.band = "";
    state.sort = "popular";
    $("#sort").value = state.sort;
    render();
  });
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-preset]");
    if (!b) return;
    state.preset = b.dataset.preset === state.preset ? "" : b.dataset.preset;
    state.sort = preset()?.sort ?? "popular";
    $("#sort").value = state.sort;
    render();
  });
  $("#list").addEventListener("click", (e) => {
    const opened = e.target.closest(".go, .n a, .br, .fc, .pc a, .bd, .lcc a");
    const holder = e.target.closest("[data-id]");
    if (opened && holder) remember(holder.dataset.id);
    const lc = e.target.closest("[data-lc]");
    if (lc) {
      // Swap only the cards, so the indicator can slide and the long list below isn't rebuilt.
      lcTab = lc.dataset.lc;
      const sec = lc.closest(".lastchance"), tmp = document.createElement("div");
      tmp.innerHTML = lastChance(dmPool());
      const cards = tmp.querySelector(".lc");
      cards.classList.add("swap");
      sec.querySelector(".lc").replaceWith(cards);
      sec.querySelectorAll("[data-lc]").forEach((b) => { b.classList.toggle("on", b === lc); b.setAttribute("aria-pressed", String(b === lc)); });
      return moveInd(sec.querySelector(".tabs"));
    }
    const bar = e.target.closest("[data-day]");
    const band = e.target.closest("[data-band]");
    if (bar || band) {
      if (bar) [state.day, state.sort] = [bar.dataset.day, "discount"];
      if (band) [state.band, state.sort] = [band.dataset.band, "popular"];
      $("#sort").value = state.sort;
      render();
      return $("#list").scrollIntoView({ block: "start" });
    }
    const arrow = e.target.closest("[data-scroll]");
    if (arrow) return arrow.closest("section").querySelector(".pg").scrollBy({ left: Number(arrow.dataset.scroll) * 480, behavior: "smooth" });
    const vote = e.target.closest("[data-like]");
    if (vote) {
      const id = vote.dataset.like, on = !liked.has(id);
      on ? liked.add(id) : liked.delete(id);
      try { localStorage.setItem(LIKED, JSON.stringify([...liked])); } catch {}
      (STATS[id] ??= {}).like = Math.max(0, (STATS[id].like ?? 0) + (on ? 1 : -1));
      beacon(id, on ? "like" : "unlike");
      vote.classList.toggle("on", on);
      vote.setAttribute("aria-pressed", String(on));
      const roll = vote.querySelector(".roll"), n = STATS[id].like;
      if (n) FX.digits(roll, String(n), on ? 1 : -1);
      else (roll.textContent = "", delete roll.dataset.v);
      if (on && !FX.reduce) {
        vote.querySelector(".i").animate([{ transform: "none" }, { transform: "translateY(-5px)" }, { transform: "none" }], { duration: 380, easing: FX.EASE });
        FX.burst(vote, 8);
      }
      return;
    }
    if (holder && e.target.closest(".go")) beacon(holder.dataset.id, state.q ? "search" : "click");
    const share = e.target.closest("[data-share]");
    if (share) beacon(share.dataset.share, "share");
    if (share) return shareDeal(DATA.deals.find((d) => d.id === share.dataset.share), share);
    const site = e.target.closest("[data-sharesite]");
    if (site) return shareSite(site);
    const code = e.target.closest(".code");
    if (code) return copy(code);
    if (e.target.closest("a")) return;
    // A click anywhere else on a pick or last-chance card opens the deal, like its name does.
    const card = e.target.closest(".pc, .lcc");
    if (card && !e.target.closest("button")) {
      remember(card.dataset.id);
      const href = dealHref(DATA.deals.find((d) => d.id === card.dataset.id));
      return e.metaKey || e.ctrlKey ? window.open(href, "_blank") : location.assign(href);
    }
    // Anywhere else on a row toggles its details panel.
    const r = e.target.closest(".row");
    if (!r) return;
    const open = r.querySelector(".det");
    if (open) open.remove();
    else {
      r.insertAdjacentHTML("beforeend", details(DATA.deals.find((d) => d.id === r.dataset.id)));
      beacon(r.dataset.id, state.q ? "search" : "view");
    }
    r.classList.toggle("open", !open);
    r.querySelector(".more").setAttribute("aria-expanded", String(!open));
  });
  // Unknown favicon: show the product's initial instead of a broken image.
  $("#list").addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList?.contains("logo")) return;
    const ph = Object.assign(document.createElement("span"), { className: "logo ph", textContent: img.dataset.initial.toUpperCase() });
    img.replaceWith(ph);
  }, true);
  $("#toggle").addEventListener("click", (e) => {
    const open = $("#side").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", String(open));
  });
  // Share popover: copy its link, close on a click outside, Escape, or scroll.
  document.addEventListener("click", (e) => {
    const cp = e.target.closest("[data-copyurl]");
    if (cp) {
      FX.copyText(cp.dataset.copyurl);
      toast("Link copied", "Send it to someone who's shopping");
      return closePop();
    }
    if (e.target.closest(".net")) return setTimeout(closePop, 0);
    if (!e.target.closest("#sharepop, [data-share], [data-sharesite]")) closePop();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !popFor) return;
    const btn = popFor;
    closePop();
    btn.focus();
  });
  addEventListener("scroll", closePop, { passive: true });
  $("#list").addEventListener("pointermove", tilt);
  $("#list").addEventListener("pointerout", (e) => {
    const card = e.target.closest(".pc");
    if (card && !card.contains(e.relatedTarget)) card.style.transform = "";
  });
  addEventListener("resize", placeInds);
  document.fonts?.ready.then(placeInds);
  setInterval(tick, 1000);
}

async function main() {
  try {
    DATA = await (await fetch("data.json", { cache: "no-cache" })).json();
  } catch {
    $("#list").innerHTML = `<p class="empty">Could not load deals. Reload the page, or use the list on GitHub.</p>`;
    return;
  }
  // "Ending soon" counts from the visitor's today, not the build date.
  const now = new Date();
  TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  DATA.deals = DATA.deals.filter((d) => daysLeft(d) >= 0);
  const used = new Set(DATA.deals.flatMap((d) => d.platforms));
  $("#platforms").innerHTML = Object.entries(PLATFORM_LABEL)
    .filter(([p]) => used.has(p))
    .map(([p, label]) => `<label><input type="checkbox" data-platform="${p}"> ${label}</label>`)
    .join("");
  $("#stats").textContent = `${DATA.deals.length.toLocaleString()} live · ${DATA.deals.filter((d) => d.codes.length).length} codes`;
  $("#built").textContent = fmtDate(DATA.builtAt);
  $("#nsrc").textContent = DATA.sources;
  // Live engagement counts (Cloudflare only); ranking falls back to list counts without them.
  try { const r = await fetch("api/stats"); if (r.ok) STATS = await r.json(); } catch {}
  readHash();
  bind();
  countdown();
  setInterval(countdown, 60000);
  window.addEventListener("hashchange", () => {
    readHash();
    render();
  });
  render();
}
main();
