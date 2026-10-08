import { chromium } from "playwright";

const BASE = process.env.BASE || "http://127.0.0.1:8877";
const browser = await chromium.launch();

const AUDIT = () => {
  const out = { overflow: [], collisions: [], clip: [], contrast: [], layout: {} };
  const vw = window.innerWidth;

  // 1. horizontal overflow
  out.layout.scrollW = document.documentElement.scrollWidth;
  out.layout.viewW = vw;
  out.layout.hOverflow = document.documentElement.scrollWidth > vw + 1;

  // 2. text wider than its panel (clipped by overflow:hidden)
  const measure = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return r.getBoundingClientRect();
  };
  document.querySelectorAll(".unit-name, .rail-label, .det-title, .cta span, .brand-mark").forEach((el) => {
    const t = measure(el);
    const host = el.closest(".unit, .rail, .det, .strip") || el.parentElement;
    const h = host.getBoundingClientRect();
    if (t.width > h.width + 2 || t.right > h.right + 2 || t.left < h.left - 2) {
      out.clip.push({
        sel: el.className,
        text: el.innerText.replace(/\n/g, "/").slice(0, 22),
        textW: Math.round(t.width),
        hostW: Math.round(h.width),
        overRight: Math.round(t.right - h.right),
        overLeft: Math.round(h.left - t.left),
      });
    }
  });

  // 3. any box sticking out of the viewport
  document.querySelectorAll(".unit, .rail, .det-head, .spec, .bay").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0) return;
    if (r.right > vw + 1 || r.left < -1) {
      out.overflow.push({ sel: el.className, left: Math.round(r.left), right: Math.round(r.right) });
    }
  });

  // 4. cable path vs readable copy
  const jack = (u, k) => document.querySelector(`.jack[data-unit="${u}"][data-jack="${k}"]`);
  const ctr = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const texts = [...document.querySelectorAll(".det:not([hidden]) .det-lede, .det:not([hidden]) .det-copy, .det:not([hidden]) .spec, .det:not([hidden]) .laws, .det:not([hidden]) .editions")];
  const master = document.getElementById("masterOut");
  const bez = (a, p, b, t) => {
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * p.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * p.y + t * t * b.y,
    };
  };
  document.querySelectorAll(".unit.is-live").forEach((unit) => {
    const id = unit.dataset.unit;
    const a = ctr(master);
    const b = ctr(jack(id, "in"));
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const sag = Math.min(64, 10 + dist * 0.075);
    const p = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + sag };
    for (let i = 0; i <= 40; i++) {
      const pt = bez(a, p, b, i / 40);
      for (const t of texts) {
        const r = t.getBoundingClientRect();
        if (pt.x > r.left - 4 && pt.x < r.right + 4 && pt.y > r.top - 4 && pt.y < r.bottom + 4) {
          out.collisions.push({ unit: id, t: (i / 40).toFixed(2), hit: t.className.split(" ")[0] });
          i = 41;
          break;
        }
      }
    }
  });

  // 5. contrast of key text against its backdrop
  const lum = (c) => {
    const m = c.match(/\d+(\.\d+)?/g).map(Number);
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
  };
  const ratio = (a, b) => {
    const l1 = lum(a);
    const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      n = n.parentElement;
    }
    return "rgb(13,15,17)";
  };
  const probes = [
    [".brand-mark", "brand"],
    [".det-lede", "lede"],
    [".det-copy", "copy"],
    [".spec dd", "spec-value"],
    [".spec dt", "spec-label"],
    [".unit-name", "unit-name"],
    [".unit-line", "unit-line"],
    [".foot-meta", "foot"],
    [".ro-cell b", "readout"],
  ];
  for (const [sel, name] of probes) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const fg = getComputedStyle(el).color;
    const bg = bgOf(el);
    const r = ratio(fg, bg);
    out.contrast.push({ name, ratio: +r.toFixed(2), ok: r >= 4.5, fg, bg });
  }
  return out;
};

async function run(w, h, label) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__oktav);
  await p.waitForTimeout(2400);

  console.log(`\n===== ${label} ${w}×${h} =====`);
  for (const unit of ["vector", "kernel", "editions", "desk"]) {
    await p.evaluate((u) => window.__oktav.patch(u), unit);
    await p.waitForTimeout(320);
    const r = await p.evaluate(AUDIT);
    const bad = [
      r.layout.hOverflow ? `H-OVERFLOW ${r.layout.scrollW}>${r.layout.viewW}` : null,
      ...r.clip.map((c) => `CLIP ${c.text} +${c.overRight}px`),
      ...r.overflow.map((o) => `OFFSCREEN ${o.sel.slice(0, 18)}`),
      ...r.collisions.map((c) => `CABLE-ON-TEXT ${c.unit} ${c.hit}@${c.t}`),
      ...r.contrast.filter((c) => !c.ok).map((c) => `CONTRAST ${c.name} ${c.ratio}`),
    ].filter(Boolean);
    console.log(` ${unit.padEnd(9)} ${bad.length ? bad.join(" · ") : "clean"}`);
    if (bad.length) {
      const detail = { clip: r.clip, collisions: r.collisions, contrast: r.contrast.filter((c) => !c.ok) };
      console.log("   " + JSON.stringify(detail));
    }
  }
  await ctx.close();
}

await run(1440, 900, "desktop");
await run(1280, 800, "laptop");
await run(834, 1112, "tablet");
await run(390, 844, "phone");

await browser.close();
console.log("\n audit done");
