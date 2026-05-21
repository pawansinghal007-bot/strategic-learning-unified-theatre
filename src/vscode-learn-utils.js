import os from "node:os";
import path from "node:path";

const DEFAULT_ALLOWED_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".txt"
]);

const DEFAULT_EXCLUDED_PATH_SEGMENTS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  "test-output"
];

const SECRET_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /\.key$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.crt$/i,
  /\.jks$/i,
  /\.pfx$/i,
  /\\secrets\\/i,
  /\\credentials\\/i,
  /\/secrets\//i,
  /\/credentials\//i,
  /secret/i
];

function homeDir() {
  return process.env.HOME || os.homedir();
}

export function defaultStagedSignalsDir(config) {
  if (config?.vscodeLearn?.stagedSignalsDir) {
    return path.resolve(config.vscodeLearn.stagedSignalsDir);
  }
  const baseDir = config?.baseDir ? path.resolve(config.baseDir) : path.join(homeDir(), ".vscode-rotator");
  return path.join(baseDir, "vscode-signals");
}

export function sanitizeFilename(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "signal";
}

export function fileTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function isSecretPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  const filename = path.basename(filePath);
  return SECRET_PATTERNS.some((pattern) => pattern.test(filename) || pattern.test(normalized));
}

export function isExcludedPath(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").toLowerCase();
  return DEFAULT_EXCLUDED_PATH_SEGMENTS.some(
    (segment) => normalized.includes(`/${segment}/`) || normalized.endsWith(`/${segment}`)
  );
}

export function isAllowedExtension(filePath, allowedExtensions = null) {
  const ext = path.extname(String(filePath)).toLowerCase();
  if (Array.isArray(allowedExtensions) && allowedExtensions.length > 0) {
    return allowedExtensions.map((item) => String(item).toLowerCase()).includes(ext);
  }
  return DEFAULT_ALLOWED_EXTENSIONS.has(ext);
}

export function formatFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((item) => JSON.stringify(String(item))).join(", ")}]`);
    } else {
      lines.push(`${key}: ${JSON.stringify(String(value))}`);
    }
  }
  return lines.concat("---", "").join("\n");
}

export function parseFrontmatter(raw) {
  const text = String(raw ?? "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return { data: {}, body: text };
  }
  const data = {};
  for (const line of match[1].split("\n")) {
    if (!line.trim()) continue;
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) continue;
    data[key.trim()] = rest.join(":").trim().replace(/^"|"$/g, "");
  }
  return { data, body: text.slice(match[0].length) };
}

export function splitStagedSignalDocuments(raw) {
  const normalized = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (!normalized.startsWith("---\n")) return [normalized];
  return normalized
    .split(/\n---\n(?=---\n)/)
    .map((doc) => doc.trim())
    .filter(Boolean);
}
