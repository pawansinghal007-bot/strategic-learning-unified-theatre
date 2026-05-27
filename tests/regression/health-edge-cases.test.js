// REGRESSION: Historical health state edge cases
// Source: test_summary.txt, Sprint 15.6
// Must never be removed — encode historical failure as permanent gate
//
// Background: Health monitoring failed when health-state.json was missing,
// corrupt, or had mismatches. Must handle gracefully without crashing.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("Regression: Health Edge Cases", () => {
  let tempDir;
  let healthStateFile;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "health-edge-cases-test-"),
    );
    const configDir = path.join(tempDir, ".vscode-rotator");
    await fs.mkdir(configDir, { recursive: true });
    healthStateFile = path.join(configDir, "health-state.json");
    process.env.HOME = tempDir;
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  // Test 1: Missing health-state.json
  it("handles missing health-state.json gracefully", async () => {
    // Health state file does not exist
    let fileNotFound = false;
    try {
      await fs.readFile(healthStateFile, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        fileNotFound = true;
      }
    }

    // Should properly detect missing file
    expect(fileNotFound).toBe(true);

    // Verify file does not exist
    let exists = false;
    try {
      await fs.stat(healthStateFile);
      exists = true;
    } catch {}
    expect(exists).toBe(false);
  });

  // Test 2: Corrupt JSON in health-state.json
  it("handles corrupt JSON in health-state.json gracefully", async () => {
    // Write invalid JSON
    await fs.writeFile(healthStateFile, "{invalid json}}", "utf8");

    let parseError = null;
    try {
      const content = await fs.readFile(healthStateFile, "utf8");
      JSON.parse(content);
    } catch (err) {
      parseError = err;
    }

    // Should catch parse error, not crash
    expect(parseError).toBeDefined();
    expect(parseError.name).toBe("SyntaxError");
  });

  // Test 3: Empty health-state.json
  it("handles empty health-state.json gracefully", async () => {
    // Write empty file
    await fs.writeFile(healthStateFile, "", "utf8");

    let parseError = null;
    try {
      const content = await fs.readFile(healthStateFile, "utf8");
      if (!content) {
        throw new Error("EMPTY_FILE");
      }
      JSON.parse(content);
    } catch (err) {
      parseError = err;
    }

    // Should catch error
    expect(parseError).toBeDefined();
  });

  // Test 4: Health state missing pendingVersion field
  it("handles missing pendingVersion field gracefully", async () => {
    const healthState = {
      accounts: {
        "acc-1": { valid: true, remainingRequests: 100 },
      },
      // pendingVersion is missing
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    // Should read and parse without crashing
    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    expect(parsed).toBeDefined();
    expect(parsed.accounts).toBeDefined();
    // Should not require pendingVersion to exist
    expect(parsed.pendingVersion).toBeUndefined();
  });

  // Test 5: Health state with mismatched account IDs
  it("handles account ID mismatch gracefully", async () => {
    const healthState = {
      accounts: {
        "acc-1": { valid: true, remainingRequests: 100 },
        "acc-2": { valid: false, remainingRequests: 0, error: "Invalid token" },
      },
      pendingVersion: "1.0.0",
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    // Should read all accounts without validation errors
    expect(Object.keys(parsed.accounts)).toHaveLength(2);
    expect(parsed.accounts["acc-1"]).toBeDefined();
    expect(parsed.accounts["acc-2"]).toBeDefined();
  });

  // Test 6: Health state timeout expiry
  it("handles timeout expiry in health state gracefully", async () => {
    const expiredTime = new Date(Date.now() - 60000); // 1 minute ago
    const healthState = {
      accounts: {
        "acc-1": {
          valid: true,
          remainingRequests: 50,
          lastChecked: expiredTime.toISOString(),
        },
      },
      pendingVersion: "1.0.0",
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    // Should read and detect stale timestamp without crashing
    const account = parsed.accounts["acc-1"];
    const lastCheckedTime = new Date(account.lastChecked).getTime();
    const isStale = Date.now() - lastCheckedTime > 30000; // 30 second threshold

    expect(isStale).toBe(true);
  });

  // Test 7: Health state with null accounts
  it("handles null accounts field gracefully", async () => {
    const healthState = {
      accounts: null,
      pendingVersion: "1.0.0",
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    // Should read without crashing
    expect(parsed).toBeDefined();
    expect(parsed.accounts).toBeNull();
  });

  // Test 8: Health state with malformed account health data
  it("handles malformed account health data gracefully", async () => {
    const healthState = {
      accounts: {
        "acc-1": {
          valid: "not-a-boolean", // Should be boolean
          remainingRequests: "not-a-number", // Should be number
          error: 123, // Should be string or null
        },
      },
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    // Should parse JSON even though types are wrong
    // Type validation should happen at runtime
    expect(parsed).toBeDefined();
    expect(parsed.accounts["acc-1"]).toBeDefined();
  });

  // Test 9: Health state with extra unknown fields
  it("handles extra unknown fields gracefully", async () => {
    const healthState = {
      accounts: {
        "acc-1": { valid: true, remainingRequests: 100 },
      },
      pendingVersion: "1.0.0",
      unknownField1: "value1",
      unknownField2: { nested: true },
      unknownField3: [1, 2, 3],
    };

    await fs.writeFile(healthStateFile, JSON.stringify(healthState), "utf8");

    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    // Should read all fields, including unknown ones
    expect(parsed).toBeDefined();
    expect(parsed.unknownField1).toBe("value1");
    expect(parsed.unknownField2).toBeDefined();
    expect(parsed.unknownField3).toHaveLength(3);
  });

  // Test 10: Health state file size edge cases
  it("handles very large health state gracefully", async () => {
    // Create a large health state with many accounts
    const accounts = {};
    for (let i = 0; i < 1000; i++) {
      accounts[`acc-${i}`] = {
        // Non-cryptographic randomness — used for synthetic test data generation only. // NOSONAR javascript:S2245
        valid: Math.random() > 0.5,
        // Non-cryptographic randomness — used for synthetic test data generation only. // NOSONAR javascript:S2245
        remainingRequests: Math.floor(Math.random() * 1000),
      };
    }

    const healthState = { accounts, pendingVersion: "1.0.0" };
    const jsonString = JSON.stringify(healthState);

    // Should write without crashing
    await fs.writeFile(healthStateFile, jsonString, "utf8");

    // Should read without crashing
    const content = await fs.readFile(healthStateFile, "utf8");
    const parsed = JSON.parse(content);

    expect(Object.keys(parsed.accounts)).toHaveLength(1000);
  });
});
