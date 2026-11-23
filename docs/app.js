// Deals directory: loads data.json (written by scripts/build.ts) and renders it with
// search, a category tree, platform and deal filters, sorting and copy-to-clipboard codes.
// Filter state lives in the URL hash so any view can be shared.
"use strict";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const PLATFORM_LABEL = { web: "Web", mac: "Mac", windows: "Windows", linux: "Linux", ios: "iOS", android: "Android", "browser-extension": "Browser extension", wordpress: "WordPress", physical: "Physical product" };
const FLAGS = ["code", "soon", "onetime", "live"];

let DATA;
let TODAY;
const state = { q: "", cat: "", sub: "", platforms: new Set(), flags: new Set(), sort: "group" };

const daysLeft = (d) => (d.ends ? Math.round((Date.parse(d.ends) - TODAY) / 864e5) : Infinity);
const fmtDate = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Everything except category/subcategory, so the tree counts show what each category would give.
function passesFilters(d) {
  if (state.platforms.size && !d.platforms.some((p) => state.platforms.has(p))) return false;
  if (state.flags.has("code") && !d.codes.length) return false;
  if (state.flags.has("soon") && !(daysLeft(d) <= 3)) return false;
  if (state.flags.has("onetime") && d.pricing !== "one-time") return false;
  if (state.flags.has("live") && d.upcoming) return false;
  if (state.q) {
    const hay = `${d.name} ${d.description ?? ""} ${d.deal} ${d.codes.join(" ")} ${d.category} ${d.subcategory ?? ""}`.toLowerCase();
    if (!state.q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
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

function row(d) {
  const left = daysLeft(d);
  const codes = d.codes.length
    ? `<div class="codes">${d.codes.slice(0, 3).map((c) => `<button class="code" data-code="${esc(c)}" title="Copy code">${esc(c)}</button>`).join("")}${d.codes.length > 3 ? `<button class="more" data-more="${esc(d.id)}">+${d.codes.length - 3} more</button>` : ""}</div>`
    : `<span class="nocode">no code needed</span>`;
  const meta = [
    `${esc(d.category)}${d.subcategory ? ` / ${esc(d.subcategory)}` : ""}`,
    d.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(", "),
    d.pricing,
    d.newCustomersOnly ? "new customers" : "",
    // Web-researched source first (it is the verified one), then at most one list; the rest as a count.
    [...d.sources].sort((a, b) => b.startsWith("http") - a.startsWith("http")).slice(0, 2)
      .map((s) => (s.startsWith("http") ? `<a href="${esc(s)}" rel="noopener">source</a>` : `<a href="https://github.com/${esc(s)}" rel="noopener">via ${esc(s.split("/")[0])}</a>`))
      .join(" ") + (d.sources.length > 2 ? ` <span title="${esc(d.sources.join(", "))}">+${d.sources.length - 2} lists</span>` : ""),
  ].filter(Boolean);
  return `<article class="row">
    <div class="t"><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>${d.description ? `<small>${esc(d.description)}</small>` : ""}</div>
    <div class="d">${d.upcoming ? `<span class="soonTag">Coming soon. </span>` : ""}${esc(d.deal)}</div>
    <div class="m">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
    <div class="r">${d.discount ? `<span class="pct">${d.discount}% off</span>` : ""}${codes}${d.ends ? `<span class="ends${left <= 3 ? " soon" : ""}">ends ${fmtDate(d.ends)}</span>` : ""}</div>
  </article>`;
}

function renderList(shown) {
  const list = $("#list");
  if (!shown.length) {
    list.innerHTML = `<p class="empty">No deals match. Try fewer filters.</p>`;
    return;
  }
  const by = {
    discount: (a, b) => (b.discount ?? -1) - (a.discount ?? -1) || a.name.localeCompare(b.name),
    ends: (a, b) => daysLeft(a) - daysLeft(b) || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  }[state.sort];
  if (by) {
    list.innerHTML = `<section class="group">${[...shown].sort(by).map(row).join("")}</section>`;
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
  if (state.sort !== "group") p.set("sort", state.sort);
  const h = p.toString();
  history.replaceState(null, "", h ? `#${h}` : location.pathname);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  state.q = (p.get("q") ?? "").toLowerCase();
  state.cat = p.get("c") ?? "";
  state.sub = p.get("s") ?? "";
  state.platforms = new Set((p.get("p") ?? "").split(",").filter((x) => x in PLATFORM_LABEL));
  state.flags = new Set((p.get("f") ?? "").split(",").filter((x) => FLAGS.includes(x)));
  state.sort = ["discount", "ends", "name"].includes(p.get("sort")) ? p.get("sort") : "group";
  $("#q").value = p.get("q") ?? "";
  $("#sort").value = state.sort;
  document.querySelectorAll("[data-flag]").forEach((el) => (el.checked = state.flags.has(el.dataset.flag)));
  document.querySelectorAll("[data-platform]").forEach((el) => (el.checked = state.platforms.has(el.dataset.platform)));
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
    }, 120);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== $("#q")) {
      e.preventDefault();
      $("#q").focus();
    } else if (e.key === "Escape" && document.activeElement === $("#q")) {
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
  $("#list").addEventListener("click", (e) => {
    const code = e.target.closest(".code");
    if (code) return copy(code);
    const more = e.target.closest(".more");
    if (more) {
      const d = DATA.deals.find((x) => x.id === more.dataset.more);
      more.outerHTML = d.codes.slice(3).map((c) => `<button class="code" data-code="${esc(c)}" title="Copy code">${esc(c)}</button>`).join("");
    }
  });
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
  readHash();
  bind();
  window.addEventListener("hashchange", () => {
    readHash();
    render();
  });
  render();
}
main();
