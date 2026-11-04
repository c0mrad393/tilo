import type { Plugin } from "vite";

/* Writes sw.js at build time: a service worker that keeps the built app on the device, so
   Tilo opens and draws offline. Sheets already live in IndexedDB, so the app files are all
   that is missing. Pages are fetched fresh when there is a network, so a new version shows
   at once; files are named by their content, so a cached one is never stale.
   Fonts come in many alphabets; only Latin is kept up front, the rest as they are used. */
export function offline(version: string): Plugin {
  return {
    name: "tilo-offline",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      const font = (f: string) => /\.(woff2?|ttf)$/.test(f);
      const built = Object.keys(bundle).filter((f) => f.startsWith("assets/") && !f.endsWith(".map") && (!font(f) || (f.endsWith(".woff2") && /-latin-(?!ext)/.test(f))));
      const files = ["/", "/favicon.svg", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", ...built.map((f) => "/" + f)];
      let h = 0;
      for (const c of files.join()) h = (h * 31 + c.charCodeAt(0)) | 0;
      const cache = `tilo-${version}-${(h >>> 0).toString(36)}`;
      this.emitFile({ type: "asset", fileName: "sw.js", source: worker(cache, files) });
    },
  };
}

const worker = (cache: string, files: string[]) => `/* Tilo's service worker, written by the build (offline.ts). */
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(files)};
// a module script asks with an Origin header and the server may answer "Vary: Origin";
// these are Tilo's own files, so the stored copy fits any request for them
const MATCH = { ignoreVary: true };

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("tilo-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// the network, but no longer than a few seconds when the cache has an answer
const fresh = (req, wait) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => caches.match("/", MATCH).then((hit) => hit && resolve(hit)), wait);
    fetch(req).then((res) => { clearTimeout(t); resolve(res); }, (err) => { clearTimeout(t); reject(err); });
  });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    // every address is the same app page; keep the newest copy of it
    e.respondWith(
      fresh(req, 4000)
        .then((res) => {
          if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/", MATCH)),
    );
    return;
  }
  e.respondWith(
    caches.match(req, MATCH).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && url.pathname.startsWith("/assets/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
