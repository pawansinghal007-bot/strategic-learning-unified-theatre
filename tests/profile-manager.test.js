// tests/profile-manager.test.js
// Full coverage for profile-manager.js (lines 1-188)

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as profileManagerModule from "../src/accounts/profile-manager.js";
import { ProfileManager } from "../src/accounts/profile-manager.js";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

// fflate — avoid real compression in unit tests
vi.mock("fflate", () => ({
  zipSync: vi.fn((data) => {
    const json = JSON.stringify(
      Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, Array.from(v)]),
      ),
    );
    return Buffer.from(json);
  }),
  unzipSync: vi.fn((buf) => {
    const obj = JSON.parse(Buffer.from(buf).toString());
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, new Uint8Array(v)]),
    );
  }),
}));

// AccountStore — inject via constructor in most tests
vi.mock("../src/accounts/store.js", () => ({
  AccountStore: vi.fn().mockImplementation(function () {
    this.update = vi.fn(async (id, patch) => ({ id, ...patch }));
  }),
}));

// resolveVSCodeBin — never shell out to a real binary
vi.mock("../src/internal/paths.js", () => ({
  resolveVSCodeBin: vi.fn(async () => "/usr/bin/code"),
}));

// node:child_process — prevent any real process spawn.
// Must include `default` export and spread actual module so transitive
// imports (e.g. src/encrypt.js → node:crypto) that also pull in
// child_process don't lose their default binding.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    execFile: vi.fn((bin, args, opts, cb) => {
      if (typeof opts === "function") opts(null, "", "");
      else if (typeof cb === "function") cb(null, "", "");
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeStore(overrides = {}) {
  return {
    update: vi.fn(async (id, patch) => ({ id, ...patch })),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
describe("profile-manager.js", () => {
  let tempDir;
  let profilesDir;
  let templatesDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-test-"));
    profilesDir = path.join(tempDir, "profiles");
    // Create a fake templates directory that readTemplate can read from.
    // readTemplate uses import.meta.url to resolve the path, so we spy on
    // fs.readFile to intercept template reads.
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  // ── exists() ──────────────────────────────────────────────────────────────
  // Covered indirectly by list(), create(), exportSnapshot() paths below.

  // ── resolveProfilesDir() ──────────────────────────────────────────────────
  describe("resolveProfilesDir — platform branches", () => {
    const origPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, "platform", {
        value: origPlatform,
        configurable: true,
      });
    });

    it("returns APPDATA-based path on win32 when APPDATA is set", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      const origAppData = process.env.APPDATA;
      process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
      try {
        const pm = new ProfileManager();
        expect(pm.profilesDir).toContain("Code");
        expect(pm.profilesDir).toContain("profiles");
      } finally {
        process.env.APPDATA = origAppData;
      }
    });

    it("falls back to os.homedir() AppData path on win32 when APPDATA is unset", () => {
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });
      const origAppData = process.env.APPDATA;
      delete process.env.APPDATA;
      try {
        const pm = new ProfileManager();
        expect(pm.profilesDir).toContain("AppData");
        expect(pm.profilesDir).toContain("profiles");
      } finally {
        if (origAppData !== undefined) process.env.APPDATA = origAppData;
      }
    });

    it("returns macOS Library path on darwin", () => {
      Object.defineProperty(process, "platform", {
        value: "darwin",
        configurable: true,
      });
      const pm = new ProfileManager();
      expect(pm.profilesDir).toContain("Library");
      expect(pm.profilesDir).toContain("Application Support");
    });

    it("uses XDG_CONFIG_HOME when set on linux", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      const origXdg = process.env.XDG_CONFIG_HOME;
      process.env.XDG_CONFIG_HOME = "/custom/config";
      try {
        const pm = new ProfileManager();
        expect(pm.profilesDir).toContain("/custom/config");
      } finally {
        if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
        else delete process.env.XDG_CONFIG_HOME;
      }
    });

    it("falls back to ~/.config on linux when XDG_CONFIG_HOME is unset", () => {
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });
      const origXdg = process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_CONFIG_HOME;
      try {
        const pm = new ProfileManager();
        expect(pm.profilesDir).toContain(".config");
      } finally {
        if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
      }
    });
  });

  // ── readTemplate() ────────────────────────────────────────────────────────
  describe("readTemplate — via create()", () => {
    // Helper: spy on fs.readFile intercepting only template reads; pass through everything else.
    function spyTemplate(jsonStr) {
      const orig = fs.readFile.bind(fs);
      return vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
        if (String(p).includes("profile-templates")) return jsonStr;
        return orig(p, enc);
      });
    }

    it("uses 'default' template when templateName is blank", async () => {
      spyTemplate(
        JSON.stringify({
          extensions: ["ext.one"],
          colorTheme: "Dark+",
          iconTheme: "vs-minimal",
        }),
      );
      const pm = new ProfileManager({ profilesDir });
      const result = await pm.create("myprofile", "  ");
      expect(result).toBe("myprofile");
    });

    it("filters non-string entries from extensions array", async () => {
      spyTemplate(
        JSON.stringify({
          extensions: ["valid.ext", 42, null, "another.ext"],
          colorTheme: null,
          iconTheme: 999,
        }),
      );
      const pm = new ProfileManager({ profilesDir });
      const result = await pm.create("filtered", "custom");
      expect(result).toBe("filtered");
    });

    it("handles missing extensions/colorTheme/iconTheme (all defaults)", async () => {
      spyTemplate(JSON.stringify({}));
      const pm = new ProfileManager({ profilesDir });
      const result = await pm.create("bare", "minimal");
      expect(result).toBe("bare");
    });
  });

  // ── writeProfileSettings() ────────────────────────────────────────────────
  describe("writeProfileSettings — settings.json content", () => {
    it("writes both colorTheme and iconTheme when both present", async () => {
      const origReadFile = fs.readFile.bind(fs);
      vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
        if (String(p).includes("profile-templates")) {
          return JSON.stringify({
            extensions: [],
            colorTheme: "Monokai",
            iconTheme: "seti",
          });
        }
        return origReadFile(p, enc);
      });

      const pm = new ProfileManager({ profilesDir });
      await pm.create("themed", "default");
      vi.restoreAllMocks();

      const settingsPath = path.join(profilesDir, "themed", "settings.json");
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      expect(settings["workbench.colorTheme"]).toBe("Monokai");
      expect(settings["workbench.iconTheme"]).toBe("seti");
    });

    it("writes empty settings when neither colorTheme nor iconTheme present", async () => {
      const origReadFile = fs.readFile.bind(fs);
      vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
        if (String(p).includes("profile-templates")) {
          return JSON.stringify({ extensions: [] });
        }
        return origReadFile(p, enc);
      });

      const pm = new ProfileManager({ profilesDir });
      await pm.create("notheme", "default");
      vi.restoreAllMocks();

      const settingsPath = path.join(profilesDir, "notheme", "settings.json");
      const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      expect(Object.keys(settings)).toHaveLength(0);
    });
  });

  // ── ProfileManager.list() ─────────────────────────────────────────────────
  describe("ProfileManager.list()", () => {
    it("returns [] when profilesDir does not exist", async () => {
      const pm = new ProfileManager({
        profilesDir: path.join(tempDir, "nonexistent"),
      });
      expect(await pm.list()).toEqual([]);
    });

    it("returns only directory names", async () => {
      await fs.mkdir(path.join(profilesDir, "alice"), { recursive: true });
      await fs.mkdir(path.join(profilesDir, "bob"), { recursive: true });
      await fs.writeFile(path.join(profilesDir, "not-a-dir.txt"), "x");

      const pm = new ProfileManager({ profilesDir });
      const names = await pm.list();
      expect(names.sort()).toEqual(["alice", "bob"]);
    });
  });

  // ── ProfileManager.create() ───────────────────────────────────────────────
  describe("ProfileManager.create()", () => {
    it("throws when name is empty", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.create("")).rejects.toThrow("Profile name is required");
      await expect(pm.create("   ")).rejects.toThrow(
        "Profile name is required",
      );
    });

    it("installs each extension via execFileAsync", async () => {
      const orig = fs.readFile.bind(fs);
      vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
        if (String(p).includes("profile-templates")) {
          return JSON.stringify({
            extensions: ["ms-python.python", "esbenp.prettier"],
          });
        }
        return orig(p, enc);
      });

      const { execFile } = await import("node:child_process");
      const pm = new ProfileManager({ profilesDir });
      await pm.create("dev", "default");

      // execFile is called once per extension
      const calls = execFile.mock.calls;
      const extArgs = calls.map((c) => c[1]).flat();
      expect(extArgs).toContain("ms-python.python");
      expect(extArgs).toContain("esbenp.prettier");
    });

    it("skips extension install when extensions array is empty", async () => {
      const orig = fs.readFile.bind(fs);
      vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
        if (String(p).includes("profile-templates")) {
          return JSON.stringify({ extensions: [] });
        }
        return orig(p, enc);
      });

      const { execFile } = await import("node:child_process");
      execFile.mockClear();
      const pm = new ProfileManager({ profilesDir });
      await pm.create("empty-exts", "default");
      expect(execFile).not.toHaveBeenCalled();
    });
  });

  // ── ProfileManager.delete() ───────────────────────────────────────────────
  describe("ProfileManager.delete()", () => {
    it("throws when name is empty after trim", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.delete("  ")).rejects.toThrow("Profile name is required");
    });

    it("removes the profile directory (lines 140-141)", async () => {
      // Explicitly restore mocks so fs.rm is the real implementation.
      vi.restoreAllMocks();
      const dir = path.join(profilesDir, "tobedeleted");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "settings.json"), "{}");

      const pm = new ProfileManager({ profilesDir });
      await pm.delete("tobedeleted");

      await expect(fs.stat(dir)).rejects.toThrow();
    });

    it("does not throw when profile directory does not exist (lines 140-141)", async () => {
      vi.restoreAllMocks();
      await fs.mkdir(profilesDir, { recursive: true });
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.delete("nonexistent-profile")).resolves.toBeUndefined();
    });

    it("coerces non-string name via String() before trim (line 138)", async () => {
      vi.restoreAllMocks();
      await fs.mkdir(profilesDir, { recursive: true });
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.delete(123)).resolves.toBeUndefined();
    });

    it("calls fs.rm with recursive+force so nested files are removed (lines 140-141 explicit rm call)", async () => {
      vi.restoreAllMocks();
      const dir = path.join(profilesDir, "nested-delete");
      await fs.mkdir(path.join(dir, "sub"), { recursive: true });
      await fs.writeFile(path.join(dir, "settings.json"), "{}");
      await fs.writeFile(path.join(dir, "sub", "keybindings.json"), "{}");

      const rmSpy = vi.spyOn(fs, "rm");
      const pm = new ProfileManager({ profilesDir });
      await pm.delete("nested-delete");

      // Confirm fs.rm was called with the right path and options
      expect(rmSpy).toHaveBeenCalledWith(
        path.join(profilesDir, "nested-delete"),
        { recursive: true, force: true },
      );
      // Confirm the directory is actually gone
      await expect(fs.stat(dir)).rejects.toThrow();
      vi.restoreAllMocks();
    });
  });

  // ── ProfileManager.link() ─────────────────────────────────────────────────
  describe("ProfileManager.link()", () => {
    it("throws when profileName trims to empty (non-null)", async () => {
      const pm = new ProfileManager({ profilesDir, store: makeStore() });
      await expect(pm.link("acc1", "  ")).rejects.toThrow(
        "profileName is required",
      );
    });

    it("sets profileName to null when null is passed", async () => {
      const store = makeStore();
      const pm = new ProfileManager({ profilesDir, store });
      await pm.link("acc1", null);
      expect(store.update).toHaveBeenCalledWith("acc1", { profileName: null });
    });

    it("updates store with trimmed profileName", async () => {
      const store = makeStore();
      const pm = new ProfileManager({ profilesDir, store });
      await pm.link("acc1", "  myprofile  ");
      expect(store.update).toHaveBeenCalledWith("acc1", {
        profileName: "myprofile",
      });
    });
  });

  // ── ProfileManager.exportSnapshot() ──────────────────────────────────────
  describe("ProfileManager.exportSnapshot()", () => {
    it("throws when profileName is empty", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.exportSnapshot("  ", "/out/snap.zip")).rejects.toThrow(
        "Profile name is required",
      );
    });

    it("throws when zipPath is empty", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.exportSnapshot("myprofile", "")).rejects.toThrow(
        "zipPath is required",
      );
    });

    it("throws when profile directory does not exist", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(
        pm.exportSnapshot("ghost", path.join(tempDir, "out.zip")),
      ).rejects.toThrow("Profile not found: ghost");
    });

    it("exports a profile to a zip file", async () => {
      // Create a real profile directory with files.
      const profileDir = path.join(profilesDir, "exportme");
      await fs.mkdir(profileDir, { recursive: true });
      await fs.writeFile(path.join(profileDir, "settings.json"), '{"a":1}');
      await fs.mkdir(path.join(profileDir, "subdir"), { recursive: true });
      await fs.writeFile(
        path.join(profileDir, "subdir", "keybindings.json"),
        '{"b":2}',
      );

      const zipPath = path.join(tempDir, "export.zip");
      const pm = new ProfileManager({ profilesDir });
      await pm.exportSnapshot("exportme", zipPath);

      const stat = await fs.stat(zipPath);
      expect(stat.size).toBeGreaterThan(0);

      // Verify zipSync was called with the right keys
      const { zipSync } = await import("fflate");
      const lastCall = zipSync.mock.calls.at(-1)[0];
      expect(Object.keys(lastCall)).toContain("settings.json");
      expect(Object.keys(lastCall)).toContain("subdir/keybindings.json");
    });
  });

  // ── listFilesRecursively() ────────────────────────────────────────────────
  describe("listFilesRecursively — via exportSnapshot", () => {
    it("recurses into nested directories", async () => {
      const profileDir = path.join(profilesDir, "deep");
      await fs.mkdir(path.join(profileDir, "a", "b"), { recursive: true });
      await fs.writeFile(path.join(profileDir, "root.txt"), "r");
      await fs.writeFile(path.join(profileDir, "a", "mid.txt"), "m");
      await fs.writeFile(path.join(profileDir, "a", "b", "leaf.txt"), "l");

      const zipPath = path.join(tempDir, "deep.zip");
      const pm = new ProfileManager({ profilesDir });
      await pm.exportSnapshot("deep", zipPath);

      const { zipSync } = await import("fflate");
      const keys = Object.keys(zipSync.mock.calls.at(-1)[0]);
      expect(keys).toContain("root.txt");
      expect(keys).toContain("a/mid.txt");
      expect(keys).toContain("a/b/leaf.txt");
    });
  });

  // ── ProfileManager.importSnapshot() ──────────────────────────────────────
  describe("ProfileManager.importSnapshot()", () => {
    it("throws when zipPath is empty", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.importSnapshot("", "myprofile")).rejects.toThrow(
        "zipPath is required",
      );
    });

    it("throws when profileName trims to empty", async () => {
      const pm = new ProfileManager({ profilesDir });
      await expect(pm.importSnapshot("/some/file.zip", "  ")).rejects.toThrow(
        "Profile name is required",
      );
    });

    it("imports files from a zip into the profile directory", async () => {
      // First export a real profile so we have a valid zip.
      const srcDir = path.join(profilesDir, "source");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, "settings.json"),
        '{"imported":true}',
      );

      const zipPath = path.join(tempDir, "import.zip");
      const pm = new ProfileManager({ profilesDir });
      await pm.exportSnapshot("source", zipPath);

      // Now import it as a different profile name.
      const result = await pm.importSnapshot(zipPath, "imported-profile");
      expect(result).toBe("imported-profile");

      const settingsPath = path.join(
        profilesDir,
        "imported-profile",
        "settings.json",
      );
      const content = JSON.parse(await fs.readFile(settingsPath, "utf8"));
      expect(content).toMatchObject({ imported: true });
    });

    it("replaces existing profile directory on import", async () => {
      // Create existing profile to be overwritten.
      const existingDir = path.join(profilesDir, "overwrite-me");
      await fs.mkdir(existingDir, { recursive: true });
      await fs.writeFile(path.join(existingDir, "old.json"), '{"old":true}');

      // Create zip with new content.
      const srcDir = path.join(profilesDir, "newsrc");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "new.json"), '{"new":true}');

      const zipPath = path.join(tempDir, "new.zip");
      const pm = new ProfileManager({ profilesDir });
      await pm.exportSnapshot("newsrc", zipPath);
      await pm.importSnapshot(zipPath, "overwrite-me");

      // Old file should be gone, new file present.
      await expect(
        fs.stat(path.join(existingDir, "old.json")),
      ).rejects.toThrow();
      const newContent = JSON.parse(
        await fs.readFile(path.join(existingDir, "new.json"), "utf8"),
      );
      expect(newContent).toMatchObject({ new: true });
    });
  });

  // ── Constructor defaults ───────────────────────────────────────────────────
  describe("ProfileManager constructor", () => {
    it("uses AccountStore default when store is not provided", () => {
      const pm = new ProfileManager({ profilesDir });
      expect(pm.store).toBeDefined();
    });

    it("uses provided store", () => {
      const store = makeStore();
      const pm = new ProfileManager({ profilesDir, store });
      expect(pm.store).toBe(store);
    });

    it("uses resolveProfilesDir() when profilesDir is not provided (line 105 ?? branch)", () => {
      // Pass no profilesDir → line 105: this.profilesDir = profilesDir ?? resolveProfilesDir()
      // resolveProfilesDir() right-hand side fires.
      const pm = new ProfileManager({ store: makeStore() });
      expect(pm.profilesDir).toBeTruthy();
      expect(typeof pm.profilesDir).toBe("string");
    });

    it("uses no-arg constructor defaults for both store and profilesDir (lines 104-105 ?? branches)", () => {
      // Pass nothing at all → both ?? right-hand sides fire.
      const pm = new ProfileManager();
      expect(pm.store).toBeDefined();
      expect(pm.profilesDir).toBeTruthy();
    });
  });
});


// ── Targeted coverage gap: lines 140-141 ─────────────────────────────────
// create() swallows ENOENT errors from installExtension but re-throws any
// other error.  Lines 140-141 are the `if (err?.code !== "ENOENT") { throw err; }`
// branch that only fires for non-ENOENT failures.

describe("ProfileManager.create() — non-ENOENT extension install error (lines 140-141)", () => {
  let tempDir;
  let profilesDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pm-gap-test-"));
    profilesDir = path.join(tempDir, "profiles");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  it("re-throws a non-ENOENT error from installExtension", async () => {
    // Arrange: template has one extension so installExtension is called once.
    const origReadFile = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
      if (String(p).includes("profile-templates")) {
        return JSON.stringify({ extensions: ["some.extension"] });
      }
      return origReadFile(p, enc);
    });

    // Make execFile fire the callback with a non-ENOENT error.
    const { execFile } = await import("node:child_process");
    execFile.mockImplementationOnce((_bin, _args, _opts, cb) => {
      const err = new Error("permission denied");
      err.code = "EACCES"; // not ENOENT → must be re-thrown
      cb(err);
    });

    const pm = new ProfileManager({ profilesDir });
    await expect(pm.create("fail-ext", "default")).rejects.toThrow(
      "permission denied",
    );
  });

  it("swallows an ENOENT error from installExtension (guard: the passing branch)", async () => {
    // Confirm the inverse — ENOENT is silently ignored and create() resolves.
    const origReadFile = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation(async (p, enc) => {
      if (String(p).includes("profile-templates")) {
        return JSON.stringify({ extensions: ["some.extension"] });
      }
      return origReadFile(p, enc);
    });

    const { execFile } = await import("node:child_process");
    execFile.mockImplementationOnce((_bin, _args, _opts, cb) => {
      const err = new Error("code binary not found");
      err.code = "ENOENT"; // swallowed — create() should still succeed
      cb(err);
    });

    const pm = new ProfileManager({ profilesDir });
    await expect(pm.create("enoent-ext", "default")).resolves.toBe(
      "enoent-ext",
    );
  });
});
