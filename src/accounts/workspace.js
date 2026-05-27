import fs from "node:fs/promises";

async function readWorkspace(workspacePath) {
  try {
    const raw = await fs.readFile(workspacePath, "utf8");
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object" || Array.isArray(json)) {
      throw new Error("Workspace must be a JSON object");
    }
    return json;
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(`Workspace not found: ${workspacePath}`);
    }
    throw err;
  }
}

async function writeWorkspace(workspacePath, json) {
  await fs.writeFile(workspacePath, JSON.stringify(json, null, 2), "utf8");
}

export async function bindProfile(workspacePath, profileName) {
  if (!profileName || !String(profileName).trim()) {
    throw new Error("profileName is required");
  }
  const json = await readWorkspace(workspacePath);
  json.profile = String(profileName).trim();
  await writeWorkspace(workspacePath, json);
  return json.profile;
}

export async function unbind(workspacePath) {
  const json = await readWorkspace(workspacePath);
  delete json.profile;
  await writeWorkspace(workspacePath, json);
}

export async function getBinding(workspacePath) {
  const json = await readWorkspace(workspacePath);
  return typeof json.profile === "string" ? json.profile : null;
}

