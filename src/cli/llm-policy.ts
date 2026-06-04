import { Command } from "commander";
import {
  allowProvider,
  applyPolicyPreset,
  blockProvider,
  getProviderPolicy,
  resetProviderPolicy,
  setManualProvider,
  setRoutingMode,
} from "../policies/provider-policy";
import {
  isPolicyPresetName,
  listPolicyPresets,
} from "../policies/policy-presets";

const VALID_PROVIDERS = ["groq", "gemini", "openai", "perplexity", "local"];
const VALID_MODES = ["cloud", "hybrid", "local-only"];

export function registerLlmPolicy(program) {
  program
    .command("llm:policy")
    .description("Show current provider policy")
    .action(() => {
      const policy = getProviderPolicy();
      console.log("\nProvider Policy\n");
      console.log(`preset          ${policy.activePreset || "none"}`);
      console.log(`mode            ${policy.routingMode}`);
      console.log(`manualProvider  ${policy.manualProvider || "none"}`);
      console.log(`allowed         ${policy.allowedProviders.join(", ")}`);
      console.log(
        `blocked         ${policy.blockedProviders.join(", ") || "none"}`,
      );
      console.log(
        `updatedAt       ${new Date(policy.updatedAt).toISOString()}`,
      );
      console.log("");
    });

  program
    .command("llm:policy:presets")
    .description("List available policy presets")
    .action(() => {
      const presets = listPolicyPresets();
      console.log("\nPolicy Presets\n");
      for (const preset of presets) {
        console.log(`${preset.name.padEnd(12)} ${preset.description}`);
      }
      console.log("");
    });

  program
    .command("llm:policy:preset <name>")
    .description("Apply a policy preset")
    .action((name) => {
      if (!isPolicyPresetName(name)) {
        console.error(`Unknown policy preset: ${name}`);
        process.exitCode = 1;
        return;
      }
      const policy = applyPolicyPreset(name);
      console.log(`✅ Applied preset ${policy.activePreset}`);
    });

  program
    .command("llm:policy:mode <mode>")
    .description("Set routing mode: cloud | hybrid | local-only")
    .action((mode) => {
      if (!VALID_MODES.includes(mode)) {
        console.error(`Unknown routing mode: ${mode}`);
        process.exitCode = 1;
        return;
      }
      const policy = setRoutingMode(mode);
      console.log(`✅ Routing mode set to ${policy.routingMode}`);
    });

  program
    .command("llm:policy:allow <provider>")
    .description("Allow a provider")
    .action((provider) => {
      if (!VALID_PROVIDERS.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }
      const policy = allowProvider(provider);
      console.log(`✅ Allowed ${provider}`);
      console.log(`Allowed providers: ${policy.allowedProviders.join(", ")}`);
    });

  program
    .command("llm:policy:block <provider>")
    .description("Block a provider")
    .action((provider) => {
      if (!VALID_PROVIDERS.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }
      const policy = blockProvider(provider);
      console.log(`✅ Blocked ${provider}`);
      console.log(`Blocked providers: ${policy.blockedProviders.join(", ")}`);
    });

  program
    .command("llm:policy:pin [provider]")
    .description("Pin a manual provider, or clear with no argument")
    .action((provider) => {
      if (provider && !VALID_PROVIDERS.includes(provider)) {
        console.error(`Unknown provider: ${provider}`);
        process.exitCode = 1;
        return;
      }
      const policy = setManualProvider(provider ?? null);
      console.log(
        `✅ Manual provider set to ${policy.manualProvider || "none"}`,
      );
    });

  program
    .command("llm:policy:reset")
    .description("Reset provider policy to defaults")
    .action(() => {
      const policy = resetProviderPolicy();
      console.log(`✅ Provider policy reset to ${policy.routingMode}`);
    });
}
