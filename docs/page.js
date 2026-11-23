// Shared behaviour for the static deal and category pages: copy-code buttons, logo fallback, "/" to search.
// Motion and the toast come from fx.js, which loads first.
"use strict";
(() => {
  const { copyText, copied, toast } = FX;
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
        toast("Link copied", "Send it to someone who's shopping");
      }
    } else if (link) {
      await copyText(link.dataset.copylink);
      toast("Link copied", "Send it to someone who's shopping");
    }
  });
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".code");
    if (!btn) return;
    copyText(btn.dataset.code);
    copied(btn);
    toast(`Copied ${btn.dataset.code}`, "Paste it at checkout");
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
