import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execFile as execFileRaw } from "./_child-process.js";

const MAX_BUFFER = 128 * 1024 * 1024; // 128 MB — large commits can exceed the 1 MB default

/**
 * Local Promise-returning wrapper around the callback-style execFile.
 * Always passes maxBuffer: 128 MB to prevent ERR_CHILD_PROCESS_STDIO_MAXBUFFER
 * on large commits. Kept local so the shared _child-process.js passthrough is
 * never modified and other callers are unaffected.
 *
 * @param {string[]} args  git sub-command and flags
 * @param {string}   cwd   working directory for the child process
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
function gitExec(args, cwd) {
  return new Promise((resolve, reject) => {
    execFileRaw(
      "git",
      args,
      { cwd, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          reject(err);
        } else {
          resolve({
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
          });
        }
      },
    );
  });
}

const DEFAULT_BASE_DIR = path.join(os.homedir(), ".vscode-rotator");
const DEFAULT_STATE_FILE = "repo-corpus-state.json";
const DEFAULT_OUTPUT_FILE = "repo-corpus.jsonl";
const SUPPORTED_EXTENSIONS = new Set([".js", ".ts", ".jsx", ".tsx"]);
const FUNCTION_DECLARATION_PATTERN =
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/;

function normalizeBaseDir(baseDir) {
  return baseDir ? path.resolve(baseDir) : DEFAULT_BASE_DIR;
}

function resolveStateFile({ stateFile, baseDir }) {
  if (stateFile) return path.resolve(stateFile);
  return path.join(normalizeBaseDir(baseDir), DEFAULT_STATE_FILE);
}

function resolveOutputPath({ outputPath, baseDir }) {
  if (outputPath) return path.resolve(outputPath);
  return path.join(normalizeBaseDir(baseDir), DEFAULT_OUTPUT_FILE);
}

async function ensureDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (
      err?.code === "ENOENT" ||
      err?.code === "EACCES" ||
      err instanceof SyntaxError
    ) {
      return null;
    }

    console.error(
      `[repo-corpus-exporter] Failed to read ${filePath}:`,
      String(err),
    );
    return null;
  }
}

async function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath);
  await ensureDirectory(dir);
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${randomSuffix}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  await fs.rename(tempPath, filePath);
}

function commitShaFromRef(ref) {
  return String(ref ?? "").trim();
}

async function resolveGitRef(ref, cwd) {
  if (!ref) return null;
  const result = await gitExec(["rev-parse", "--verify", "--quiet", ref], cwd);
  const sha = String(result.stdout ?? "").trim();
  return sha || null;
}

async function resolveGitTimestamp(ref, cwd) {
  const result = await gitExec(["show", "-s", "--format=%ct", ref], cwd);
  const raw = String(result.stdout ?? "").trim();
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function isAncestor(ancestor, descendant, cwd) {
  try {
    await gitExec(["merge-base", "--is-ancestor", ancestor, descendant], cwd);
    return true;
  } catch (err) {
    if (err?.code === 1) {
      return false;
    }
    throw err;
  }
}

async function determineEffectiveSinceRef(sinceRef, storedRef, cwd) {
  if (!sinceRef) {
    return storedRef || null;
  }

  const sinceSha = await resolveGitRef(sinceRef, cwd);
  const storedSha = storedRef ? await resolveGitRef(storedRef, cwd) : null;
  if (!sinceSha && !storedSha) return null;
  if (!sinceSha) return storedSha;
  if (!storedSha) return sinceSha;

  if (await isAncestor(storedSha, sinceSha, cwd)) {
    return sinceSha;
  }
  if (await isAncestor(sinceSha, storedSha, cwd)) {
    return storedSha;
  }

  const sinceTimestamp = await resolveGitTimestamp(sinceSha, cwd);
  const storedTimestamp = await resolveGitTimestamp(storedSha, cwd);
  if (sinceTimestamp === null || storedTimestamp === null) {
    return sinceSha;
  }
  return sinceTimestamp >= storedTimestamp ? sinceSha : storedSha;
}

function extractDocComment(lines, functionIndex) {
  const endIndex = functionIndex - 1;
  if (endIndex < 0) return null;

  const startIndex = findDocCommentStart(lines, endIndex);
  if (startIndex < 0) return null;

  const commentLines = lines.slice(startIndex, functionIndex);
  return commentLines
    .map((raw) => raw.trim())
    .map((raw) =>
      raw
        .replace(/^\/\*\*?/, "")
        .replace(/\*\/$/, "")
        .replace(/^\*\s?/, "")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

function collectFunctionSource(lines, startIndex) {
  const collected = [];
  let depth = 0;

  for (let index = startIndex; index < lines.length; index += 1) {
    const text = lines[index];
    collected.push(text);
    for (const char of text) {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
    }
    if (index > startIndex && depth <= 0) {
      break;
    }
  }

  return collected.join("\n");
}

function stripDiffMarker(line) {
  return line.startsWith("+") ? line.slice(1) : line;
}

function isJsFile(filePath) {
  return SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function parseGitLogOutput(output) {
  return String(output ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function findDocCommentStart(lines, endIndex) {
  if (endIndex < 0) return -1;

  for (let index = endIndex; index >= 0; index -= 1) {
    const trimmed = lines[index].trim();
    if (trimmed === "") return -1;
    if (trimmed.includes("/**")) return index;
    if (!trimmed.startsWith("*") && !trimmed.startsWith("*/")) return -1;
  }

  return -1;
}

function extractRepoCorpusPairsFromAddedLines(filePath, addedLines, commitSha) {
  const pairs = [];
  for (let index = 0; index < addedLines.length; index += 1) {
    const pair = tryExtractRepoCorpusPair(filePath, addedLines, index, commitSha);
    if (pair) pairs.push(pair);
  }
  return pairs;
}

function tryExtractRepoCorpusPair(filePath, addedLines, index, commitSha) {
  const text = addedLines[index].trim();
  const match = FUNCTION_DECLARATION_PATTERN.exec(text);
  if (!match) return null;

  const docComment = extractDocComment(addedLines, index);
  if (!docComment) return null;

  return {
    type: "repo-corpus",
    platform: "git",
    commit_sha: commitSha,
    user: docComment,
    assistant: collectFunctionSource(addedLines, index),
    metadata: {
      file: filePath,
      function_name: match[1],
      signature: `${match[1]}(${match[2].trim()})`,
      source: "git-diff",
    },
  };
}

function parseGitShowOutput(output) {
  const lines = String(output ?? "").split("\n");
  const filePairs = [];
  let currentFile = null;
  let addedLines = [];

  const pushCurrentFile = () => {
    if (currentFile && addedLines.length > 0) {
      filePairs.push({ file: currentFile, addedLines });
    }
    addedLines = [];
  };

  for (const rawLine of lines) {
    if (rawLine.startsWith("+++ b/")) {
      pushCurrentFile();
      currentFile = rawLine.slice("+++ b/".length).trim();
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (rawLine.startsWith("@@")) {
      continue;
    }

    if (rawLine.startsWith("+")) {
      if (rawLine.startsWith("+++ ")) {
        continue;
      }
      addedLines.push(stripDiffMarker(rawLine));
    }
  }

  pushCurrentFile();
  return filePairs;
}

export async function generateRepoCorpusPairs(
  sinceRef,
  { baseDir, cwd = process.cwd(), stateFile } = {},
) {
  const effectiveBaseDir = normalizeBaseDir(baseDir);
  const statePath = resolveStateFile({ stateFile, baseDir: effectiveBaseDir });
  const state = (await readJsonFile(statePath)) || { lastProcessedRef: null };
  const effectiveSinceRef = await determineEffectiveSinceRef(
    sinceRef,
    state.lastProcessedRef,
    cwd,
  );

  const rangeArgs = effectiveSinceRef
    ? [`${effectiveSinceRef}..HEAD`]
    : ["HEAD"];

  const logResult = await gitExec(
    ["log", "--format=%H", "--reverse", ...rangeArgs],
    cwd,
  );

  const commitShas = parseGitLogOutput(logResult.stdout);
  if (commitShas.length === 0) {
    return [];
  }

  const pairs = [];
  for (const commitSha of commitShas) {
    const showResult = await gitExec(
      ["show", "--unified=0", "--no-color", commitSha],
      cwd,
    );
    const filePairs = parseGitShowOutput(showResult.stdout);
    for (const { file, addedLines } of filePairs) {
      if (!isJsFile(file)) continue;
      const extracted = extractRepoCorpusPairsFromAddedLines(
        file,
        addedLines,
        commitSha,
      );
      pairs.push(...extracted);
    }
  }

  const newestSha = commitShas.at(-1);
  await writeJsonFile(statePath, { lastProcessedRef: newestSha });
  return pairs;
}

export async function appendRepoCorpusPairs(
  pairs,
  { outputPath, baseDir } = {},
) {
  const output = resolveOutputPath({ outputPath, baseDir });
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  if (pairs.length === 0) {
    return null;
  }
  const lines = pairs.map((pair) => JSON.stringify(pair)).join("\n") + "\n";
  await fs.appendFile(output, lines, { encoding: "utf8", mode: 0o600 });
  return output;
}
