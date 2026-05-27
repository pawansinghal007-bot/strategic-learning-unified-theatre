import fs from "node:fs";
import path from "node:path";

const workflowPath = path.join(process.cwd(), ".github", "workflows", "test.yml");
const content = fs.readFileSync(workflowPath, "utf8");

describe("test CI workflow", () => {
  it("triggers on push", () => {
    expect(content).toContain("push:");
  });

  it("triggers on pull requests", () => {
    expect(content).toContain("pull_request:");
  });

  it("runs Vitest CI coverage", () => {
    expect(content).toContain("npm run test:ci");
  });

  it("runs Robot Framework suites", () => {
    expect(content).toContain("npm run test:robot");
  });

  it("uploads coverage and Robot artifacts", () => {
    const uploadArtifactCount = (content.match(/actions\/upload-artifact@v4/g) ?? []).length;
    expect(uploadArtifactCount).toBeGreaterThanOrEqual(2);
  });
});
