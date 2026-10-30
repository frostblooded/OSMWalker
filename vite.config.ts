import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";
import type { Plugin } from "vite";

/**
 * The app's stylesheet doesn't block the first paint: the inline boot screen in
 * index.html shows as soon as the HTML arrives, and main.tsx waits for the
 * stylesheet before drawing the game, so nothing shows unstyled.
 */
const lazyCss = (): Plugin => ({
  name: "lazy-css",
  apply: "build",
  transformIndexHtml: {
    order: "post",
    handler: (html) => html.replace(/<link rel="stylesheet"([^>]*)>/g, `<link rel="stylesheet"$1 media="print" onload="this.media='all'">`),
  },
});

/** Changes with the Help text, so its address does too and no cache serves an old Help after a deploy. */
const helpVersion = createHash("sha1").update(readFileSync("public/data/help.txt")).digest("hex").slice(0, 8);

// Relative base: GitHub Pages serves the game from /OSMWalker/.
export default defineConfig({
  base: "./",
  define: { __HELP_VERSION__: JSON.stringify(helpVersion) },
  plugins: [preact(), lazyCss()],
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
