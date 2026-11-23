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
const state = { q: "", cat: "", sub: "", platforms: new Set(), flags: new Set(), sort: "popular" };
// How many independent community lists carry the deal: the popularity signal GitHub Pages can offer.
const lists = (d) => d.sources.filter((s) => !s.startsWith("http")).length;

const daysLeft = (d) => (d.ends ? Math.round((Date.parse(d.ends) - TODAY) / 864e5) : Infinity);
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Everything except category/subcategory, so the tree counts show what each category would give.
function passesFilters(d) {
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
  renderList(shown);
  $("#title").innerHTML = `<b>${shown.length.toLocaleString()}</b> deals${state.cat ? ` in ${esc(state.sub || state.cat)}` : ""}`;
  writeHash();
}

function renderTree(base) {
  const count = (c, s) => base.filter((d) => d.category === c && (s === undefined || (d.subcategory ?? "More") === s)).length;
  let html = `<li><button data-cat="" class="${state.cat ? "" : "on"}">All<em>${base.length}</em></button></li>`;
  for (const [cat, subs] of Object.entries(DATA.taxonomy)) {
    const n = count(cat);
    if (!n && state.cat !== cat) continue;
    html += `<li><button data-cat="${esc(cat)}" class="${state.cat === cat && !state.sub ? "on" : ""}">${esc(cat)}<em>${n}</em></button></li>`;
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
const logo = (d) => `<img class="logo" src="https://icons.duckduckgo.com/ip3/${esc(host(d.url))}.ico" alt="" loading="lazy" width="28" height="28" data-initial="${esc(d.name[0] ?? "?")}">`;
const codeBtn = (c) => `<button class="btn code" data-code="${esc(c)}" title="Copy ${esc(c)}">${esc(c)}<i>Copy</i></button>`;
const goBtn = (d, label = "Get deal") => `<a class="btn go" href="${esc(d.url)}" target="_blank" rel="noopener">${label} <span aria-hidden="true">↗</span></a>`;
const dayWord = (n) => (n === 0 ? "last day" : n === 1 ? "1 day left" : `${n} days left`);
const endsText = (d) => (d.ends ? `<span class="left${daysLeft(d) <= 3 ? " hot" : ""}">ends ${fmtDate(d.ends)} · ${dayWord(daysLeft(d))}</span>` : "");
// The discount badge, unless the headline already says it.
const pct = (d) => (d.discount && !d.headline.includes(`${d.discount}%`) ? `<span class="pct">${d.discount}% off</span>` : "");

// One compact row: logo, name, headline, copy-code + get-deal. Full terms open on click (details()).
function row(d) {
  return `<article class="row" data-id="${esc(d.id)}">
    ${logo(d)}
    <div class="n"><a href="${d.category === ADULT ? esc(d.url) : `deal/${esc(d.id)}/`}">${esc(d.name)}</a>${d.description ? `<small>${esc(d.description)}</small>` : ""}</div>
    <div class="act">${d.codes.length ? codeBtn(d.codes[0]) : `<span class="nocode">No code needed</span>`}${goBtn(d)}</div>
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
  </div>`;
}

// Editors' picks: only on the plain front view, so they never push filtered results down.
function picks() {
  const plain = !state.q && !state.cat && !state.platforms.size && [...state.flags].every((f) => f === "adult") && state.sort === "popular";
  const ds = plain ? (DATA.picks ?? []).map((p) => ({ ...DATA.deals.find((d) => d.id === p.id), why: p.why })).filter((d) => d.id) : [];
  if (!ds.length) return "";
  return `<section class="picks"><h2>Editors' picks</h2><p>Deals worth buying even if you weren't shopping.</p><div class="pg">${ds
    .map((d) => `<div class="pc">
      <div class="ptop">${logo(d)}<div><b>${esc(d.name)}</b><span>${esc(d.subcategory ?? d.category)}</span></div></div>
      ${d.discount ? `<div class="big">${d.discount}% off</div>` : ""}
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
    popular: (a, b) => lists(b) - lists(a) || (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name),
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
    list.innerHTML = (state.sort === "popular" ? picks() : "") + `<section class="group">${[...shown].sort(by).map(row).join("")}</section>`;
    return;
  }
  // Grouped: category > subcategory in taxonomy order, unknown subcategory last as "More".
  let html = "";
  for (const [cat, subs] of Object.entries(DATA.taxonomy)) {
    for (const s of [...subs, "More"]) {
      const g = shown.filter((d) => d.category === cat && (d.subcategory ?? "More") === s);
      if (g.length) html += `<section class="group"><h3 class="sechead">${esc(state.cat ? "" : `${cat.toUpperCase()} / `)}${esc(s.toUpperCase())} · ${g.length}</h3>${g.map(row).join("")}</section>`;
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
  state.sub = p.get("s") ?? "";
  state.platforms = new Set((p.get("p") ?? "").split(",").filter((x) => x in PLATFORM_LABEL));
  state.flags = new Set((p.get("f") ?? "").split(",").filter((x) => FLAGS.includes(x)));
  state.sort = ["group", "discount", "ends", "name"].includes(p.get("sort")) ? p.get("sort") : "popular";
  $("#q").value = p.get("q") ?? "";
  $("#sort").value = state.sort;
  document.querySelectorAll("[data-flag]").forEach((el) => (el.checked = state.flags.has(el.dataset.flag)));
  document.querySelectorAll("[data-platform]").forEach((el) => (el.checked = state.platforms.has(el.dataset.platform)));
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
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 1400);
}

async function copy(btn) {
  const code = btn.dataset.code;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: code });
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  btn.classList.add("done");
  setTimeout(() => btn.classList.remove("done"), 1200);
  toast(`Copied ${code}`);
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
  $("#list").addEventListener("click", (e) => {
    const code = e.target.closest(".code");
    if (code) return copy(code);
    if (e.target.closest("a")) return;
    // Anywhere else on a row toggles its details panel.
    const r = e.target.closest(".row");
    if (!r) return;
    const open = r.querySelector(".det");
    if (open) open.remove();
    else r.insertAdjacentHTML("beforeend", details(DATA.deals.find((d) => d.id === r.dataset.id)));
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
  readHash();
  bind();
  window.addEventListener("hashchange", () => {
    readHash();
    render();
  });
  render();
}
main();
