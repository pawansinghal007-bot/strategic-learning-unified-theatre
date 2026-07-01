/**
 * llm-index.test.ts
 *
 * Provides coverage for src/llm/index.ts (currently 0%).
 * index.ts is a barrel file: `export * from "./gateway"; export * from "./providers";`
 *
 * Coverage strategy: import index.ts directly (both the .ts path and the .js
 * extension alias) to ensure the v8 coverage provider instruments the barrel lines.
 * The test then verifies that re-exported symbols are identical to the originals.
 */

import { describe, it, expect } from "vitest";

// Primary import — the path that maps to src/llm/index.ts
// Use both possible resolution paths so the instrumentor definitely tracks the file.
import * as indexExports from "../../src/llm/index.js";

// Import the originating modules directly to verify identity
import * as gatewayExports from "../../src/llm/gateway.js";
import * as providersExports from "../../src/llm/providers/index.js";

describe("src/llm/index.ts — barrel re-exports", () => {
  it("re-exports Gateway from gateway.ts", () => {
    expect(indexExports.Gateway).toBe(gatewayExports.Gateway);
  });

  it("re-exports gateway singleton proxy", () => {
    expect(indexExports.gateway).toBeDefined();
  });

  it("re-exports applyWorkspaceQuotaEnforcement from gateway.ts", () => {
    expect(indexExports.applyWorkspaceQuotaEnforcement).toBe(
      gatewayExports.applyWorkspaceQuotaEnforcement,
    );
  });

  it("re-exports enforceWorkspaceQuotaOrThrow from gateway.ts", () => {
    expect(indexExports.enforceWorkspaceQuotaOrThrow).toBe(
      gatewayExports.enforceWorkspaceQuotaOrThrow,
    );
  });

  it("re-exports LocalProviderAdapter from providers", () => {
    expect(indexExports.LocalProviderAdapter).toBeDefined();
    expect(indexExports.LocalProviderAdapter).toBe(
      providersExports.LocalProviderAdapter,
    );
  });

  it("index exports are a superset of gateway exports", () => {
    for (const key of Object.keys(gatewayExports)) {
      expect(key in indexExports).toBe(true);
    }
  });

  it("index exports are a superset of providers exports", () => {
    for (const key of Object.keys(providersExports)) {
      expect(key in indexExports).toBe(true);
    }
  });

  it("index exports all named gateway symbols", () => {
    // Explicitly enumerate known gateway exports to ensure each line of index.ts
    // is triggered — the barrel's two export lines are the only lines in the file.
    const knownGatewayKeys = [
      "Gateway",
      "gateway",
      "applyWorkspaceQuotaEnforcement",
      "enforceWorkspaceQuotaOrThrow",
    ];
    for (const key of knownGatewayKeys) {
      expect(indexExports).toHaveProperty(key);
    }
  });

  it("index exports all named provider symbols", () => {
    const knownProviderKeys = [
      "LocalProviderAdapter",
    ];
    for (const key of knownProviderKeys) {
      expect(indexExports).toHaveProperty(key);
    }
  });

  it("index module is a non-empty object with all expected exports", () => {
    expect(typeof indexExports).toBe("object");
    expect(Object.keys(indexExports).length).toBeGreaterThan(0);
  });
});
