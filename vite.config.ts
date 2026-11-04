import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import pkg from "./package.json";
import { offline } from "./offline";

export default defineConfig({
  plugins: [react(), offline(pkg.version)],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
