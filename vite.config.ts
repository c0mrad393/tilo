import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
import { offline } from "./offline";

// the local server stack (server/, Caddy on :8000), reached through the dev server so the
// app sees one origin, as it will in production
const SERVER = "http://localhost:8000";
const proxy = Object.fromEntries(["/auth/v1", "/rest/v1", "/api", "/files"].map((path) => [path, SERVER]));

export default defineConfig({
  plugins: [react(), offline(pkg.version)],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { proxy },
  preview: { proxy },
});
