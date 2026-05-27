// ROBOT FRAMEWORK ANALYSIS - Task 5c
// Static analysis test that verifies Robot Framework suites exist and contain mandatory flows
// This test ensures the robot/ directory structure is properly initialized with required test cases

import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const robotDir = join(__dirname, "..", "robot");
const functionalSuiteFile = join(robotDir, "suites", "functional.robot");

describe("Regression: Robot Framework Suites", () => {
  it("should have at least one .robot file in robot/ directory", async () => {
    const files = await readdir(robotDir, { recursive: true });
    const robotFiles = files.filter((f) => f.endsWith(".robot"));
    expect(robotFiles.length).toBeGreaterThan(0);
  });

  it("should have functional.robot suite file", async () => {
    const content = await readFile(functionalSuiteFile, "utf-8");
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);
  });

  it('should contain "End-To-End Rotation" test case', async () => {
    const content = await readFile(functionalSuiteFile, "utf-8");
    expect(content).toMatch(/End-To-End Rotation/);
  });

  it('should contain "Browser Capture" test case', async () => {
    const content = await readFile(functionalSuiteFile, "utf-8");
    expect(content).toMatch(/Browser Capture/);
  });

  it('should contain "LLM Prompt Generation" test case', async () => {
    const content = await readFile(functionalSuiteFile, "utf-8");
    expect(content).toMatch(/LLM Prompt Generation/);
  });
});
