/* ═══════════════════════════════════════════════════════════
   OKTAV — the rack
   You patch the instrument to play it. A cable dragged from
   MASTER OUT into a module's IN jack makes that unit live and
   opens its bay. Unplug to silence it.
   ═══════════════════════════════════════════════════════════ */

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

const UNITS = ["vector", "kernel", "editions", "desk"];
const LABEL = {
  vector: "VECTOR-9",
  kernel: "KERNEL",
  editions: "EDITIONS",
  desk: "THE DESK",
};
const WIRE_COLOR = {
  master: "#c9862c",
  vector: "#3fae7c",
  kernel: "#2f7f9c",
  editions: "#8b57c9",
  desk: "#c9502f",
};

const canvas = document.getElementById("wires");
const ctx = canvas.getContext("2d");
const bay = document.getElementById("bay");
const bayStandby = document.getElementById("bayStandby");
const roPwr = document.getElementById("roPwr");
const roSig = document.getElementById("roSig");
const roState = document.getElementById("roState");
const roCh = document.getElementById("roCh");
const masterNote = document.getElementById("masterNote");
const masterOut = document.getElementById("masterOut");
const unplugBtn = document.getElementById("unplugBtn");
const footState = document.getElementById("footState");

let W = 0;
let H = 0;
let DPR = 1;

/** @type {{id:string, from:string, to:string, unit:string, born:number, seed:number}[]} */
const cables = [];
let drag = null; // { fromEl, fromUnit, x, y }
let active = null;
let intro = 0;
let time = 0;

/* ── geometry ────────────────────────────────────────────── */
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  document.querySelectorAll(".scope").forEach(fitScope);
}

function fitScope(c) {
  const r = c.getBoundingClientRect();
  if (!r.width) return;
  c.width = Math.floor(r.width * DPR);
  c.height = Math.floor(r.height * DPR);
  const cx = c.getContext("2d");
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function jackOf(unitId, kind) {
  return document.querySelector(`.jack[data-unit="${unitId}"][data-jack="${kind}"]`);
}

/* ── cables ──────────────────────────────────────────────── */
function path(a, b, seed) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sway = REDUCED ? 0 : Math.sin(time * 0.7 + seed) * 5;
  // shallow drape: cables hang between jacks inside the rack, never onto the copy
  const sag = Math.min(64, 10 + dist * 0.075);
  return {
    cx: (a.x + b.x) / 2 + sway * 0.6,
    cy: (a.y + b.y) / 2 + sag + sway,
  };
}

function bezierAt(a, p, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * p.cx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * p.cy + t * t * b.y,
  };
}

function drawCable(a, b, color, opts = {}) {
  const p = path(a, b, opts.seed || 0);
  const grow = opts.grow == null ? 1 : opts.grow;

  // jacket
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  if (grow >= 1) {
    ctx.quadraticCurveTo(p.cx, p.cy, b.x, b.y);
  } else {
    // grow the cable out of the source jack
    const steps = 26;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * grow;
      const pt = bezierAt(a, p, b, t);
      ctx.lineTo(pt.x, pt.y);
    }
  }

  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // plug ferrules at both ends
  ferrule(a, color);
  if (grow >= 1) ferrule(b, color);

  // travelling signal
  if (opts.live && !REDUCED) {
    for (let k = 0; k < 2; k++) {
      const t = ((time * 0.32 + k * 0.5 + (opts.seed || 0) * 0.1) % 1);
      const pt = bezierAt(a, p, b, t);
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 16);
      g.addColorStop(0, "rgba(93,255,162,0.85)");
      g.addColorStop(0.35, "rgba(93,255,162,0.22)");
      g.addColorStop(1, "rgba(93,255,162,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function ferrule(pt, color) {
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = "#0b0e10";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, W, H);

  // cables live inside the rack: anything that would drape over the
  // detail copy is clipped away, as if the bay panel were in front
  const rackEl = document.getElementById("rack");
  const rr = rackEl.getBoundingClientRect();
  ctx.save();
  ctx.beginPath();
  ctx.rect(rr.left, rr.top, rr.width, rr.height);
  ctx.clip();

  for (const c of cables) {
    const from = c.fromEl ? center(c.fromEl) : null;
    const to = c.toEl ? center(c.toEl) : null;
    if (!from || !to) continue;
    const age = Math.min(1, (time - c.born) / 0.5);
    drawCable(from, to, WIRE_COLOR[c.fromUnit] || WIRE_COLOR.master, {
      seed: c.seed,
      live: c.unit === active,
      grow: REDUCED ? 1 : age,
    });
  }

  // intro demo cable
  if (intro > 0 && intro < 1 && !cables.length) {
    const a = center(masterOut);
    const b = center(jackOf("vector", "in"));
    drawCable(a, b, WIRE_COLOR.master, { seed: 1.2, grow: Math.min(1, intro), live: intro > 0.92 });
  }
  ctx.restore();

  // the cable in your hand is never clipped
  if (drag) {
    const from = center(drag.fromEl);
    drawCable(from, { x: drag.x, y: drag.y }, WIRE_COLOR[drag.fromUnit] || WIRE_COLOR.master, {
      seed: drag.seed,
      grow: 1,
      live: false,
    });
  }
}

/* ── scopes ──────────────────────────────────────────────── */
function drawScopes() {
  document.querySelectorAll(".unit").forEach((unit) => {
    const c = unit.querySelector(".scope");
    if (!c || !c.width) return;
    const cx = c.getContext("2d");
    const w = c.width / DPR;
    const h = c.height / DPR;
    const live = unit.classList.contains("is-live");

    cx.clearRect(0, 0, w, h);

    // graticule
    cx.strokeStyle = "rgba(125,137,146,0.14)";
    cx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(w, y);
      cx.stroke();
    }
    for (let i = 1; i < 8; i++) {
      const x = (w / 8) * i;
      cx.beginPath();
      cx.moveTo(x, 0);
      cx.lineTo(x, h);
      cx.stroke();
    }

    // trace
    cx.beginPath();
    const amp = live ? h * 0.34 : h * 0.05;
    for (let x = 0; x <= w; x += 2) {
      const u = x / w;
      let y;
      if (live) {
        y =
          h / 2 +
          Math.sin(u * 9 + time * 2.4) * amp * 0.62 +
          Math.sin(u * 21 - time * 1.5) * amp * 0.3 +
          Math.sin(u * 3 + time * 0.9) * amp * 0.16;
      } else {
        y = h / 2 + Math.sin(u * 6 + time * 0.5) * amp + (Math.random() - 0.5) * 1.2;
      }
      if (x === 0) cx.moveTo(x, y);
      else cx.lineTo(x, y);
    }
    cx.strokeStyle = live ? "rgba(93,255,162,0.95)" : "rgba(125,137,146,0.45)";
    cx.lineWidth = live ? 1.8 : 1.1;
    cx.shadowBlur = live ? 12 : 0;
    cx.shadowColor = "rgba(93,255,162,0.8)";
    cx.stroke();
    cx.shadowBlur = 0;
  });
}

/* ── bay ─────────────────────────────────────────────────── */
function showUnit(id) {
  active = id;
  bayStandby.hidden = !!id;
  document.querySelectorAll(".det").forEach((d) => {
    const on = d.dataset.det === id;
    d.hidden = !on;
    d.classList.remove("is-in");
    if (on) {
      void d.offsetWidth;
      d.classList.add("is-in");
    }
  });

  document.querySelectorAll(".unit").forEach((u) => {
    u.classList.toggle("is-live", !!cables.some((c) => c.unit === u.dataset.unit));
    u.classList.remove("is-armed");
  });

  const n = cables.length;
  roCh.textContent = `${n} / 4`;
  roSig.textContent = id ? LABEL[id] : "—";
  roState.textContent = id ? "ROUTING" : n ? "HOLD" : "STANDBY";
  masterNote.textContent = id ? "SIGNAL PRESENT" : n ? "CABLED" : "DRAG THE CABLE";
  footState.textContent = id
    ? `SIGNAL PRESENT — ${LABEL[id]}`
    : n
      ? `${n} CABLE${n > 1 ? "S" : ""} ATTACHED`
      : "RACK READY";
  if (id) bay.scrollTop = 0;
}

function connect(fromEl, fromUnit, toEl, unitId) {
  // one cable per module
  const existing = cables.findIndex((c) => c.unit === unitId);
  if (existing >= 0) cables.splice(existing, 1);
  cables.push({
    id: unitId + "-" + cables.length,
    fromEl,
    fromUnit,
    toEl,
    unit: unitId,
    born: time,
    seed: Math.random() * 6,
  });
  toEl.classList.add("is-plugged");
  showUnit(unitId);
}

function unplug(unitId) {
  const i = cables.findIndex((c) => c.unit === unitId);
  if (i < 0) return;
  cables.splice(i, 1);
  const jack = jackOf(unitId, "in");
  if (jack) jack.classList.remove("is-plugged");
  showUnit(cables.length ? cables[cables.length - 1].unit : null);
}

function unplugAll() {
  cables.length = 0;
  document.querySelectorAll(".jack").forEach((j) => j.classList.remove("is-plugged"));
  showUnit(null);
}

/* ── pointer ─────────────────────────────────────────────── */
let downAt = 0;
let downPos = { x: 0, y: 0 };
let armedFrom = null;

function onDown(e) {
  const el = e.target.closest && e.target.closest(".jack");
  if (!el) {
    // clicking a module body also opens it (usability)
    const unit = e.target.closest && e.target.closest(".unit");
    if (unit) {
      const id = unit.dataset.unit;
      if (cables.some((c) => c.unit === id)) showUnit(id);
      else connect(masterOut, "master", jackOf(id, "in"), id);
    }
    return;
  }
  e.preventDefault();
  downAt = performance.now();
  downPos = { x: e.clientX, y: e.clientY };

  if (el.dataset.jack === "in") {
    // quick tap on an IN jack: patch it from master
    armedFrom = el;
    return;
  }

  armedFrom = null;
  drag = {
    fromEl: el,
    fromUnit: el.dataset.unit,
    x: e.clientX,
    y: e.clientY,
    seed: Math.random() * 6,
  };
  el.classList.add("is-dragging");
}

function onMove(e) {
  if (drag) {
    drag.x = e.clientX;
    drag.y = e.clientY;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const jack = over && over.closest && over.closest('.jack[data-jack="in"]');
    document.querySelectorAll(".jack.is-target").forEach((j) => j.classList.remove("is-target"));
    if (jack && jack.dataset.unit !== drag.fromUnit) jack.classList.add("is-target");
    return;
  }
  // idle: ring the jack under the cursor
  const over = e.target.closest && e.target.closest(".jack");
  document.querySelectorAll(".jack.is-hover").forEach((j) => j.classList.remove("is-hover"));
  if (over) over.classList.add("is-hover");
}

function onUp(e) {
  const quick = performance.now() - downAt < 320 &&
    Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 8;

  if (drag) {
    const over = document.elementFromPoint(e.clientX, e.clientY);
    const jack = over && over.closest && over.closest('.jack[data-jack="in"]');
    drag.fromEl.classList.remove("is-dragging");
    document.querySelectorAll(".jack.is-target").forEach((j) => j.classList.remove("is-target"));
    if (jack && jack.dataset.unit !== drag.fromUnit) {
      connect(drag.fromEl, drag.fromUnit, jack, jack.dataset.unit);
    }
    drag = null;
    return;
  }

  if (armedFrom) {
    const id = armedFrom.dataset.unit;
    if (quick) {
      if (cables.some((c) => c.unit === id)) unplug(id);
      else connect(masterOut, "master", armedFrom, id);
    }
    armedFrom = null;
  }
}

/* ── loop ────────────────────────────────────────────────── */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  if (intro > 0 && intro < 1) {
    intro += dt / 1.35;
    if (intro >= 1) {
      intro = 1;
      // land the demo cable for real
      connect(masterOut, "master", jackOf("vector", "in"), "vector");
    }
  }

  render();
  drawScopes();

  // power rail jitter
  if (!REDUCED) {
    const v = 12 + Math.sin(time * 1.7) * 0.012 + Math.sin(time * 6.3) * 0.004;
    roPwr.textContent = "+" + v.toFixed(2) + " V";
  }

  requestAnimationFrame(frame);
}

function boot() {
  resize();
  requestAnimationFrame(frame);
  if (REDUCED) {
    connect(masterOut, "master", jackOf("vector", "in"), "vector");
    intro = 1;
  } else {
    setTimeout(() => {
      intro = 0.001;
    }, 700);
  }
}

addEventListener("resize", () => {
  resize();
});
addEventListener("pointerdown", onDown);
addEventListener("pointermove", onMove, { passive: true });
addEventListener("pointerup", onUp);
addEventListener("pointercancel", onUp);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") showUnit(null);
  if (e.key === "Enter" || e.key === " ") {
    const u = document.activeElement && document.activeElement.closest(".unit");
    if (u) {
      e.preventDefault();
      const id = u.dataset.unit;
      if (cables.some((c) => c.unit === id)) showUnit(id);
      else connect(masterOut, "master", jackOf(id, "in"), id);
    }
  }
});
unplugBtn.addEventListener("click", unplugAll);

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(boot).catch(boot);
} else {
  addEventListener("load", boot);
}

/* ── hooks for the test harness ──────────────────────────── */
window.__oktav = {
  get cables() {
    return cables.map((c) => ({ unit: c.unit, from: c.fromUnit }));
  },
  get active() {
    return active;
  },
  patch(unitId) {
    connect(masterOut, "master", jackOf(unitId, "in"), unitId);
  },
  unplug,
  unplugAll,
  show: showUnit,
  centerOf(unitId, kind) {
    return center(jackOf(unitId, kind));
  },
  master() {
    return center(masterOut);
  },
};
