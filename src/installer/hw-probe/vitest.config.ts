import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["**/*.spec.ts", "**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    environment: "node",
  },
});
