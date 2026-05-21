import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    timeout: 10000,
    include: ["tests/**/*.test.js", "src/**/*.test.js", "electron-ui/**/*.test.js", "renderer/**/*.test.js", "e2e/**/*.test.js", "e2e/**/*.e2e.js"]
  }
});
