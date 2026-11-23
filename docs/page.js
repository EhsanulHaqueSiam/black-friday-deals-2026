// Shared behaviour for the static deal and category pages: copy-code buttons, logo fallback, "/" to search.
"use strict";
(() => {
  const toast = document.getElementById("toast");
  let timer;
  const say = (msg) => {
    toast.textContent = msg;
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("on"), 1400);
  };
  const copyText = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  };
  // Share: the phone's share sheet when there is one, otherwise copy the deal page link.
  document.addEventListener("click", async (e) => {
    const share = e.target.closest("[data-share]");
    const link = e.target.closest("[data-copylink]");
    if (share) {
      const { url, text } = share.dataset;
      if (navigator.share) {
        try {
          await navigator.share({ title: document.title, text, url });
        } catch {}
      } else {
        await copyText(url);
        say("Link copied");
      }
    } else if (link) {
      await copyText(link.dataset.copylink);
      say("Link copied");
    }
  });
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".code");
    if (!btn) return;
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
    toast.textContent = `Copied ${code}`;
    toast.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("on"), 1400);
  });
  // Unknown favicon: the product's initial instead of a broken image.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList?.contains("logo")) return;
    const ph = Object.assign(document.createElement("span"), { className: `${img.className} ph`, textContent: (img.dataset.initial || "?").toUpperCase() });
    img.replaceWith(ph);
  }, true);
  // Remember opened deals in this browser only, for the home page's "For you" suggestions.
  const opened = document.querySelector("[data-deal]")?.dataset.deal;
  // Engagement beacon to the Cloudflare site's counter (ignored on the GitHub mirror).
  const beacon = (id, type) => { try { fetch("/api/event", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id, type }) }); } catch {} };
  if (opened) beacon(opened, "view");
  document.addEventListener("click", (e) => {
    const id = document.querySelector("[data-deal]")?.dataset.deal ?? e.target.closest("[data-id]")?.dataset.id;
    if (!id) return;
    if (e.target.closest(".go")) beacon(id, "click");
    else if (e.target.closest("[data-share], [data-copylink], .shares .net")) beacon(id, "share");
  });
  if (opened) {
    try {
      const seen = JSON.parse(localStorage.getItem("bf26.viewed") ?? "[]");
      localStorage.setItem("bf26.viewed", JSON.stringify([opened, ...seen.filter((x) => x !== opened)].slice(0, 30)));
    } catch {}
  }
  // The search box goes to the home page, which reads ?q= into its filters.
  const q = document.querySelector(".search input");
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q) {
      e.preventDefault();
      q.focus();
    }
  });
})();
