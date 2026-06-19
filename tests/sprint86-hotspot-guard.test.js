/**
 * Sprint 86 Hotspot Guard Test
 *
 * Asserts that:
 * - All 16 security hotspots are logged in docs/security-hotspot-log.md
 * - Each entry has a justification field
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const workspaceRoot = "/home/pawan/vscodeagent/Solution";
const hotspotLogPath = join(workspaceRoot, "docs/security-hotspot-log.md");

describe("Sprint 86 Hotspot Guard", () => {
  describe("Hotspot logging", () => {
    it("logs all 16 hotspots", () => {
      const content = readFileSync(hotspotLogPath, "utf8");
      // Count entries that start with "### " (section headers for each hotspot)
      const entries = content.match(/^### /gm);
      expect(entries).toHaveLength(16);
    });

    it("each entry has a justification field", () => {
      const content = readFileSync(hotspotLogPath, "utf8");
      // Each entry should have "- **Justification**:" field
      const justificationCount = (content.match(/- \*\*Justification\*\*/gm) || [])
        .length;
      expect(justificationCount).toBeGreaterThanOrEqual(16);
    });
  });
});
