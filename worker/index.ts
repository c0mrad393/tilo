/* The edge. Cloudflare serves the built app (dist/) itself, so the studio keeps working when
   the server is down; this Worker sends what only the server can answer to it, through the
   tunnel, on the same origin: Auth, PostgREST, tilo-api, the files of published pieces, and
   link previews for crawlers.
   ORIGIN (the tunnel's address) and EDGE_SECRET are set in the Worker's dashboard settings;
   until ORIGIN is set, everything is the app, as before accounts. */

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ORIGIN?: string;
  EDGE_SECRET?: string;
}

const SERVER = /^\/(?:api|auth\/v1|rest\/v1|files)\//;
// the same crawlers Caddy hands to /api/og (server/Caddyfile, @preview)
const PREVIEW = /^\/(?:piece|u)\//;
const CRAWLER =
  /(bot|crawler|spider|preview|facebookexternalhit|meta-externalagent|whatsapp|telegram|slack|discord|skype|embedly|iframely|pinterest|vkshare|mastodon|bluesky|signal)/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const toServer = SERVER.test(url.pathname) || (PREVIEW.test(url.pathname) && CRAWLER.test(request.headers.get("user-agent") ?? ""));
    if (!toServer || !env.ORIGIN) return env.ASSETS.fetch(request);

    const headers = new Headers(request.headers);
    // who is asking, for rate limits; the server only believes it alongside the secret
    headers.set("x-tilo-client-ip", request.headers.get("cf-connecting-ip") ?? "");
    headers.set("x-tilo-edge", env.EDGE_SECRET ?? "");
    // the visitor's country, two letters, for the admin panel's visit counts (visits.ts)
    headers.set("x-tilo-country", (request as Request & { cf?: { country?: string } }).cf?.country ?? "");
    headers.set("x-forwarded-host", url.host);
    headers.set("x-forwarded-proto", "https");
    // Caddy would pick zstd, which the Worker runtime passes on without decoding
    headers.set("accept-encoding", "gzip");
    const target = new URL(url.pathname + url.search, env.ORIGIN);
    try {
      // redirects (Auth's, after a sign-in link) go back to the browser as they are
      return await fetch(target, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
        redirect: "manual",
      });
    } catch {
      return Response.json({ error: "Tilo's server can't be reached just now. Your sheets are safe on this device." }, { status: 503 });
    }
  },
};
