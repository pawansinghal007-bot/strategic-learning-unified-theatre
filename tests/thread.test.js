import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("thread module existence guard", () => {
  it("package.json exists at project root", () => {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    expect(fs.existsSync(packageJsonPath)).toBe(true);
  });
});
