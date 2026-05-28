import { describe, it, expect } from "vitest";
import {
  assertPluginApiCompatible,
  PLUGIN_API_VERSION,
} from "../src/plugin-api.js";

describe("assertPluginApiCompatible", () => {
  it("throws on missing PLUGIN_API_VERSION", () => {
    const plugin = {};
    expect(() => assertPluginApiCompatible(plugin, "missing-plugin")).toThrow(
      /missing/i,
    );
    expect(() => assertPluginApiCompatible(plugin, "missing-plugin")).toThrow(
      /missing-plugin/,
    );
  });

  it("throws on wrong version number", () => {
    const plugin = { PLUGIN_API_VERSION: PLUGIN_API_VERSION + 1 };
    expect(() => assertPluginApiCompatible(plugin, "wrong-version")).toThrow(
      /mismatch/i,
    );
    expect(() => assertPluginApiCompatible(plugin, "wrong-version")).toThrow(
      /wrong-version/,
    );
  });

  it("passes silently on correct version", () => {
    const plugin = { PLUGIN_API_VERSION: PLUGIN_API_VERSION };
    expect(() => assertPluginApiCompatible(plugin, "ok-plugin")).not.toThrow();
  });
});
