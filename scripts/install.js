import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(new URL("./install.js", import.meta.url)));
const nodePath = process.execPath;
const runnerPath = path.join(projectRoot, "..", "src", "daemon-runner.js");
const logDir = path.join(os.homedir(), ".vscode-rotator");
const logPath = path.join(logDir, "daemon.log");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
}

async function writeFile(target, content) {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content, { encoding: "utf8", mode: 0o600 });
}

function runCommand(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function runNpmLink() {
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmBin, ["link"], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("npm link failed");
  }
}

async function installWindows() {
  const taskName = "strategic-learning-unified-theatre-daemon";
  const command = `"${nodePath}" "${runnerPath}"`;
  try {
    runCommand("schtasks", [
      "/Create",
      "/TN",
      taskName,
      "/SC",
      "ONLOGON",
      "/RL",
      "LIMITED",
      "/F",
      "/TR",
      command
    ]);
    return;
  } catch (err) {
    console.warn("Windows scheduled task install failed, falling back to startup shortcut:", err.message);
  }

  const startupDir = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const shortcutPath = path.join(startupDir, "strategic-learning-unified-theatre-daemon.cmd");
  const shortcutContent = [`@echo off`, `"${nodePath}" "${runnerPath}" >> "%USERPROFILE%\\.vscode-rotator\\daemon.log" 2>&1`].join("\r\n");
  await writeFile(shortcutPath, shortcutContent);
  console.log(`Created startup shortcut at ${shortcutPath}`);
}

async function installMac() {
  const label = "com.strategic-learning-unified-theatre.daemon";
  const plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${runnerPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logPath}</string>
  <key>StandardErrorPath</key>
  <string>${logPath}</string>
</dict>
</plist>`;
  await writeFile(plistPath, content);
  runCommand("launchctl", ["bootstrap", "gui/$(id -u)", plistPath]);
}

async function installLinux() {
  const unitPath = path.join(os.homedir(), ".config", "systemd", "user", "strategic-learning-unified-theatre.service");
  const content = `[Unit]
Description=VS Code Rotator daemon
Description=Strategic Learning Unified Theatre daemon
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${runnerPath}
Restart=on-failure
RestartSec=10
WorkingDirectory=${os.homedir()}
StandardOutput=append:${logPath}
StandardError=append:${logPath}

[Install]
WantedBy=default.target
`;
  await writeFile(unitPath, content);
  runCommand("systemctl", ["--user", "daemon-reload"]);
  runCommand("systemctl", ["--user", "enable", "--now", "strategic-learning-unified-theatre.service"]);
}

async function main() {
  await ensureDir(logDir);

  switch (process.platform) {
    case "win32":
      await installWindows();
      break;
    case "darwin":
      await installMac();
      break;
    case "linux":
      await installLinux();
      break;
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }

  console.log("Service installer completed.");
}

main().catch((err) => {
  console.error("Install failed:", err.message);
  process.exit(1);
});
