// Writes server/.env from .env.example with fresh secrets: the database password, the JWT
// secret, and the anon and service keys signed with it (HS256, as Supabase expects).
// Refuses to replace an existing .env, since that would lock you out of the database.
// Usage, from the repository root or server/: node server/scripts/setup-env.mjs [--force]
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(dir, ".env");
if (existsSync(target) && !process.argv.includes("--force")) {
  console.error("server/.env already exists. Pass --force to replace it (the database volume then needs resetting).");
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64url");
const jwt = (payload, secret) => {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};

const secret = randomBytes(48).toString("base64url");
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 10 * 365 * 24 * 3600;
const values = {
  // letters and digits only, so it can sit in a postgres:// URL unescaped
  POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
  JWT_SECRET: secret,
  ANON_KEY: jwt({ role: "anon", iss: "supabase", iat, exp }, secret),
  SERVICE_ROLE_KEY: jwt({ role: "service_role", iss: "supabase", iat, exp }, secret),
};

const text = readFileSync(join(dir, ".env.example"), "utf8").replace(/^([A-Z_]+)=$/gm, (line, key) =>
  key in values ? `${key}=${values[key]}` : line,
);
writeFileSync(target, text, { mode: 0o600 });
console.log("Wrote server/.env with new secrets.");
