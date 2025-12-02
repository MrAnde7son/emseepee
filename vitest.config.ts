import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["tests/dashboard/**", "jsdom"]],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "tests/",
        "*.config.ts",
        "*.config.js",
      ],
    },
  },
  esbuild: {
    target: "node18",
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "dashboard/src"),
      "next/navigation": path.resolve(__dirname, "tests/mocks/nextNavigation.ts"),
    },
  },
});

