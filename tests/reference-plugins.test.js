import * as acmeLlm from "../plugins/acme-llm-provider.js";
import * as acmeBrowser from "../plugins/acme-browser-platform.js";
import * as sampleHealth from "../plugins/sample-healthcheck.js";

import { registerPluginLlmProviders } from "../src/plugin-llm-registry.js";
import { registerPluginBrowserPlatforms } from "../src/plugin-browser-registry.js";
import { MODEL_REGISTRY } from "../src/llm/local-llm.js";
import { PLATFORM_URLS } from "../src/browser-pane.js";

describe("Reference plugins v1", () => {
  it("exports PLUGIN_API_VERSION === 1 and provides expected LLM capability", () => {
    expect(acmeLlm.PLUGIN_API_VERSION).toBe(1);
    const caps = acmeLlm.getCapabilities();
    expect(caps).toHaveProperty("llmProviders");
    const providers = caps.llmProviders;
    expect(Array.isArray(providers)).toBe(true);
    const p = providers.find((x) => x.name === "acme-llm");
    expect(p).toBeDefined();
    expect(p.models).toContain("acme-chat-1");
  });

  it("exports PLUGIN_API_VERSION === 1 and provides expected browser platform", () => {
    expect(acmeBrowser.PLUGIN_API_VERSION).toBe(1);
    const caps = acmeBrowser.getCapabilities();
    expect(caps).toHaveProperty("browserPlatforms");
    const platforms = caps.browserPlatforms;
    const pf = platforms.find((x) => x.name === "acme-search");
    expect(pf).toBeDefined();
    expect(pf.url).toBe("https://search.example.com");
  });

  it("exports PLUGIN_API_VERSION === 1 and provides health check that succeeds", async () => {
    expect(sampleHealth.PLUGIN_API_VERSION).toBe(1);
    const caps = sampleHealth.getCapabilities();
    expect(caps).toHaveProperty("healthChecks");
    const hc = caps.healthChecks.find((h) => h.name === "sample-config-health");
    expect(hc).toBeDefined();
    const res = await hc.run();
    expect(res).toHaveProperty("ok", true);
  });

  it("registers capabilities into registries and updates MODEL_REGISTRY and PLATFORM_URLS", async () => {
    // Snapshot originals to restore later
    const originalModelKeys = new Set(Object.keys(MODEL_REGISTRY));
    const originalPlatformKeys = new Set(Object.keys(PLATFORM_URLS));

    const llmCaps = (acmeLlm.getCapabilities()).llmProviders || [];
    const browserCaps =
      (acmeBrowser.getCapabilities()).browserPlatforms || [];

    registerPluginLlmProviders(llmCaps);
    registerPluginBrowserPlatforms(browserCaps);

    expect(MODEL_REGISTRY).toHaveProperty("acme-llm-acme-chat-1");
    expect(PLATFORM_URLS).toHaveProperty("acme-search");

    // cleanup: remove newly added keys so subsequent tests are unaffected
    for (const k of Object.keys(MODEL_REGISTRY)) {
      if (!originalModelKeys.has(k)) {
        delete MODEL_REGISTRY[k];
      }
    }
    for (const p of Object.keys(PLATFORM_URLS)) {
      if (!originalPlatformKeys.has(p)) {
        delete PLATFORM_URLS[p];
      }
    }
  });
});
