import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 10000,
    include: ["tests/**/*.test.js"]
  }
});
