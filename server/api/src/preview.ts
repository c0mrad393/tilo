import { Hono } from "hono";
import type { Sql } from "postgres";
import { card, CARD_H, CARD_W } from "./card.ts";

/* /api/og/...: what a link preview reads. The app draws its pages in the browser, so a
   crawler that fetches /piece/{id} or /u/{handle} would see an empty shell; Caddy sends
   crawlers here instead (by user agent), and this answers with a small page that carries
   the Open Graph tags and a plain link to the real page. A piece's picture there is its card
   (card.ts, /api/og/card/{id}.jpg): the piece framed with its title and who made it. */

const SIZES: Record<string, [number, number]> = { land: [800, 600], port: [600, 800], square: [700, 700] };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (min: number) => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface Card {
  url: string;
  title: string;
  description: string;
  image: string;
  size?: [number, number];
  alt: string;
  type: "article" | "profile";
}

const page = (c: Card) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="canonical" href="${esc(c.url)}">
<meta property="og:site_name" content="Tilo">
<meta property="og:type" content="${c.type}">
<meta property="og:url" content="${esc(c.url)}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:image" content="${esc(c.image)}">
${c.size ? `<meta property="og:image:width" content="${c.size[0]}">\n<meta property="og:image:height" content="${c.size[1]}">\n` : ""}<meta property="og:image:alt" content="${esc(c.alt)}">
<meta name="twitter:card" content="${c.size ? "summary_large_image" : "summary"}">
</head>
<body>
<h1>${esc(c.title)}</h1>
<p>${esc(c.description)}</p>
<p><a href="${esc(c.url)}">Open it on Tilo</a></p>
</body>
</html>
`;

export function preview(sql: Sql, { publicUrl, filesDir }: { publicUrl: string; filesDir: string }) {
  const app = new Hono();
  const site = publicUrl.replace(/\/$/, "");
  const html = (body: string, status: 200 | 404 = 200) =>
    new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
  const missing = () =>
    html(page({ url: site, title: "Tilo", description: "A free browser studio for hand-made digital art.", image: `${site}/icon-512.png`, alt: "Tilo", type: "article" }), 404);

  const live = (id: string) => sql`
    select p.id, p.title, p.shape, p.strokes, p.minutes, p.picture, p.remix_of, p.ai, p.proof, p.subject, pr.handle, pr.name
    from public.pieces p join public.profiles pr on pr.id = p.owner
    where p.id = ${id} and p.status = 'live'`;

  app.get("/piece/:id", async (c) => {
    const [p] = await live(c.req.param("id"));
    if (!p) return missing();
    const who = p.name ? `${p.name} (@${p.handle})` : `@${p.handle}`;
    // an AI piece never reads as drawn by hand, here or anywhere
    const description = p.ai
      ? `An AI-made sample: Claude, an AI, drew it in code, ${p.strokes.toLocaleString("en")} strokes with Tilo's own tools. Replay it, then beat it by hand.`
      : `${p.proof ? "Drawn by hand" : "Recorded"} on Tilo by ${who}: ${p.strokes.toLocaleString("en")} strokes in ${clock(p.minutes)}${p.remix_of ? ", as a remix" : ""}. Replay it from the first stroke.`;
    return html(
      page({
        url: `${site}/piece/${p.id}`,
        title: p.ai ? `${p.title} (AI-made sample) on Tilo` : `${p.title} by @${p.handle}`,
        description,
        image: `${site}/api/og/card/${p.id}.jpg`,
        size: [CARD_W, CARD_H],
        alt: p.ai ? `${p.title}, an AI-made sample on Tilo` : `${p.title}, drawn by @${p.handle}`,
        type: "article",
      }),
    );
  });

  // the card itself, for previews and for the share sheet in the app
  app.get("/card/:file{[a-z0-9]+\\.jpg}", async (c) => {
    const [p] = await live(c.req.param("file").replace(/\.jpg$/, ""));
    if (!p) return c.body(null, 404);
    const jpg = await card(filesDir, { id: p.id, title: p.title, handle: p.handle, strokes: p.strokes, minutes: p.minutes, ai: p.ai, proof: p.proof, subject: p.subject, picture: p.picture });
    return c.body(new Uint8Array(jpg), 200, { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" });
  });

  app.get("/u/:handle", async (c) => {
    const [m] = await sql`
      select pr.handle, pr.name, pr.bio,
        (select count(*)::int from public.pieces where owner = pr.id and status = 'live') as pieces,
        (select row(id, picture, shape)::text from public.pieces where owner = pr.id and status = 'live' order by created desc limit 1) as latest
      from public.profiles pr where pr.handle = lower(${c.req.param("handle")})`;
    if (!m) return missing();
    // the latest piece stands in for an avatar until avatars are drawn
    const [id, ext, shape] = m.latest ? String(m.latest).slice(1, -1).split(",") : [];
    return html(
      page({
        url: `${site}/u/${m.handle}`,
        title: m.name ? `${m.name} (@${m.handle}) on Tilo` : `@${m.handle} on Tilo`,
        description: m.bio || `${m.pieces} piece${m.pieces === 1 ? "" : "s"} drawn by hand on Tilo.`,
        image: id ? `${site}/files/img/${id}.${ext}` : `${site}/icon-512.png`,
        size: id ? (SIZES[shape] ?? SIZES.land) : undefined,
        alt: id ? `The latest piece by @${m.handle}` : "Tilo",
        type: "profile",
      }),
    );
  });

  return app;
}
