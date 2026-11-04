import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import postgres from "postgres";
import { account } from "./account.ts";
import { type AuthEnv, signedIn } from "./auth.ts";
import { pieces } from "./pieces.ts";
import { preview } from "./preview.ts";
import { FORMAT, MAX_BYTES, summarise } from "./recording.ts";

/* tilo-api: the part of the server that has to read what members send before it is stored.
   Simple writes (stamps, follows, reports) go straight to Postgres through PostgREST.
   Caddy forwards /api/* here; the database is only reachable on the compose network. */

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const sql = postgres(env("DATABASE_URL"), { max: 5, idle_timeout: 30 });
const member = signedIn(env("JWT_SECRET"));

const app = new Hono<AuthEnv>().basePath("/api");

app.get("/health", async (c) => {
  await sql`select 1`;
  return c.json({ ok: true, format: FORMAT });
});

app.route(
  "/me",
  account(sql, { member, filesDir: env("FILES_DIR"), authUrl: env("AUTH_URL"), serviceKey: env("SERVICE_ROLE_KEY") }),
);

// link previews; Caddy sends crawlers asking for /piece/{id} and /u/{handle} here
app.route("/og", preview(sql, { publicUrl: env("PUBLIC_URL") }));

app.route("/pieces", pieces(sql, { member, filesDir: env("FILES_DIR"), perDay: Number(process.env.PUBLISH_PER_DAY ?? 20) }));

// reads a recording and says what is in it
app.post(
  "/check",
  member,
  bodyLimit({ maxSize: MAX_BYTES, onError: (c) => c.json({ error: "A recording can be 2 MB at most." }, 413) }),
  async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    try {
      return c.json(summarise(bytes));
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Not a Tilo recording" }, 422);
    }
  },
);

app.notFound((c) => c.json({ error: "No such endpoint." }, 404));
app.onError((e, c) => {
  console.error(e);
  return c.json({ error: "The server hit a fault." }, 500);
});

const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 8787) }, (info) =>
  console.log(`tilo-api on :${info.port}`),
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
    void sql.end({ timeout: 5 }).then(() => process.exit(0));
  });
}
