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
  const taskName = "vscode-rotator-daemon";
  const xmlPath = path.join(logDir, "vscode-rotator-task.xml");
  const command = `${nodePath} \"${runnerPath}\"`;
  const xml = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Date>${new Date().toISOString()}</Date>
    <Author>${os.userInfo().username}</Author>
    <Description>VS Code Rotator daemon</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${nodePath}</Command>
      <Arguments>\"${runnerPath}\"</Arguments>
    </Exec>
  </Actions>
</Task>`;

  await writeFile(xmlPath, xml);
  runCommand("schtasks", ["/Create", "/TN", taskName, "/XML", xmlPath, "/F"]);
}

async function installMac() {
  const label = "com.vscode-rotator.daemon";
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
  const unitPath = path.join(os.homedir(), ".config", "systemd", "user", "vscode-rotator.service");
  const content = `[Unit]
Description=VS Code Rotator daemon
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
  runCommand("systemctl", ["--user", "enable", "--now", "vscode-rotator.service"]);
}

async function main() {
  await ensureDir(logDir);
  try {
    runNpmLink();
  } catch (err) {
    console.error("npm link failed:", err.message);
  }

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
