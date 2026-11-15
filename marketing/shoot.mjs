// Phone screenshots of tiloart.com for the social videos, through Chrome's DevTools protocol:
// headless Chrome won't make a window narrower than 500px, so the phone size is emulated.
// Usage: node marketing/shoot.mjs [schools]   (writes marketing/shots/*.png at 1170 x 2532)
//   no argument: the intro video's shots; `schools`: the schools video's, from the /demo school
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = process.env.SITE ?? "https://tiloart.com";
/** a script that taps the buttons with these names (text or aria-label), one after another */
const tap = (...names) => `(async () => { for (const n of ${JSON.stringify(names)}) {
  const b = [...document.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") ?? b.textContent).trim().startsWith(n) || b.textContent.trim().endsWith(n));
  if (!b) throw new Error("no button " + n);
  b.click(); await new Promise((r) => setTimeout(r, 700)); } })()`;
// [name, path (null: stay on the page), scroll, script to run first, tall]
// tall: the page down to `tall` CSS pixels in one image, for scrolling inside the phone
const SETS = {
  intro: [
    ["home", "/", 0],
    ["studio", "/studio?remix=tilonightlamp", 0],
    ["piece", "/piece/tilooldtown", 0],
    ["piece-ai", "/piece/tilooldtown", 820],
    ["gallery", "/gallery", 0],
    ["beat", "/#beat", 0],
  ],
  // a pupil of 3B signs in with pictures (two of three tapped), sees their page; then a show
  schools: [
    ["school-pics", "/demo/class", 0, tap("3B Art", "Nino B.", "house", "fish")],
    ["school-home", null, 0, tap("cat")],
    ["school-show", "/demo/show/our-houses", 0],
  ],
};
// the site tour: real screens, signed out, as a visitor from a video sees them
SETS.tour = [
  ["tour-home", "/", 0, null, 2400],
  ["tour-studio", "/studio?new", 0],
  ["tour-pixel", "/studio?new&kind=pixel", 0],
  ["tour-piece", "/piece/tilooldtown", 0, null, 1700],
  ["tour-gallery", "/gallery", 0, null, 2600],
  ["tour-wall", "/wall", 0],
];
/** a script that types into fields as a person would (React sees the change), and ticks boxes */
const fill = (pairs) => `(async () => { for (const [sel, v] of ${JSON.stringify(pairs)}) {
  const el = document.querySelector(sel); if (!el) throw new Error("no field " + sel);
  if (v === true) { if (!el.checked) el.click(); continue; }
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); await new Promise((r) => setTimeout(r, 300)); } })()`;
// the sign-up video, from a local server (SITE=http://localhost:4640), so nothing is sent to the
// real site: join1 up to the sign-in email; join2 after it, with LINK the sign-in link Mailpit caught
const CODE = "TILO-ABCD-2345";
SETS.join1 = [
  ["join-form", "/join", 330, fill([["input[type=email]", "you@example.com"], ["input[placeholder^=Ink]", "Ink sketches and pixel art"]])],
  ["join-done", null, 380, tap("Put me on the list")],
  ["invite-mail", `file://${join(import.meta.dirname, "shots", "invite-mail.html")}`, 0],
  ["signin-form", `/account?invite=${CODE}`, 0, fill([["input[type=email]", "you@example.com"]])],
  ["signin-sent", null, 0, tap("Email me a link")],
];
SETS.join2 = [
  // the invite link's code waits on this device, as it would after the email's button
  ["handle-prep", `/account?invite=${CODE}`, 0],
  ["handle-form", process.env.LINK, 170, fill([["input[autocomplete=username]", "mariam_draws"], ["input[autocomplete=name]", "Mariam"], ["input[type=checkbox]", true]])],
];
// the launch video, sign-up open (local server, invites_required false): launch1 up to the
// sign-in email; launch2 after it, with LINK the sign-in link Mailpit caught
SETS.launch1 = [
  ["open-join", "/join", 0],
  ["open-signin", "/account", 0, fill([["input[type=email]", "you@example.com"]])],
  ["open-sent", null, 0, tap("Email me a link")],
  ["signin-mail", `file://${join(import.meta.dirname, "shots", "signin-mail.html")}`, 0],
];
SETS.launch2 = [
  ["open-handle", process.env.LINK, 170, fill([["input[autocomplete=username]", "mariam_draws"], ["input[autocomplete=name]", "Mariam"], ["input[type=checkbox]", true]])],
];
// `node marketing/shoot.mjs one /path` shoots one page as it is, to see what a set will meet
SETS.one = [["one", process.argv[3] ?? "/", 0]];
const SHOTS = SETS[process.argv[2] ?? "intro"];
const out = join(import.meta.dirname, "shots");
mkdirSync(out, { recursive: true });

const port = 9333;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "tilo-shoot-"))}`, "about:blank"], { stdio: "ignore" });
// a set that throws must not leave Chrome running: the next run would reuse it, signed in
process.on("exit", () => chrome.kill());
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
  await wait(200);
  target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => undefined);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m), pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

await send("Page.enable");
// a shoot isn't a visit: the admin panel's counts stay real people's
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*/api/visit*"] });
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
// no entrance animations, and the light theme whatever this Mac is set to
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: "light" }] });

const boxes = {};
for (const [name, path, scroll, script, tall] of SHOTS) {
  if (path) {
    await send("Page.navigate", { url: /^(https?|file):/.test(path) ? path : SITE + path });
    await wait(5000);
  }
  if (script) {
    const r = await send("Runtime.evaluate", { expression: script, awaitPromise: true });
    if (r.result?.exceptionDetails) throw new Error(`${name}: ${r.result.exceptionDetails.exception?.description}`);
    await wait(2500);
  }
  if (scroll) await send("Runtime.evaluate", { expression: `scrollTo(0, ${scroll})` });
  await wait(800);
  // a tall page draws its pictures as they scroll into view: go down it once first
  if (tall) {
    for (let y = 0; y <= tall; y += 400) {
      await send("Runtime.evaluate", { expression: `scrollTo(0, ${y})` });
      await wait(450);
    }
    await send("Runtime.evaluate", { expression: "scrollTo(0, 0)" });
    await wait(1500);
  }
  // where the canvases sit, so a video can play a replay on top of the screenshot
  const r = await send("Runtime.evaluate", { expression: `JSON.stringify([...document.querySelectorAll("canvas")].map((c) => { const b = c.getBoundingClientRect(); return [b.x, b.y + scrollY, b.width, b.height]; }).filter(([, , w, h]) => w > 100 && h > 60))`, returnByValue: true });
  const els = await send("Runtime.evaluate", { expression: `JSON.stringify([...document.querySelectorAll("button, a, label, input")].map((e) => { const b = e.getBoundingClientRect(); return [(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40), b.x, b.y + scrollY, b.width, b.height]; }).filter(([t, , , w, h]) => t && w > 0 && h > 0))`, returnByValue: true });
  // how far the page is scrolled in the picture: the boxes are in page pixels
  const sy = await send("Runtime.evaluate", { expression: "scrollY", returnByValue: true });
  boxes[name] = { scrollY: sy.result?.result?.value ?? 0, canvases: JSON.parse(r.result?.result?.value ?? "[]"), els: JSON.parse(els.result?.result?.value ?? "[]") };
  const { result } = await send("Page.captureScreenshot", tall ? { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: tall, scale: 1 } } : { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(result.data, "base64"));
  console.log("shot", name);
}
writeFileSync(join(out, `${process.argv[2] ?? "intro"}-boxes.json`), JSON.stringify(boxes, null, 1));
ws.close();
chrome.kill();
