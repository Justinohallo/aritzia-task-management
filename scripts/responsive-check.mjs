#!/usr/bin/env node
/**
 * T-10 — the manual procedure behind `AC-UI-1..4`, made repeatable.
 *
 * jsdom does not lay out (ADR-0006), so these four criteria are verified in
 * a real browser. This script drives the pre-installed Chromium over the
 * DevTools protocol using nothing but Node's built-in WebSocket — no
 * Playwright, no new dependency (CLAUDE.md rule 4) — against a running
 * production server, and prints one table per viewport:
 *
 *   node scripts/responsive-check.mjs http://localhost:3000
 *
 * For each of 320 / 768 / 1024 it logs in, visits /login and /tasks, adds
 * two tasks (one with a long unbroken title, the case most likely to widen
 * the page), and reports: document scrollWidth vs. viewport width
 * (`AC-UI-1`, `AC-UI-4`), the smallest interactive control's box under a
 * coarse-pointer emulation (`AC-UI-2`), and at 1024 whether the form and
 * list sit side by side (`AC-UI-3`). Screenshots go to --out (default:
 * ./responsive-shots). The exit code is non-zero if any check fails, so the
 * output is evidence, not a vibe. It is not a Jest test on purpose: it
 * needs a browser and a server, and it is run and its date recorded by
 * hand, per the `ACCEPTANCE.md` legend for `◉`; the record is
 * scripts/responsive-check.md.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "responsive-shots";
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
const VIEWPORTS = [320, 768, 1024];
const MIN_TARGET = 44;

mkdirSync(OUT, { recursive: true });

const port = 9222 + Math.floor(Math.random() * 1000);
const chrome = spawn(
  CHROMIUM,
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--user-data-dir=" + path.join(OUT, ".profile"),
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);
let stderr = "";
chrome.stderr.on("data", (d) => (stderr += d));

async function waitForDevtools() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Chromium did not expose DevTools:\n" + stderr);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const l of this.listeners) l(msg);
      }
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve);
      ws.addEventListener("error", reject);
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method) {
    return new Promise((resolve) => {
      const l = (msg) => {
        if (msg.method === method) {
          this.listeners.splice(this.listeners.indexOf(l), 1);
          resolve(msg.params);
        }
      };
      this.listeners.push(l);
    });
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async goto(url) {
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
    await new Promise((r) => setTimeout(r, 400));
  }
  async shot(file) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
    writeFileSync(file, Buffer.from(data, "base64"));
  }
}

/** Set a React-controlled input's value so React sees the change. */
const SET_VALUE = `(sel, value) => {
  const el = document.querySelector(sel);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}`;

const OVERFLOW = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const clipped = [...document.querySelectorAll("body *")]
    .filter((el) => el.getClientRects().length > 0)
    // Screen-reader-only text is 1px, clipped, and cannot scroll the page.
    .filter((el) => !el.closest(".sr-only"))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.right > vw + 0.5 || r.left < -0.5)
    .map(({ el, r }) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className).split(" ").slice(0, 3).join(".") + " left=" + Math.round(r.left) + " right=" + Math.round(r.right))
    .slice(0, 5);
  return { vw, scrollWidth: de.scrollWidth, bodyScrollWidth: document.body.scrollWidth, clipped };
})()`;

const TARGETS = `(() => {
  const sel = 'a[href], button, input, [role="radio"], [role="checkbox"], [role="button"]';
  return [...document.querySelectorAll(sel)]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const r = el.getBoundingClientRect();
      let w = r.width, h = r.height;
      // A ::before hit box extends the target without changing the visible control.
      const before = getComputedStyle(el, "::before");
      if (before.content !== "none" && before.position === "absolute") {
        const px = (v) => parseFloat(v) || 0;
        w = r.width - px(before.left) - px(before.right);
        h = r.height - px(before.top) - px(before.bottom);
      }
      const name = el.getAttribute("aria-label") || el.textContent.trim() || el.name || el.type || el.tagName;
      return { name: name.slice(0, 32), w: Math.round(w), h: Math.round(h) };
    });
})()`;

const COLUMNS = `(() => {
  const form = document.querySelector('[aria-labelledby="task-form-heading"]');
  const list = document.querySelector('[aria-labelledby="task-list-heading"]');
  const main = document.querySelector("main");
  const f = form.getBoundingClientRect(), l = list.getBoundingClientRect(), m = main.getBoundingClientRect();
  return { sideBySide: l.left >= f.right - 1, mainWidth: Math.round(m.width), formWidth: Math.round(f.width), listWidth: Math.round(l.width) };
})()`;

let failures = 0;
function check(ok, label) {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
}

const version = await waitForDevtools();
const browser = await CDP.connect(version.webSocketDebuggerUrl);
const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
// Route page-level commands through the attached session.
const page = new CDP(browser.ws);
page.send = (method, params = {}) => {
  const id = ++browser.id;
  browser.ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => browser.pending.set(id, { resolve, reject }));
};
page.listeners = browser.listeners;
await page.send("Page.enable");
await page.send("Runtime.enable");

try {
  for (const width of VIEWPORTS) {
    console.log(`\n== ${width}px ==`);
    const height = width < 768 ? 640 : 900;
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 1024 });
    // A touch viewport for AC-UI-2: coarse pointer, no hover.
    await page.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "pointer", value: "coarse" },
        { name: "hover", value: "none" },
      ],
    });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });

    await page.goto(`${BASE}/login`);
    await page.eval("sessionStorage.clear(); localStorage.clear(); 0");
    await page.goto(`${BASE}/login`);
    let o = await page.eval(OVERFLOW);
    await page.shot(path.join(OUT, `login-${width}.png`));
    check(o.scrollWidth <= o.vw && o.clipped.length === 0, `/login: scrollWidth ${o.scrollWidth} <= viewport ${o.vw}; clipped: ${o.clipped.join(", ") || "none"}`);
    let t = await page.eval(TARGETS);
    let small = t.filter((x) => x.w < MIN_TARGET || x.h < MIN_TARGET);
    check(small.length === 0, `/login: ${t.length} controls >= ${MIN_TARGET}px` + (small.length ? ` — small: ${small.map((x) => `${x.name} ${x.w}x${x.h}`).join("; ")}` : ""));

    // Log in.
    await page.eval(`(${SET_VALUE})('input[name=username]', 'aritzia'); (${SET_VALUE})('input[name=password]', 'password123'); 0`);
    await page.eval(`document.querySelector('form').requestSubmit(); 0`);
    await new Promise((r) => setTimeout(r, 1200));
    check((await page.eval("location.pathname")) === "/tasks", "logged in and on /tasks");

    // Two tasks: one ordinary, one with a long unbroken title.
    for (const title of ["Buy fabric samples for the fall line", "Averyveryveryverylongunbrokentaskname_thatcouldwidenthepageifitdidnotwrap_0123456789"]) {
      await page.eval(`(${SET_VALUE})('input[name=title]', ${JSON.stringify(title)}); (${SET_VALUE})('input[name=dueDate]', '2020-01-15'); 0`);
      await page.eval(`document.querySelector('[aria-labelledby="task-form-heading"] form').requestSubmit(); 0`);
      await new Promise((r) => setTimeout(r, 800));
    }
    o = await page.eval(OVERFLOW);
    await page.shot(path.join(OUT, `tasks-${width}.png`));
    check(o.scrollWidth <= o.vw && o.clipped.length === 0, `/tasks: scrollWidth ${o.scrollWidth} <= viewport ${o.vw}; clipped: ${o.clipped.join(", ") || "none"}`);
    t = await page.eval(TARGETS);
    small = t.filter((x) => x.w < MIN_TARGET || x.h < MIN_TARGET);
    check(small.length === 0, `/tasks: ${t.length} controls >= ${MIN_TARGET}px` + (small.length ? ` — small: ${small.map((x) => `${x.name} ${x.w}x${x.h}`).join("; ")}` : ""));
    const c = await page.eval(COLUMNS);
    if (width >= 1024) check(c.sideBySide, `/tasks: form and list side by side (main ${c.mainWidth}px: form ${c.formWidth}px | list ${c.listWidth}px)`);
    else check(!c.sideBySide, `/tasks: single column (main ${c.mainWidth}px, form ${c.formWidth}px, list ${c.listWidth}px)`);

    // Clean up the tasks so the next viewport starts empty.
    await page.eval(`(async () => { for (const b of document.querySelectorAll('button[aria-label^="Delete "]')) { b.click(); await new Promise(r => setTimeout(r, 300)); } })()`);
    await new Promise((r) => setTimeout(r, 800));
  }
} finally {
  browser.ws.close();
  chrome.kill();
}

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`} Screenshots in ${OUT}/`);
process.exit(failures === 0 ? 0 : 1);
