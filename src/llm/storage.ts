import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { logger } from "../shared/logging/logger";

function getAppDir() {
  return process.env.UNIFIED_AI_DATA_DIR ?? join(homedir(), ".unified-ai-workspace");
}

function ensureDir(path: string) {
  mkdirSync(dirname(path), { recursive: true });
}

export function getStoragePath(fileName: string) {
  return join(getAppDir(), fileName);
}

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = getStoragePath(fileName);

  try {
    if (!existsSync(filePath)) {
      return fallback;
    }

    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (error) {
    logger.warn("storage.read.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}

export function writeJsonFile(fileName: string, value: unknown) {
  const filePath = getStoragePath(fileName);

  try {
    ensureDir(filePath);
    writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
  } catch (error) {
    logger.error("storage.write.failed", {
      fileName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
