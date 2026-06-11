"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const SRC_ROOT = path.resolve(__dirname, "..", "src");
const ORIGINAL_JS_LOADER = require.extensions[".js"];
const ORIGINAL_RESOLVE = Module._resolveFilename;

let installed = false;

function isInsideSource(filename) {
  const relative = path.relative(SRC_ROOT, filename);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function existingFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function sourceCandidate(request, parent) {
  if (!request.startsWith(".") && !path.isAbsolute(request)) {
    return null;
  }

  const baseDir = parent?.filename ? path.dirname(parent.filename) : process.cwd();
  const absolute = path.isAbsolute(request) ? request : path.resolve(baseDir, request);
  const ext = path.extname(absolute);

  if (ext === ".js") {
    const tsPath = absolute.slice(0, -3) + ".ts";
    return existingFile(tsPath) ? tsPath : null;
  }

  if (!ext) {
    const tsPath = `${absolute}.ts`;
    if (existingFile(tsPath)) return tsPath;

    const jsPath = `${absolute}.js`;
    if (existingFile(jsPath)) return jsPath;

    const indexTsPath = path.join(absolute, "index.ts");
    if (existingFile(indexTsPath)) return indexTsPath;

    const indexJsPath = path.join(absolute, "index.js");
    if (existingFile(indexJsPath)) return indexJsPath;
  }

  return null;
}

function resolveSourcePath(request, parentFilename) {
  installSourceLoader();

  const parentRequire = Module.createRequire(parentFilename);
  try {
    return parentRequire.resolve(request);
  } catch (error) {
    const candidate = sourceCandidate(request, { filename: parentFilename });
    if (candidate) return candidate;
    throw error;
  }
}

function compileSourceModule(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      allowJs: true,
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2020,
    },
  });

  const compileFilename = filename.endsWith(".js") ? `${filename}.cjs` : filename;
  module._compile(output.outputText, compileFilename);
}

function installSourceLoader() {
  if (installed) return;
  installed = true;

  Module._resolveFilename = function resolveSourceRequest(request, parent, isMain, options) {
    try {
      return ORIGINAL_RESOLVE.call(this, request, parent, isMain, options);
    } catch (error) {
      const candidate = sourceCandidate(request, parent);
      if (candidate) return candidate;
      throw error;
    }
  };

  require.extensions[".ts"] = compileSourceModule;

  require.extensions[".js"] = function loadJavaScript(module, filename) {
    if (isInsideSource(filename)) {
      compileSourceModule(module, filename);
      return;
    }

    ORIGINAL_JS_LOADER(module, filename);
  };
}

function srcRequire(request) {
  installSourceLoader();
  return require(request);
}

function requireSourceFrom(parentFilename, request) {
  installSourceLoader();
  return Module.createRequire(parentFilename)(request);
}

async function importSourceFrom(parentFilename, request) {
  return requireSourceFrom(parentFilename, request);
}

module.exports = {
  importSourceFrom,
  installSourceLoader,
  requireSourceFrom,
  resolveSourcePath,
  srcRequire,
};
