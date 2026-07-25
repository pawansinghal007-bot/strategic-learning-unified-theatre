import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const extensionRoot = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "..", "vscode-extension");

function tryRealNodeImport(filename) {
  const fileUrl = pathToFileURL(path.join(extensionRoot, filename)).href;
  try {
    execFileSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(fileUrl)})`], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    return { threw: false };
  } catch (err) {
    return { threw: true, message: String(err.stderr || err.message) };
  }
}

describe("vscode-extension module resolution under real Node (not Vitest's transform)", () => {
  it("resolves agent-bridge as ESM without throwing", () => {
    const result = tryRealNodeImport("agent-bridge.mjs");
    expect(result.threw).toBe(false);
  });

  it("resolves collector as ESM without throwing", () => {
    const result = tryRealNodeImport("collector.mjs");
    expect(result.threw).toBe(false);
  });
});
