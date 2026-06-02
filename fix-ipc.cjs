const fs = require("node:fs");

const f = "electron-ui/ipc/handlers.cjs";

let c = fs.readFileSync(f, "utf8");

c = c.replace(
  /return await store\.add\(\{[\s\S]*?status: .active.\s*\}\);\s*\}\);\s*\/\/ Backwards-compatible alias/,
  `const added = await store.add({
      id,
      email,
      agentType,
      authBlob: null,
      profileName,
      cooldownUntil: null,
      lastUsed: null,
      status: "active"
    });
    return JSON.parse(JSON.stringify(added));
  });
  // Backwards-compatible alias`,
);

fs.writeFileSync(f, c, "utf8");

console.log("Fixed");
