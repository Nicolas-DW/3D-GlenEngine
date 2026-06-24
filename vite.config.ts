import { defineConfig } from "vite";

// Aucune dépendance runtime : Vite ne sert qu'au dev server et au bundling.
export default defineConfig({
  server: { open: true },
  build: { target: "es2020" },
});
