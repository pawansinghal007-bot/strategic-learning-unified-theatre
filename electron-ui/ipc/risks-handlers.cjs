"use strict";

const { ipcMain } = require("electron");

function risks() {
  return require("../../src/security/risks/index.js");
}

function registerRisksHandlers() {
  ipcMain.handle(
    "risks:scan:dependency",
    async (_event, scanTarget, options) => {
      try {
        const { runDependencyCheck } = risks();
        const result = await runDependencyCheck(scanTarget, options ?? {});
        return { ok: true, engine: "dependency-check", result };
      } catch (err) {
        return {
          ok: false,
          engine: "dependency-check",
          error: String(err),
        };
      }
    },
  );

  ipcMain.handle("risks:scan:image", async (_event, imageRef) => {
    try {
      const { runTrivyImage } = risks();
      const result = await runTrivyImage(imageRef);
      return { ok: true, engine: "trivy", result };
    } catch (err) {
      return { ok: false, engine: "trivy", error: String(err) };
    }
  });
}

module.exports = { registerRisksHandlers };
