import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as childProcess from "node:child_process";
import { Command } from "commander";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE_DIR = path.resolve(__dirname, "../");

export class RobotFrameworkError extends Error {}
export class TddViolationError extends Error {}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

export async function detectPython() {
  for (const cmd of ["python", "python3"]) {
    try {
      const result = await runProcess(cmd, ["--version"]);
      if (result.code === 0) {
        const output = (result.stdout || result.stderr).trim();
        return {
          available: true,
          version: output.replace(/^Python\s+/i, ""),
          cmd,
        };
      }
    } catch {
      continue;
    }
  }
  return { available: false, version: null, cmd: null };
}

export async function detectRobotFramework(pythonCmd = "python") {
  try {
    const result = await runProcess(pythonCmd, ["-m", "robot", "--version"]);
    if (result.code === 0) {
      return {
        available: true,
        version: result.stdout.trim().split(/\r?\n/)[0] || null,
      };
    }
  } catch {
    // ignore
  }
  return { available: false, version: null };
}

function toSnakeCase(name) {
  return name
    .replace(/\.js$/i, "")
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(/[^a-z0-9]+/gi, "_")
    .replaceAll(/^_+|_+$/g, "")
    .toLowerCase();
}

function deriveRobotPath(srcFile, robotDir) {
  const base = path.basename(srcFile, ".js");
  return path.join(robotDir, "functional", `${toSnakeCase(base)}.robot`);
}

function extractExportedNames(source) {
  const names = new Set();
  for (const regex of [
    /export\s+function\s+(\w+)/g,
    /export\s+(?:const|let|var)\s+(\w+)\s*=/g,
    /export\s+default\s+function(?:\s+(\w+))?/g,
  ]) {
    let match;
    while ((match = regex.exec(source))) {
      names.add(match[1] || "default");
    }
  }
  return [...names];
}

async function atomicWrite(filePath, content) {
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function generateSkeletonRobotFile(
  srcFile,
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
) {
  const srcPath = path.resolve(srcFile);
  if (!(await pathExists(srcPath))) {
    throw new Error(`Source file not found: ${srcFile}`);
  }

  const source = await fs.readFile(srcPath, "utf8");
  const exported = extractExportedNames(source);
  const robotPath = deriveRobotPath(srcPath, robotDir);
  await fs.mkdir(path.dirname(robotPath), { recursive: true });

  const testCases = exported.length
    ? exported
        .map(
          (name) =>
            `*** Test Cases ***\n${name}\n    [Documentation]    TODO implement test for ${name}\n    Fail    Test stub for ${name}`,
        )
        .join("\n\n")
    : "*** Test Cases ***\nPlaceholder test\n    Fail    TODO add tests";

  const content = `*** Settings ***\nResource    ../resources/cli.resource\n\n*** Variables ***\n# Add variables if needed\n\n${testCases}\n`;
  await atomicWrite(robotPath, content);
  return robotPath;
}

export async function enforceTdd(
  srcFile,
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
  options = {},
) {
  const srcPath = path.resolve(srcFile);
  const robotPath = deriveRobotPath(srcPath, robotDir);
  const exists = await pathExists(robotPath);
  const srcStat = await fs.stat(srcPath);
  const graceMs = Number(options.graceMs || 0);

  if (!exists) {
    return {
      compliant: false,
      robotPath,
      srcMtime: srcStat.mtimeMs,
      robotMtime: null,
      reason: `No robot test found for ${srcFile}. Write the test first.`,
    };
  }

  const robotStat = await fs.stat(robotPath);
  if (robotStat.mtimeMs < srcStat.mtimeMs - graceMs) {
    return {
      compliant: false,
      robotPath,
      srcMtime: srcStat.mtimeMs,
      robotMtime: robotStat.mtimeMs,
      reason: `Implementation was modified after its test. Run tests before modifying ${srcFile}.`,
    };
  }

  return {
    compliant: true,
    robotPath,
    srcMtime: srcStat.mtimeMs,
    robotMtime: robotStat.mtimeMs,
    reason: null,
  };
}

const DEFAULT_TDD_OPTIONS = Object.freeze({
  strict: true,
  graceMs: 0,
});

export async function assertTddGate(
  srcFiles,
  options = DEFAULT_TDD_OPTIONS,
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
) {
  options = options ?? { strict: true, graceMs: 0 };

  const violations = [];

  for (const file of srcFiles) {
    const result = await enforceTdd(file, robotDir, {
      graceMs: options.graceMs,
    });

    if (!result.compliant) {
      violations.push(result);
    }
  }

  if (violations.length && options.strict) {
    throw new TddViolationError(
      `TDD violations found: ${violations.map((violation) => violation.reason).join("; ")}`,
    );
  }

  return violations;
}

function parseRobotStats(xml) {
  const passMatch = xml.match(/pass="(\d+)"/i);
  const failMatch = xml.match(/fail="(\d+)"/i);
  const skipMatch = xml.match(/skip="(\d+)"/i);
  return {
    passed: passMatch ? Number(passMatch[1]) : 0,
    failed: failMatch ? Number(failMatch[1]) : 0,
    skipped: skipMatch ? Number(skipMatch[1]) : 0,
  };
}

function parseRobotErrors(xml) {
  const errors = [];
  const regex = /<test\s+[^>]*status="FAIL"[^>]*name="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(xml))) {
    errors.push(match[1]);
  }
  return errors;
}

export async function persistResultsToDb(results, baseDir = DEFAULT_BASE_DIR) {
  console.warn(
    "persistResultsToDb() is not implemented yet. Install SQLite persistence before using.",
  );
  return null;
}

function resolveRobotPath(
  robotPath,
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
) {
  if (!robotPath) return null;
  return path.isAbsolute(robotPath)
    ? robotPath
    : path.resolve(robotDir, robotPath);
}

async function collectRobotFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const item of entries) {
    const resolved = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === "node_modules" || item.name === ".git") continue;
      results.push(...(await collectRobotFiles(resolved)));
    } else if (item.isFile() && resolved.endsWith(".robot")) {
      results.push(resolved);
    }
  }
  return results;
}

export async function listRobotFiles(
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
) {
  const resolvedRoot = path.resolve(robotDir);
  if (!(await pathExists(resolvedRoot))) {
    return [];
  }
  const files = await collectRobotFiles(resolvedRoot);
  return files.map((file) => path.relative(resolvedRoot, file)).sort();
}

export async function readRobotFile(
  robotPath,
  robotDir = path.resolve(DEFAULT_BASE_DIR, "robot"),
) {
  const resolvedPath = resolveRobotPath(robotPath, robotDir);
  if (!(await pathExists(resolvedPath))) {
    throw new Error(`Robot file not found: ${robotPath}`);
  }
  return await fs.readFile(resolvedPath, "utf8");
}

export async function runRobotFile(robotPath, outputDir = null, env = {}) {
  const python = await detectPython();
  if (!python.available) {
    throw new RobotFrameworkError(
      "Python 3.10+ is required for Robot Framework tests.",
    );
  }

  const robot = await detectRobotFramework(python.cmd);
  if (!robot.available) {
    throw new RobotFrameworkError(
      "Robot Framework is unavailable. Run: pip install robotframework robotframework-playwright",
    );
  }

  const resolvedPath = resolveRobotPath(robotPath);
  if (!(await pathExists(resolvedPath))) {
    throw new Error(`Robot file not found: ${resolvedPath}`);
  }

  const outputDirectory = outputDir
    ? path.resolve(outputDir)
    : path.resolve(DEFAULT_BASE_DIR, "robot-results");
  await fs.mkdir(outputDirectory, { recursive: true });
  const outputXml = path.join(outputDirectory, "output.xml");
  const reportHtml = path.join(outputDirectory, "report.html");
  const logHtml = path.join(outputDirectory, "log.html");

  const args = [
    "-m",
    "robot",
    "--outputdir",
    outputDirectory,
    "--output",
    "output.xml",
    "--log",
    "log.html",
    "--report",
    "report.html",
    resolvedPath,
  ];
  const result = await runProcess(python.cmd, args, {
    env: { ...process.env, ...env },
  });
  const xmlContents = (await pathExists(outputXml))
    ? await fs.readFile(outputXml, "utf8")
    : "";
  const stats = parseRobotStats(xmlContents);
  const errors = xmlContents ? parseRobotErrors(xmlContents) : [];

  const summary = {
    exitCode: result.code ?? 1,
    passed: stats.passed,
    failed: stats.failed,
    skipped: stats.skipped,
    outputXml,
    reportHtml,
    logHtml,
    durationMs: 0,
    errors,
  };

  await persistResultsToDb(summary, DEFAULT_BASE_DIR).catch(() => {});
  return summary;
}

export async function runSuite({
  suite = "all",
  tags = [],
  excludeTags = [],
  outputDir = null,
  dryRun = false,
  baseDir = DEFAULT_BASE_DIR,
  env = {},
} = {}) {
  const python = await detectPython();
  if (!python.available) {
    throw new RobotFrameworkError(
      "Python 3.10+ is required for Robot Framework tests.",
    );
  }

  const robot = await detectRobotFramework(python.cmd);
  if (!robot.available) {
    throw new RobotFrameworkError(
      "Robot Framework is unavailable. Run: pip install robotframework robotframework-playwright",
    );
  }

  if (typeof suite === "string" && suite.toLowerCase().endsWith(".robot")) {
    return await runRobotFile(suite, outputDir, env);
  }

  const suiteMap = {
    all: path.resolve(baseDir, "robot"),
    functional: path.resolve(baseDir, "robot", "functional"),
    non_functional: path.resolve(baseDir, "robot", "non_functional"),
    regression: path.resolve(baseDir, "robot", "regression"),
  };

  const suitePath = suiteMap[suite] || suiteMap.all;
  if (!(await pathExists(suitePath))) {
    throw new Error(`Robot suite path does not exist: ${suitePath}`);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputXml = path.join(outputDir, "output.xml");
  const reportHtml = path.join(outputDir, "report.html");
  const logHtml = path.join(outputDir, "log.html");

  const args = [
    "-m",
    "robot",
    "--outputdir",
    outputDir,
    "--output",
    "output.xml",
    "--log",
    "log.html",
    "--report",
    "report.html",
  ];
  if (dryRun) args.push("--dryrun");
  for (const tag of tags) args.push("--include", tag);
  for (const tag of excludeTags) args.push("--exclude", tag);
  args.push(suitePath);

  const result = await runProcess(python.cmd, args, {
    env: { ...process.env, ...env },
  });
  const xmlContents = (await pathExists(outputXml))
    ? await fs.readFile(outputXml, "utf8")
    : "";
  const stats = parseRobotStats(xmlContents);
  const errors = xmlContents ? parseRobotErrors(xmlContents) : [];

  const summary = {
    exitCode: result.code ?? 1,
    passed: stats.passed,
    failed: stats.failed,
    skipped: stats.skipped,
    outputXml,
    reportHtml,
    logHtml,
    durationMs: 0,
    errors,
  };

  await persistResultsToDb(summary, baseDir).catch(() => {});
  return summary;
}

function collectJsFiles(dir) {
  const entries = fs.readdir(dir, { withFileTypes: true });
  return entries.then((items) =>
    Promise.all(
      /* v8 ignore next 10 */
      items.map(async (item) => {
        const resolved = path.join(dir, item.name);
        if (item.isDirectory()) {
          if (item.name === "node_modules" || item.name === ".git") return [];
          return collectJsFiles(resolved);
        }
        if (item.isFile() && resolved.endsWith(".js")) {
          return [resolved];
        }
        return [];
      }),
    ).then(/* v8 ignore next 1 */ (nested) => nested.flat()),
  );
}

const program = new Command();
program
  .name("strategic-learning-unified-theatre-test-runner")
  .description(
    "Robot Framework test runner and TDD helper for strategic-learning-unified-theatre",
  );

program
  .command("suite")
  .description("Run Robot Framework suites")
  .option("--suite <name>", "all|functional|non_functional|regression", "all")
  .option("--include <tags...>", "Tags to include", [])
  .option("--exclude <tags...>", "Tags to exclude", [])
  .option(
    "--output-dir <path>",
    "Output directory for Robot results",
    path.resolve(DEFAULT_BASE_DIR, "robot-results"),
  )
  .option("--dry-run", "Run Robot Framework in dry-run mode")
  .action(async (options) => {
    try {
      const summary = await runSuite({
        suite: options.suite,
        tags: options.include,
        excludeTags: options.exclude,
        outputDir: path.resolve(options.outputDir),
        dryRun: Boolean(options.dryRun),
      });
      console.log(
        `Robot suite completed: passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped}`,
      );
      if (summary.errors.length) {
        console.log("Errors:", summary.errors.join(", "));
      }
      process.exitCode = summary.exitCode;
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("tdd-check [file]")
  .description("Verify Robot Framework test coverage for source files")
  .option("--grace-ms <n>", "Grace period for source modifications", "0")
  .action(async (file, options) => {
    try {
      const files = file
        ? [file]
        : await collectJsFiles(path.resolve(DEFAULT_BASE_DIR, "src"));
      const violations = await assertTddGate(
        files,
        {
          strict: false,
          graceMs: Number(options.graceMs),
        },
        path.resolve(DEFAULT_BASE_DIR, "robot"),
      );
      if (violations.length) {
        console.log(`TDD check found ${violations.length} violation(s)`);
        violations.forEach((violation) => {
          console.log(`- ${violation.reason} (${violation.robotPath})`);
        });
        process.exitCode = 1;
        return;
      }
      console.log("TDD check passed.");
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("skeleton <srcFile>")
  .description(
    "Generate a Robot Framework skeleton test file for a source file",
  )
  .action(async (srcFile) => {
    try {
      const generated = await generateSkeletonRobotFile(srcFile);
      console.log(`Generated skeleton robot file at: ${generated}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command("history")
  .description("Show a summary of Robot Framework test runs")
  .option("--limit <n>", "Limit output rows", "10")
  .action(async (options) => {
    console.log("TODO: Robot history reporting is not implemented yet.");
    console.log(`Limit: ${options.limit}`);
    process.exitCode = 0;
  });

/* v8 ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse(process.argv);
}
