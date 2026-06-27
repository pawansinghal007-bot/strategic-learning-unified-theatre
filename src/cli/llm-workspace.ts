import { Command } from "commander";
import {
  getWorkspacePolicyOverride,
  setWorkspacePolicyOverride,
  clearWorkspacePolicyOverride,
  listWorkspacePolicyOverrides,
} from "../policies/workspace-policy";
import {
  getWorkspaceContext,
  saveWorkspaceContext,
  clearWorkspaceContext,
} from "../memory/request-context";

const VALID_MODES = new Set(["cloud", "hybrid", "local-only"]);
const VALID_PROVIDERS = new Set([
  "groq",
  "gemini",
  "openai",
  "perplexity",
  "local",
]);

export function registerLlmWorkspace(program: Command) {
  const workspace = program
    .command("llm:workspace")
    .description("Manage workspace policy overrides and context");

  workspace
    .command("policy:get <workspaceId>")
    .description("Get workspace policy override")
    .action((workspaceId) => {
      const override = getWorkspacePolicyOverride(workspaceId);
      if (!override) {
        console.log(`No override found for workspace: ${workspaceId}`);
        return;
      }
      console.log("\nWorkspace Policy Override\n");
      console.log(`workspaceId  ${override.workspaceId}`);
      console.log(`policy       ${JSON.stringify(override.policy, null, 2)}`);
      console.log(`updatedAt    ${new Date(override.updatedAt).toISOString()}`);
      console.log("");
    });

  workspace
    .command("policy:set <workspaceId>")
    .description("Set workspace policy override")
    .option("--mode <mode>", "Routing mode: cloud | hybrid | local-only")
    .option("--provider <provider>", "Manual provider pin")
    .action((workspaceId, opts) => {
      const policy: Record<string, any> = {};
      if (opts.mode) {
        if (!VALID_MODES.has(opts.mode)) {
          console.error(`Unknown routing mode: ${opts.mode}`);
          process.exitCode = 1;
          return;
        }
        policy.routingMode = opts.mode;
      }
      if (opts.provider) {
        if (!VALID_PROVIDERS.has(opts.provider)) {
          console.error(`Unknown provider: ${opts.provider}`);
          process.exitCode = 1;
          return;
        }
        policy.manualProvider = opts.provider;
      }
      if (!Object.keys(policy).length) {
        console.error("Provide at least --mode or --provider");
        process.exitCode = 1;
        return;
      }
      const result = setWorkspacePolicyOverride(workspaceId, policy);
      console.log(`✅ Workspace override set for ${result.workspaceId}`);
      console.log(JSON.stringify(result.policy, null, 2));
    });

  workspace
    .command("policy:clear <workspaceId>")
    .description("Clear workspace policy override")
    .action((workspaceId) => {
      const cleared = clearWorkspacePolicyOverride(workspaceId);
      if (!cleared) {
        console.log(`No override found for workspace: ${workspaceId}`);
        return;
      }
      console.log(`✅ Workspace override cleared for ${workspaceId}`);
    });

  workspace
    .command("policy:list")
    .description("List all workspace policy overrides")
    .action(() => {
      const overrides = listWorkspacePolicyOverrides();
      if (!overrides.length) {
        console.log("No workspace overrides found.");
        return;
      }
      console.log("\nWorkspace Policy Overrides\n");
      for (const o of overrides) {
        console.log(`${o.workspaceId.padEnd(24)} ${JSON.stringify(o.policy)}`);
      }
      console.log("");
    });

  workspace
    .command("context:get <workspaceId>")
    .description("Get workspace context")
    .action((workspaceId) => {
      const context = getWorkspaceContext(workspaceId);
      if (!context) {
        console.log(`No context found for workspace: ${workspaceId}`);
        return;
      }
      console.log("\nWorkspace Context\n");
      console.log(`workspaceId  ${context.workspaceId}`);
      console.log(`summary      ${context.summary}`);
      console.log(`tags         ${context.tags.join(", ") || "none"}`);
      console.log(`lastIntent   ${context.lastIntent || "none"}`);
      console.log(`updatedAt    ${new Date(context.updatedAt).toISOString()}`);
      console.log("");
    });

  workspace
    .command("context:set <workspaceId>")
    .description("Set workspace context")
    .option("--summary <summary>", "Context summary")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--intent <intent>", "Last intent")
    .action((workspaceId, opts) => {
      if (!opts.summary) {
        console.error("--summary is required");
        process.exitCode = 1;
        return;
      }
      const record = saveWorkspaceContext(workspaceId, {
        summary: opts.summary,
        tags: opts.tags
          ? opts.tags.split(",").map((t: string) => t.trim())
          : [],
        lastIntent: opts.intent,
      });
      console.log(`✅ Context saved for ${record.workspaceId}`);
    });

  workspace
    .command("context:clear <workspaceId>")
    .description("Clear workspace context")
    .action((workspaceId) => {
      const cleared = clearWorkspaceContext(workspaceId);
      if (!cleared) {
        console.log(`No context found for workspace: ${workspaceId}`);
        return;
      }
      console.log(`✅ Context cleared for ${workspaceId}`);
    });
}
