import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

// Relative base: GitHub Pages serves the game from /OSMWalker/.
export default defineConfig({
  base: "./",
  plugins: [preact()],
  build: {
    target: "es2022",
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/integration/**/*.test.ts", "tests/integration/**/*.test.tsx"],
  },
});
