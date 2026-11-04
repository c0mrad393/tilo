// Writes server/.env from .env.example with fresh secrets: the database password, the JWT
// secret, and the anon and service keys signed with it (HS256, as Supabase expects).
// An existing .env keeps its values (new secrets would lock you out of the database); only
// settings added to .env.example since are appended. --force starts over with new secrets.
// Also writes the app's .env.local with the public anon key, which turns accounts on in dev.
// Usage, from the repository root or server/: node server/scripts/setup-env.mjs [--force]
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(dir, ".env");
const example = readFileSync(join(dir, ".env.example"), "utf8");
const parse = (text) =>
  Object.fromEntries(
    text
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );

const b64url = (b) => Buffer.from(b).toString("base64url");
const jwt = (payload, secret) => {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
};

let env;
if (existsSync(target) && !process.argv.includes("--force")) {
  const current = readFileSync(target, "utf8");
  env = parse(current);
  const missing = example.split("\n").filter((l) => /^[A-Z_]+=/.test(l) && !(l.slice(0, l.indexOf("=")) in env));
  if (missing.length) {
    writeFileSync(target, current.replace(/\n*$/, "\n") + "\n# added from .env.example\n" + missing.join("\n") + "\n");
    Object.assign(env, parse(missing.join("\n")));
    console.log(`Kept server/.env and added ${missing.map((l) => l.split("=")[0]).join(", ")}.`);
  } else console.log("Kept server/.env as it is.");
} else {
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
  const text = example.replace(/^([A-Z_]+)=$/gm, (line, key) => (key in values ? `${key}=${values[key]}` : line));
  writeFileSync(target, text, { mode: 0o600 });
  env = parse(text);
  console.log("Wrote server/.env with new secrets.");
}

// the app reads VITE_* settings from .env.local (git-ignored); the anon key is public anyway
writeFileSync(join(dir, "..", ".env.local"), `# written by server/scripts/setup-env.mjs\nVITE_TILO_ANON_KEY=${env.ANON_KEY}\n`);
console.log("Wrote .env.local for the app.");
