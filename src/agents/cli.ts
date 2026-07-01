#!/usr/bin/env node
import * as path from "node:path";
import * as fs from "node:fs";
import { runOrchestrator } from "./orchestrator";

// ─── Exported helpers (fully testable) ───────────────────────────────────────

/**
 * Parse raw argv (everything after "node <script>") into a structured options
 * object.  Exported so it can be unit-tested without touching process.argv.
 */
export function parseArgs(args: string[]): {
  command: string | undefined;
  filePath: string | undefined;
  workspaceId: string;
} {
  const command = args[0];
  const fileFlag = args.indexOf("--file");
  const filePath = fileFlag === -1 ? undefined : args[fileFlag + 1];
  const wsFlag = args.indexOf("--workspace");
  const workspaceId = wsFlag === -1 ? "harness-cli" : args[wsFlag + 1];
  return { command, filePath, workspaceId };
}

/**
 * Core CLI logic.  Separated from the module-level execution so tests can
 * call this function directly without triggering process.exit at import time.
 *
 * @param args  - argv slice after the interpreter + script (i.e. process.argv.slice(2))
 * @param exit  - injectable exit function (defaults to process.exit)
 */
export async function main(
  args: string[],
  exit: (code: number) => never = (code) => process.exit(code),
): Promise<void> {
  const { command, filePath, workspaceId } = parseArgs(args);

  if (!command) {
    console.error(
      "Usage: node cli.ts <command> --file <path> [--workspace <id>]",
    );
    return exit(1);
  }

  if (command === "code-review" && !filePath) {
    console.error("code-review requires --file <path>");
    return exit(1);
  }

  const input: Record<string, string> = {};
  if (filePath) input.filePath = filePath;

  try {
    const result = await runOrchestrator(command, input, workspaceId);

    if (result.success) {
      console.log("\n✅ Command complete\n");
      console.log(result.finalOutput);

      // Write report
      const reportDir = path.resolve(process.cwd(), "logs");
      fs.mkdirSync(reportDir, { recursive: true });
      const reportPath = path.join(
        reportDir,
        `code-review-${Date.now()}.md`,
      );
      fs.writeFileSync(reportPath, result.finalOutput, "utf-8");
      console.log(`\nReport written to: ${reportPath}`);
    } else {
      console.error(`\n❌ Command failed: ${result.error ?? "Unknown error"}`);
      console.error("\nStep results:");
      result.steps.forEach((s) => {
        const icon = s.success ? "✅" : "❌";
        console.error(
          `  ${icon} Step ${s.stepNumber}: ${s.stepName} (${s.durationMs}ms)`,
        );
        if (s.error) console.error(`     Error: ${s.error}`);
      });
      return exit(1);
    }
  } catch (err) {
    console.error("Harness crashed:", err);
    return exit(1);
  }
}

// ─── Entry point (runs only when executed directly) ───────────────────────────
// `import.meta.url` vs `process.argv[1]` check keeps the module importable
// without side effects under Vitest, ts-node, or any other loader.
/* istanbul ignore next -- entry guard: unreachable when imported by the test runner */
if (process.argv[1] && process.argv[1].endsWith("cli.ts")) {
  await main(process.argv.slice(2));
}
