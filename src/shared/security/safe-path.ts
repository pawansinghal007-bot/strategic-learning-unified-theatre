import * as fs from "node:fs";
import * as path from "node:path";

export function resolveSafePath(inputPath: string, root: string): string {
  let resolvedRoot: string;
  try {
    resolvedRoot = fs.realpathSync(root);
  } catch (err) {
    throw new Error(`PROJECT_ROOT cannot be resolved: ${root}`);
  }
  let candidate: string;
  try {
    if (path.isAbsolute(inputPath)) {
      candidate = fs.realpathSync(inputPath);
    } else {
      const resolvedInput = path.resolve(resolvedRoot, inputPath);
      candidate = fs.realpathSync(resolvedInput);
    }
  } catch {
    // For non-existent paths, use path.resolve as fallback.
    // This is safe because path.resolve() still syntactically collapses ".." segments,
    // so string-based traversal is still caught in the relative-path check below.
    // The only case this doesn't fully cover is a dangling symlink pointing outside root,
    // but fs.readFileSync would fail on a dangling symlink anyway.
    candidate = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(resolvedRoot, inputPath);
  }
  const relative = path.relative(resolvedRoot, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${inputPath}`);
  }
  return candidate;
}
