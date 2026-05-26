import * as acmeLlm from "../plugins/acme-llm-provider.js";
import * as acmeBrowser from "../plugins/acme-browser-platform.js";
import * as sampleHealth from "../plugins/sample-healthcheck.js";

import { registerPluginLlmProviders } from "../src/plugin-llm-registry.js";
import { registerPluginBrowserPlatforms } from "../src/plugin-browser-registry.js";
import { MODEL_REGISTRY } from "../src/local-llm.js";
import { PLATFORM_URLS } from "../src/browser-pane.js";

describe("Reference plugins v1", () => {
  it("exports PLUGIN_API_VERSION === 1 and provides expected LLM capability", async () => {
    expect(acmeLlm.PLUGIN_API_VERSION).toBe(1);
    const caps = await acmeLlm.getCapabilities();
    expect(caps).toHaveProperty("llmProviders");
    const providers = caps.llmProviders;
    expect(Array.isArray(providers)).toBe(true);
    const p = providers.find((x) => x.name === "acme-llm");
    expect(p).toBeDefined();
    expect(p.models).toContain("acme-chat-1");
  });

  it("exports PLUGIN_API_VERSION === 1 and provides expected browser platform", async () => {
    expect(acmeBrowser.PLUGIN_API_VERSION).toBe(1);
    const caps = await acmeBrowser.getCapabilities();
    expect(caps).toHaveProperty("browserPlatforms");
    const platforms = caps.browserPlatforms;
    const pf = platforms.find((x) => x.name === "acme-search");
    expect(pf).toBeDefined();
    expect(pf.url).toBe("https://search.example.com");
  });

  it("exports PLUGIN_API_VERSION === 1 and provides health check that succeeds", async () => {
    expect(sampleHealth.PLUGIN_API_VERSION).toBe(1);
    const caps = await sampleHealth.getCapabilities();
    expect(caps).toHaveProperty("healthChecks");
    const hc = caps.healthChecks.find((h) => h.name === "sample-config-health");
    expect(hc).toBeDefined();
    const res = await hc.run();
    expect(res).toHaveProperty("ok", true);
  });

  it("registers capabilities into registries and updates MODEL_REGISTRY and PLATFORM_URLS", async () => {
    // Snapshot originals to restore later
    const originalModelKeys = Object.keys(MODEL_REGISTRY).slice();
    const originalPlatformKeys = Object.keys(PLATFORM_URLS).slice();

    const llmCaps = (await acmeLlm.getCapabilities()).llmProviders || [];
    const browserCaps = (await acmeBrowser.getCapabilities()).browserPlatforms || [];

    registerPluginLlmProviders(llmCaps);
    registerPluginBrowserPlatforms(browserCaps);

    expect(MODEL_REGISTRY).toHaveProperty("acme-llm-acme-chat-1");
    expect(PLATFORM_URLS).toHaveProperty("acme-search");

    // cleanup: remove newly added keys so subsequent tests are unaffected
    for (const k of Object.keys(MODEL_REGISTRY)) {
      if (!originalModelKeys.includes(k)) {
        delete MODEL_REGISTRY[k];
      }
    }
    for (const p of Object.keys(PLATFORM_URLS)) {
      if (!originalPlatformKeys.includes(p)) {
        delete PLATFORM_URLS[p];
      }
    }
  });
});
