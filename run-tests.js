import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const ALLOWLIST = ["npm", "pnpm", "yarn", "node", "npx", "vitest"];

function validateBinary(bin) {
  if (!ALLOWLIST.includes(bin)) {
    throw new Error(
      `Invalid test runner binary: ${bin}. Allowed: ${ALLOWLIST.join(", ")}`,
    );
  }
}

const tests = readdirSync("tests").filter((f) => f.endsWith(".test.js"));

// Allow optional override via env or first CLI arg, but validate it.
const overrideBin = process.env.TEST_RUNNER_BIN || process.argv[2];
const binary = overrideBin ? String(overrideBin) : "npx";
validateBinary(binary);

function buildArgsFor(binary, testFile) {
  const filePath = path.join("tests", testFile);

  switch (binary) {
    case "npx":
    case "yarn":
      return ["vitest", "run", filePath, "--maxWorkers", "1"];
    case "npm":
    case "pnpm":
      return ["exec", "vitest", "--", "run", filePath, "--maxWorkers", "1"];
    case "vitest":
      return ["run", filePath, "--maxWorkers", "1"];
    case "node":
      return [
        path.join("node_modules", "vitest", "bin", "vitest.js"),
        "run",
        filePath,
        "--maxWorkers",
        "1",
      ];
    default:
      return ["vitest", "run", filePath, "--maxWorkers", "1"];
  }
}

for (const test of tests) {
  console.log("RUNNING:", test);

  const args = buildArgsFor(binary, test);

  try {
    const res = spawnSync(binary, args, { stdio: "inherit", shell: false });

    if (res.error) {
      throw res.error;
    }

    if (res.status !== 0) {
      console.error("FAILED:", test);
      process.exit(res.status || 1);
    }
  } catch (err) {
    console.error("FAILED:", test);
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
}

console.log("ALL TESTS PASSED");
