import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { bindProfile, getBinding, unbind } from "../src/workspace.js";

describe("workspace binding", () => {
  it("sets, reads, and removes the profile field", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-rotator-ws-"));
    const wsPath = path.join(dir, "demo.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8"
    );

    await bindProfile(wsPath, "MyProfile");
    expect(await getBinding(wsPath)).toBe("MyProfile");

    await unbind(wsPath);
    expect(await getBinding(wsPath)).toBe(null);

    const roundTrip = JSON.parse(await fs.readFile(wsPath, "utf8"));
    expect(roundTrip.profile).toBeUndefined();
    expect(roundTrip.folders).toHaveLength(1);
  });

  it("throws a helpful error when workspace file is missing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vscode-rotator-ws-"));
    const wsPath = path.join(dir, "missing.code-workspace");
    await expect(getBinding(wsPath)).rejects.toThrow(/workspace/i);
  });
});

