import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("run-tests script rejects disallowed binary via TEST_RUNNER_BIN", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slut-run-tests-"));
  const testsDir = path.join(tmp, "tests");
  fs.mkdirSync(testsDir);

  // create a trivial test file so the runner would normally find something
  fs.writeFileSync(
    path.join(testsDir, "dummy.test.js"),
    "test('ok', () => { expect(1+1).toBe(2); });\n",
  );

  const runner = path.resolve(process.cwd(), "run-tests.cjs");

  const res = spawnSync(process.execPath, [runner], {
    env: { ...process.env, TEST_RUNNER_BIN: "badbin" },
    cwd: tmp,
    encoding: "utf8",
  });

  expect(res.status).not.toBe(0);
  const stderr = String(res.stderr || "") + String(res.stdout || "");
  expect(stderr).toMatch(/Invalid test runner binary/i);
});
