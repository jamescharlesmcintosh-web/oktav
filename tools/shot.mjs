import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE || "http://127.0.0.1:8877";
const OUT = "shots";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();

async function page(w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  p.on("console", (m) => {
    if (m.type() === "error") console.log("CONSOLE:", m.text());
  });
  await p.goto(BASE, { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__oktav, null, { timeout: 15000 });
  await p.waitForTimeout(2600);
  return p;
}

// 1 — the panel with the demo cable landed
let p = await page();
await p.screenshot({ path: `${OUT}/01-panel.png` });

// 2 — mid-drag: rubber band from MASTER OUT toward a module
const m = await p.evaluate(() => window.__oktav.master());
const target = await p.evaluate(() => window.__oktav.centerOf("editions", "in"));
await p.mouse.move(m.x, m.y);
await p.mouse.down();
await p.mouse.move((m.x + target.x) / 2 + 40, (m.y + target.y) / 2 + 130, { steps: 12 });
await p.waitForTimeout(220);
await p.screenshot({ path: `${OUT}/02-drag.png` });

// 3 — dropped: EDITIONS live
await p.mouse.move(target.x, target.y, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/03-editions.png` });

// 4 — another unit
await p.evaluate(() => window.__oktav.patch("desk"));
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/04-desk.png` });

// 5 — kernel bay
await p.evaluate(() => window.__oktav.patch("kernel"));
await p.waitForTimeout(700);
await p.screenshot({ path: `${OUT}/05-kernel.png` });

// 6 — vector
await p.evaluate(() => window.__oktav.show("vector"));
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/06-vector.png` });

await p.context().close();

// 7 — small screen
const mob = await page(390, 844);
await mob.evaluate(() => window.__oktav.show("editions"));
await mob.waitForTimeout(700);
await mob.screenshot({ path: `${OUT}/07-mobile.png` });
await mob.context().close();

await browser.close();
console.log("oktav shots written");
