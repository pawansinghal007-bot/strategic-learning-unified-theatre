import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { bindProfile, getBinding, unbind } from "../src/accounts/workspace.js";

describe("workspace binding", () => {
  it("sets, reads, and removes the profile field", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "demo.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8",
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
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "missing.code-workspace");
    await expect(getBinding(wsPath)).rejects.toThrow(/workspace/i);
  });

  it("throws error for invalid JSON syntax in workspace file", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "invalid.code-workspace");

    await fs.writeFile(wsPath, "{ invalid json }", "utf8");

    await expect(getBinding(wsPath)).rejects.toThrow(/JSON/i);
  });

  it("throws error for non-object JSON (array) in workspace file", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "array.code-workspace");

    await fs.writeFile(wsPath, "[1, 2, 3]", "utf8");

    await expect(getBinding(wsPath)).rejects.toThrow(/JSON object/i);
  });

  it("throws error for empty profileName in bindProfile", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "empty.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8",
    );

    await expect(bindProfile(wsPath, "")).rejects.toThrow(/profileName/i);
  });

  it("throws error for whitespace-only profileName in bindProfile", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "whitespace.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8",
    );

    await expect(bindProfile(wsPath, "   ")).rejects.toThrow(/profileName/i);
  });

  it("returns null when profile field is missing", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "noprofile.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8",
    );

    expect(await getBinding(wsPath)).toBe(null);
  });

  it("trims whitespace from profileName in bindProfile", async () => {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), "strategic-learning-unified-theatre-ws-"),
    );
    const wsPath = path.join(dir, "trimmed.code-workspace");

    await fs.writeFile(
      wsPath,
      JSON.stringify({ folders: [{ path: "." }] }, null, 2),
      "utf8",
    );

    await bindProfile(wsPath, "  TrimmedProfile  ");
    expect(await getBinding(wsPath)).toBe("TrimmedProfile");
  });
});
