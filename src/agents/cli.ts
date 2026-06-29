#!/usr/bin/env node
import * as path from "path";
import * as fs from "fs";
import { runOrchestrator } from "./orchestrator";
import { logger } from "../shared/logging/logger";

// Parse: node cli.ts <command> --file <path> [--workspace <id>]
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error(
    "Usage: node cli.ts <command> --file <path> [--workspace <id>]",
  );
  process.exit(1);
}

const fileFlag = args.indexOf("--file");
const filePath = fileFlag !== -1 ? args[fileFlag + 1] : undefined;
const wsFlag = args.indexOf("--workspace");
const workspaceId = wsFlag !== -1 ? args[wsFlag + 1] : "harness-cli";

if (!filePath && command === "code-review") {
  console.error("code-review requires --file <path>");
  process.exit(1);
}

const input: Record<string, string> = {};
if (filePath) input.filePath = filePath;

async function main() {
  console.log(`\n🔧 Running harness command: ${command}`);
  console.log(`   Input: ${JSON.stringify(input)}\n`);

  const result = await runOrchestrator(command, input, workspaceId);

  if (!result.success) {
    console.error(`\n❌ Command failed: ${result.error ?? "Unknown error"}`);
    console.error("\nStep results:");
    result.steps.forEach((s) => {
      const icon = s.success ? "✅" : "❌";
      console.error(
        `  ${icon} Step ${s.stepNumber}: ${s.stepName} (${s.durationMs}ms)`,
      );
      if (s.error) console.error(`     Error: ${s.error}`);
    });
    process.exit(1);
  }

  console.log("\n✅ Command complete\n");
  console.log(result.finalOutput);

  // Write report
  const reportDir = path.resolve(process.cwd(), "logs");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `code-review-${Date.now()}.md`);
  fs.writeFileSync(reportPath, result.finalOutput, "utf-8");
  console.log(`\nReport written to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Harness crashed:", err);
  process.exit(1);
});
