// Shared motion for the home page (app.js) and the static pages (page.js): rolling digits,
// the copy-code flip, a one-shot confetti burst, and the toast. Every effect runs once per action
// and none loops; prefers-reduced-motion keeps the state changes and drops the movement.
"use strict";
const FX = (() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.23,1,.32,1)";
  const ICON = {
    copy: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg class="i ck" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M20 6 9 17l-5-5"/></svg>',
  };

  // Rolling digits: only the characters that changed slide, up when the number grows, down when it shrinks.
  function digits(el, str, dir = 1) {
    const old = el.dataset.v ?? "";
    if (old === str) return;
    el.dataset.v = str;
    if (!old || old.length !== str.length || reduce) {
      el.innerHTML = [...str].map((c) => `<span class="dg" aria-hidden="true"><span>${c}</span></span>`).join("");
      return;
    }
    [...str].forEach((c, i) => {
      if (c === old[i]) return;
      const dg = el.children[i], prev = dg.lastElementChild, next = document.createElement("span");
      next.textContent = c;
      dg.append(next);
      const o = { duration: 380, easing: EASE };
      prev.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${-100 * dir}%)`, opacity: 0 }], o).finished.then(() => prev.remove(), () => prev.remove());
      next.animate([{ transform: `translateY(${100 * dir}%)`, opacity: 0 }, { transform: "none", opacity: 1 }], o);
    });
  }

  // Confetti from the middle of an element: orange, white and gray strips that pop out and fall.
  const COLORS = ["#ff6a2b", "#fff", "#ff6a2b", "#8a8a8a"];
  function burst(el, n = 14) {
    if (reduce) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < n; i++) {
      const p = document.createElement("span");
      p.className = "spk";
      p.style.background = COLORS[i % COLORS.length];
      document.body.append(p);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = 40 + Math.random() * 28;
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d * 0.7, rot = (Math.random() - 0.5) * 540;
      p.animate([
        { transform: `translate(${cx}px,${cy}px) rotate(0)` },
        { transform: `translate(${cx + dx}px,${cy + dy}px) rotate(${rot}deg)`, offset: 0.55 },
        { transform: `translate(${cx + dx * 1.15}px,${cy + dy + 34}px) rotate(${rot * 1.6}deg) scale(.8)`, opacity: 0 },
      ], { duration: 900, easing: "cubic-bezier(.2,.7,.4,1)" }).finished.then(() => p.remove(), () => p.remove());
    }
  }

  // Copy code button: flips over like a scoreboard card and lands on its orange "Copied" face.
  function copied(btn) {
    const done = () => {
      btn.classList.add("done");
      clearTimeout(btn._t);
      btn._t = setTimeout(() => btn.classList.remove("done"), 1800);
    };
    if (reduce || btn.classList.contains("done") || !btn.animate) return done();
    btn.animate([{ transform: "perspective(320px) rotateX(0)" }, { transform: "perspective(320px) rotateX(90deg)" }], { duration: 120, easing: "cubic-bezier(.5,0,.75,0)" }).finished.then(() => {
      done();
      btn.animate([{ transform: "perspective(320px) rotateX(-90deg)" }, { transform: "perspective(320px) rotateX(0)" }], { duration: 260, easing: EASE });
    });
    burst(btn);
  }

  // The site's one toast (#toast): a check that draws itself, a title, and an optional hint.
  let timer;
  function toast(title, sub = "") {
    const t = document.getElementById("toast");
    if (!t) return;
    t.innerHTML = `<span class="ti">${ICON.check}</span><span><b></b>${sub ? "<small></small>" : ""}</span>`;
    t.querySelector("b").textContent = title;
    if (sub) t.querySelector("small").textContent = sub;
    t.classList.remove("on");
    void t.offsetWidth; // restart the transition when toasts come back to back
    t.classList.add("on");
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove("on"), 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  return { reduce, EASE, ICON, digits, burst, copied, toast, copyText };
})();
