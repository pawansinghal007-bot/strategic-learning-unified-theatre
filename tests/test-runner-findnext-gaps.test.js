/**
 * test-runner-findnext-gaps.test.js
 *
 * Targets the four remaining uncovered branches inside findNextRobotError()
 * in src/test-runner.js.  All are exercised indirectly through runRobotFile(),
 * which calls parseRobotErrors(xml) → findNextRobotError().
 *
 * Line 289 — <test found but next char is NOT whitespace (e.g. "<testament>")
 *             → returns { name: null, nextSearchFrom: tagStart + 1 }
 *
 * Line 306 — <test …> tag found but status="fail" is absent
 *             (e.g. status="PASS") → skipped, name: null
 *
 * Line 314 — tag has status="fail" but name="…" does NOT appear after it
 *             → returns { name: null, nextSearchFrom: tagStart + 1 }
 *
 * Line 320 — tag has status="fail" and name=" but the value is empty ("")
 *             → returns { name: null, nextSearchFrom: tagStart + 1 }
 */

import fs from "node:fs/promises";
import nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── spawn mock ────────────────────────────────────────────────────────────────
var spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  __esModule: true,
  default: { spawn: (...args) => spawnMock(...args) },
  spawn: (...args) => spawnMock(...args),
}));

import { runRobotFile } from "../src/test-runner.js";

// ── helpers ───────────────────────────────────────────────────────────────────
function mockChild({ stdout = "", stderr = "", code = 0 } = {}) {
  return {
    stdout: { on(e, cb) { if (e === "data") cb(Buffer.from(stdout)); } },
    stderr: { on(e, cb) { if (e === "data") cb(Buffer.from(stderr)); } },
    on(e, cb) { if (e === "close") setTimeout(() => cb(code), 0); return this; },
  };
}

/**
 * Sets up spawn so that:
 *  - python --version  → available
 *  - python -m robot --version → available
 *  - python -m robot … --outputdir <dir> … → writes `xmlContent` to
 *    <dir>/output.xml and returns exit code 0
 */
function mockPythonRobotWithXml(xmlContent) {
  spawnMock.mockImplementation((cmd, args) => {
    if (args[0] === "--version")
      return mockChild({ stdout: "Python 3.11.4\n", code: 0 });
    if (args[0] === "-m" && args[1] === "robot" && args[2] === "--version")
      return mockChild({ stdout: "Robot Framework 6.0\n", code: 0 });
    if (args.includes("--outputdir")) {
      const outDir = args[args.indexOf("--outputdir") + 1];
      nodeFs.mkdirSync(outDir, { recursive: true });
      nodeFs.writeFileSync(path.join(outDir, "output.xml"), xmlContent, "utf8");
      return mockChild({ code: 0 });
    }
    return mockChild({ code: 1 });
  });
}

// ── suite ─────────────────────────────────────────────────────────────────────
describe("findNextRobotError — uncovered branch coverage", () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tr-findnext-"));
    spawnMock.mockReset();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // Helper: create a .robot file and run it with the given output.xml content.
  async function runWithXml(xmlContent) {
    const robotFile = path.join(tmpDir, "t.robot");
    await fs.writeFile(robotFile, "*** Test Cases ***\nStub", "utf8");
    mockPythonRobotWithXml(xmlContent);
    return runRobotFile(robotFile, path.join(tmpDir, "out"), {});
  }

  // ── Line 289: <testX…> — "test" substring but NOT followed by whitespace ──
  // parseRobotErrors scans for "<test" and then checks whether the very next
  // character is whitespace.  If not, it returns { name:null, nextSearchFrom }
  // and the outer loop moves on.  We embed "<testament>" (no space after
  // "<test") followed by a genuine failing test so we can confirm the scan
  // continues correctly and does NOT mistake "<testament>" for a test tag.
  it("line 289: <test not followed by whitespace is skipped (e.g. <testament ...>)", async () => {
    const xml = `
      <robot>
        <statistics><total pass="0" fail="1" skip="0"/></statistics>
        <testament attr="x"></testament>
        <test status="FAIL" name="RealFailure"></test>
      </robot>
    `;
    const summary = await runWithXml(xml);
    // "<testament>" must NOT produce a spurious error entry
    // "RealFailure" from the proper <test …> tag MUST be captured
    expect(summary.errors).not.toContain("testament");
    expect(summary.errors).toContain("RealFailure");
  });

  // ── Line 306: tag has <test …> but status is not "fail" ──────────────────
  // A passing test tag (status="PASS") must be skipped entirely — no name
  // extracted — while a subsequent FAIL tag is still found.
  it("line 306: <test> with status PASS is skipped, subsequent FAIL is found", async () => {
    const xml = `
      <robot>
        <statistics><total pass="1" fail="1" skip="0"/></statistics>
        <test status="PASS" name="PassingTest"></test>
        <test status="FAIL" name="FailingTest"></test>
      </robot>
    `;
    const summary = await runWithXml(xml);
    expect(summary.errors).not.toContain("PassingTest");
    expect(summary.errors).toContain("FailingTest");
  });

  // Variant: only passing tests — errors list must be empty.
  it("line 306: XML with only PASS tests produces empty errors list", async () => {
    const xml = `
      <robot>
        <statistics><total pass="3" fail="0" skip="0"/></statistics>
        <test status="PASS" name="T1"></test>
        <test status="PASS" name="T2"></test>
        <test status="PASS" name="T3"></test>
      </robot>
    `;
    const summary = await runWithXml(xml);
    expect(summary.errors).toEqual([]);
  });

  // ── Line 314: tag has status="fail" but name attribute is missing entirely ─
  // The tag has the FAIL status but no name="…" attribute at all.
  it("line 314: <test status=FAIL> without a name attribute produces no error entry", async () => {
    const xml = `
      <robot>
        <statistics><total pass="0" fail="1" skip="0"/></statistics>
        <test status="FAIL" id="s1-t1"></test>
        <test status="FAIL" name="HasName"></test>
      </robot>
    `;
    const summary = await runWithXml(xml);
    // The nameless tag must not add anything; the named one must appear
    expect(summary.errors).toContain("HasName");
    expect(summary.errors).toHaveLength(1);
  });

  // Variant: name="…" appears BEFORE status="fail" in the tag.
  // The implementation requires status to precede name, so this must be skipped.
  it("line 314: name= before status=FAIL in tag attributes is not captured", async () => {
    const xml = `
      <robot>
        <statistics><total pass="0" fail="1" skip="0"/></statistics>
        <test name="NameFirst" status="FAIL"></test>
      </robot>
    `;
    // name comes before status in the raw tag body → nameIdx search starts
    // after statusIdx → name is not found after status → line 314 branch fires
    const summary = await runWithXml(xml);
    expect(summary.errors).toEqual([]);
  });

  // ── Line 300: unterminated <test tag (no closing ">") ────────────────────
  // When xml.indexOf(">", i) returns -1, findNextRobotError returns null and
  // the outer loop terminates early.  We embed a truncated tag followed by
  // nothing — the scan must stop cleanly with an empty errors list.
  it("line 300: unterminated <test tag (no closing >) stops the scan cleanly", async () => {
    // The XML is deliberately truncated mid-tag so there is no ">" after "<test "
    const xml =
      '<robot><statistics><total pass="0" fail="1" skip="0"/></statistics>' +
      "<test status=\"FAIL\" name=\"Truncated";
    const summary = await runWithXml(xml);
    // No closing ">" in the tag, findNextRobotError returns null → errors = []
    expect(summary.errors).toEqual([]);
  });

  // ── Line 320: name="" — empty name value ──────────────────────────────────
  // The closing quote lands immediately at nameValueStart, so
  // nameValueEnd === nameValueStart → the guard fires and skips the entry.
  it("line 320: <test status=FAIL name=\"\"> with empty name is skipped", async () => {
    const xml = `
      <robot>
        <statistics><total pass="0" fail="2" skip="0"/></statistics>
        <test status="FAIL" name=""></test>
        <test status="FAIL" name="NonEmpty"></test>
      </robot>
    `;
    const summary = await runWithXml(xml);
    // empty name must not appear; "NonEmpty" must be captured
    expect(summary.errors).not.toContain("");
    expect(summary.errors).toContain("NonEmpty");
    expect(summary.errors).toHaveLength(1);
  });
});
