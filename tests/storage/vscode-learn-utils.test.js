import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  defaultStagedSignalsDir,
  sanitizeFilename,
  fileTimestamp,
  isSecretPath,
  isExcludedPath,
  isAllowedExtension,
  formatFrontmatter,
  parseFrontmatter,
  splitStagedSignalDocuments,
} from "../../src/storage/vscode-learn-utils.js";

describe("vscode-learn-utils", () => {
  describe("defaultStagedSignalsDir", () => {
    const originalHome = process.env.HOME;

    afterEach(() => {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
    });

    it("uses an explicit vscodeLearn.stagedSignalsDir when provided (line 48)", () => {
      const result = defaultStagedSignalsDir({
        vscodeLearn: { stagedSignalsDir: "/custom/signals/dir" },
      });
      expect(result).toBe(path.resolve("/custom/signals/dir"));
    });

    it("resolves a relative stagedSignalsDir against cwd", () => {
      const result = defaultStagedSignalsDir({
        vscodeLearn: { stagedSignalsDir: "relative/signals" },
      });
      expect(result).toBe(path.resolve("relative/signals"));
    });

    it("falls back to baseDir + vscode-signals when no stagedSignalsDir is set", () => {
      const result = defaultStagedSignalsDir({ baseDir: "/my/base" });
      expect(result).toBe(
        path.join(path.resolve("/my/base"), "vscode-signals"),
      );
    });

    it("falls back to HOME/.vscode-rotator/vscode-signals when nothing is configured", () => {
      process.env.HOME = "/home/tester";
      const result = defaultStagedSignalsDir({});
      expect(result).toBe(
        path.join("/home/tester", ".vscode-rotator", "vscode-signals"),
      );
    });

    it("falls back to os.homedir() when HOME env var is unset", () => {
      delete process.env.HOME;
      const result = defaultStagedSignalsDir(undefined);
      expect(result).toBe(
        path.join(os.homedir(), ".vscode-rotator", "vscode-signals"),
      );
    });

    it("treats a falsy vscodeLearn.stagedSignalsDir as not provided", () => {
      process.env.HOME = "/home/tester";
      const result = defaultStagedSignalsDir({
        vscodeLearn: { stagedSignalsDir: "" },
        baseDir: undefined,
      });
      expect(result).toBe(
        path.join("/home/tester", ".vscode-rotator", "vscode-signals"),
      );
    });
  });

  describe("sanitizeFilename", () => {
    it("lowercases, trims, and collapses unsafe characters to hyphens", () => {
      expect(sanitizeFilename("  My File!! Name.txt  ")).toBe(
        "my-file-name.txt",
      );
    });

    it("strips leading and trailing hyphens after replacement", () => {
      expect(sanitizeFilename("***weird***")).toBe("weird");
    });

    it("truncates to 64 characters", () => {
      const long = "a".repeat(100);
      expect(sanitizeFilename(long)).toHaveLength(64);
    });

    it("returns 'signal' for null/undefined/empty input", () => {
      expect(sanitizeFilename(null)).toBe("signal");
      expect(sanitizeFilename(undefined)).toBe("signal");
      expect(sanitizeFilename("")).toBe("signal");
      expect(sanitizeFilename("   ")).toBe("signal");
    });

    it("returns 'signal' when the value sanitizes to only hyphens", () => {
      expect(sanitizeFilename("###")).toBe("signal");
    });

    it("coerces non-string input via String()", () => {
      expect(sanitizeFilename(12345)).toBe("12345");
    });
  });

  describe("fileTimestamp", () => {
    it("returns an ISO-like timestamp with colons and dots replaced by hyphens", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-24T01:02:03.456Z"));
      expect(fileTimestamp()).toBe("2026-06-24T01-02-03-456Z");
      vi.useRealTimers();
    });
  });

  describe("isSecretPath", () => {
    it("flags dotenv-style filenames", () => {
      expect(isSecretPath("/project/.env")).toBe(true);
      expect(isSecretPath("/project/.env.local")).toBe(true);
    });

    it("flags key/cert/credential extensions", () => {
      expect(isSecretPath("id_rsa.key")).toBe(true);
      expect(isSecretPath("cert.pem")).toBe(true);
      expect(isSecretPath("bundle.p12")).toBe(true);
      expect(isSecretPath("ca.crt")).toBe(true);
      expect(isSecretPath("keystore.jks")).toBe(true);
      expect(isSecretPath("identity.pfx")).toBe(true);
    });

    it("flags paths containing a secrets/credentials directory segment (posix)", () => {
      expect(isSecretPath("/repo/secrets/db.json")).toBe(true);
      expect(isSecretPath("/repo/credentials/aws.json")).toBe(true);
    });

    it("flags paths containing a secrets/credentials directory segment (windows)", () => {
      expect(isSecretPath("C:\\repo\\secrets\\db.json")).toBe(true);
      expect(isSecretPath("C:\\repo\\credentials\\aws.json")).toBe(true);
    });

    it("flags any filename containing the word 'secret'", () => {
      expect(isSecretPath("/repo/myFavoriteSecretNotes.md")).toBe(true);
    });

    it("returns false for ordinary source files", () => {
      expect(isSecretPath("/repo/src/index.js")).toBe(false);
    });
  });

  describe("isExcludedPath", () => {
    it("excludes paths with node_modules/.git/dist/etc as a middle segment", () => {
      expect(isExcludedPath("/repo/node_modules/lib/index.js")).toBe(true);
      expect(isExcludedPath("/repo/.git/HEAD")).toBe(true);
      expect(isExcludedPath("/repo/dist/bundle.js")).toBe(true);
      expect(isExcludedPath("/repo/build/out.js")).toBe(true);
      expect(isExcludedPath("/repo/coverage/index.html")).toBe(true);
      expect(isExcludedPath("/repo/test-output/run.log")).toBe(true);
    });

    it("excludes paths that end with an excluded segment", () => {
      expect(isExcludedPath("/repo/out")).toBe(true);
    });

    it("normalizes windows-style separators and is case-insensitive", () => {
      expect(isExcludedPath("C:\\repo\\NODE_MODULES\\lib\\index.js")).toBe(
        true,
      );
    });

    it("returns false for normal project paths", () => {
      expect(isExcludedPath("/repo/src/index.js")).toBe(false);
    });
  });

  describe("isAllowedExtension", () => {
    it("uses the default allow-list when no override is given (line 94)", () => {
      expect(isAllowedExtension("/repo/index.js")).toBe(true);
      expect(isAllowedExtension("/repo/readme.md")).toBe(true);
      expect(isAllowedExtension("/repo/image.png")).toBe(false);
    });

    it("treats an empty override array as 'use defaults'", () => {
      expect(isAllowedExtension("/repo/index.js", [])).toBe(true);
    });

    it("treats a non-array override as 'use defaults'", () => {
      expect(isAllowedExtension("/repo/index.js", "not-an-array")).toBe(true);
    });

    it("uses a custom allow-list (case-insensitively) when provided", () => {
      expect(isAllowedExtension("/repo/image.PNG", [".png", ".jpg"])).toBe(
        true,
      );
      expect(isAllowedExtension("/repo/index.js", [".png", ".jpg"])).toBe(
        false,
      );
    });
  });

  describe("formatFrontmatter", () => {
    it("formats scalar values as JSON strings", () => {
      const result = formatFrontmatter({ title: "Hello", count: 3 });
      expect(result).toBe('---\ntitle: "Hello"\ncount: "3"\n---\n');
    });

    it("formats array values as a JSON-stringified list (line 103)", () => {
      const result = formatFrontmatter({ tags: ["a", "b", 2] });
      expect(result).toBe('---\ntags: ["a", "b", "2"]\n---\n');
    });

    it("formats an empty array as an empty bracketed list", () => {
      const result = formatFrontmatter({ tags: [] });
      expect(result).toBe("---\ntags: []\n---\n");
    });

    it("skips undefined and null values entirely", () => {
      const result = formatFrontmatter({
        a: undefined,
        b: null,
        c: "kept",
      });
      expect(result).toBe('---\nc: "kept"\n---\n');
    });

    it("returns just the fence lines for an empty object", () => {
      expect(formatFrontmatter({})).toBe("---\n---\n");
    });
  });

  describe("parseFrontmatter", () => {
    it("parses key/value pairs out of a frontmatter block", () => {
      const raw = '---\ntitle: "Hello"\nauthor: world\n---\nBody text here';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({ title: "Hello", author: "world" });
      expect(result.body).toBe("Body text here");
    });

    it("returns empty data and the full text as body when there is no frontmatter (line 116)", () => {
      const raw = "Just plain content, no frontmatter at all.";
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({});
      expect(result.body).toBe(raw);
    });

    it("handles null/undefined input as an empty string body", () => {
      expect(parseFrontmatter(null)).toEqual({ data: {}, body: "" });
      expect(parseFrontmatter(undefined)).toEqual({ data: {}, body: "" });
    });

    it("skips blank lines and lines without a colon inside the frontmatter block", () => {
      const raw = '---\ntitle: "Hello"\n\nnocolon\nauthor: world\n---\nBody';
      const result = parseFrontmatter(raw);
      expect(result.data).toEqual({ title: "Hello", author: "world" });
    });

    it("preserves colons within the value by rejoining the remainder", () => {
      const raw = '---\nurl: "https://example.com:8080/path"\n---\nBody';
      const result = parseFrontmatter(raw);
      expect(result.data.url).toBe("https://example.com:8080/path");
    });
  });

  describe("splitStagedSignalDocuments", () => {
    it("returns an empty array for blank/null/undefined input", () => {
      expect(splitStagedSignalDocuments("")).toEqual([]);
      expect(splitStagedSignalDocuments("   ")).toEqual([]);
      expect(splitStagedSignalDocuments(null)).toEqual([]);
      expect(splitStagedSignalDocuments(undefined)).toEqual([]);
    });

    it("returns the trimmed input as a single document when it has no frontmatter fence", () => {
      const raw = "  just some plain text  ";
      expect(splitStagedSignalDocuments(raw)).toEqual([raw.trim()]);
    });

    it("splits multiple frontmatter-fenced documents apart", () => {
      // The splitter only breaks at a closing fence immediately followed by
      // another opening fence (i.e. body-less frontmatter blocks placed
      // back-to-back) — exactly what formatFrontmatter() produces.
      const docA = formatFrontmatter({ title: "One" });
      const docB = formatFrontmatter({ title: "Two" });
      const docs = splitStagedSignalDocuments(docA + docB);

      expect(docs).toHaveLength(2);
      expect(docs[0]).toContain('title: "One"');
      expect(docs[1]).toContain('title: "Two"');
    });

    it("normalizes CRLF line endings before splitting", () => {
      const docA = formatFrontmatter({ title: "One" }).replaceAll("\n", "\r\n");
      const docB = formatFrontmatter({ title: "Two" }).replaceAll("\n", "\r\n");
      const docs = splitStagedSignalDocuments(docA + docB);

      expect(docs).toHaveLength(2);
      expect(docs[0]).toContain('title: "One"');
      expect(docs[1]).toContain('title: "Two"');
    });

    it("returns a single document for one fenced block", () => {
      const raw = '---\ntitle: "Solo"\n---\nJust one body';
      expect(splitStagedSignalDocuments(raw)).toHaveLength(1);
    });
  });
});
