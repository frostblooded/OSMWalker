import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// Relative base: GitHub Pages serves the game from /OSMWalker/.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: {
    target: "es2022",
    rolldownOptions: {
      // The service worker must keep a fixed name next to index.html.
      input: { index: "index.html", sw: "src/sw/sw.ts" },
      output: { entryFileNames: (c) => (c.name === "sw" ? "sw.js" : "assets/[name]-[hash].js") },
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
  },
});
