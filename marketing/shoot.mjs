// Phone screenshots of tiloart.com for the social videos, through Chrome's DevTools protocol:
// headless Chrome won't make a window narrower than 500px, so the phone size is emulated.
// Usage: node marketing/shoot.mjs   (writes marketing/shots/*.png at 1170 x 2532)
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = process.env.SITE ?? "https://tiloart.com";
const SHOTS = [
  ["home", "/", 0],
  ["studio", "/studio?remix=tilonightlamp", 0],
  ["piece", "/piece/tilooldtown", 0],
  ["piece-ai", "/piece/tilooldtown", 820],
  ["gallery", "/gallery", 0],
  ["beat", "/#beat", 0],
];
const out = join(import.meta.dirname, "shots");
mkdirSync(out, { recursive: true });

const port = 9333;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "tilo-shoot-"))}`, "about:blank"], { stdio: "ignore" });
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
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true });
// no entrance animations: every page as it looks once it has settled
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });

for (const [name, path, scroll] of SHOTS) {
  await send("Page.navigate", { url: SITE + path });
  await wait(5000);
  if (scroll) await send("Runtime.evaluate", { expression: `scrollTo(0, ${scroll})` });
  await wait(800);
  const { result } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(out, `${name}.png`), Buffer.from(result.data, "base64"));
  console.log("shot", name);
}
ws.close();
chrome.kill();
