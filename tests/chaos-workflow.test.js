const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.resolve(__dirname, "../.github/workflows/chaos.yml");
const workflowText = fs.readFileSync(workflowPath, "utf8");

describe("Chaos workflow file", () => {
  it("includes schedule cron, manual dispatch, chaos command, Robot install, and artifact upload", () => {
    expect(workflowText).toContain("cron:");
    expect(workflowText).toContain("workflow_dispatch");
    expect(workflowText).toContain("npm run test:chaos");
    expect(workflowText).toContain("pip install robotframework");
    expect(workflowText).toContain("upload-artifact");
  });

  it("does not hardcode password or token outside of secrets context", () => {
    const cleaned = workflowText.replace(/\${{\s*secrets\.[^}]+}}/g, "");
    expect(cleaned).not.toMatch(/password/i);
    expect(cleaned).not.toMatch(/token/i);
  });
});
