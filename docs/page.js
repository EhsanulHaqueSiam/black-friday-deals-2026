// Shared behaviour for the static deal and category pages: copy-code buttons, logo fallback, "/" to search.
"use strict";
(() => {
  const toast = document.getElementById("toast");
  let timer;
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
  // The search box goes to the home page, which reads ?q= into its filters.
  const q = document.querySelector(".search input");
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q) {
      e.preventDefault();
      q.focus();
    }
  });
})();
