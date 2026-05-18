refer Architecture summary across sprints in folder E:\VS Code Agent\Solution before development 
 sprint 4 — VS Code profiles + workspace binding
profile management · .code-workspace · settings isolation
≈120K tokens
estimated token usage
120K / 150K
deliverables
profile-manager.js
workspace.js
profile templates
CLI profile cmds
tasks
create/delete VS Code profiles via "code --profile" CLI flag automation
profile template per agent: recommended extensions list, color theme, icon theme
link account → VS Code profile name in AccountStore
workspace binding: patch .code-workspace JSON to set "profile" field
CLI commands: profile create|list|link
|apply
export/import profile snapshot as a portable .zip for sharing
update SwitcherService to pass --profile flag on VS Code launch
documentation: setup guide for first-time profile creation
sprint prompt
Continue "vscode-rotator". Sprints 1–3 complete.

SPRINT 4 SCOPE — VS Code profile management + workspace binding.

Context: AccountStore.update now accepts a "profileName" field. SwitcherService.switch uses vscode.launchWithProfile(profileName).

New deliverables:
1. src/profile-manager.js
   — ProfileManager class:
     create(name, templateName): writes profile settings to VS Code profiles dir; uses "code --profile  --install-extension " for each extension in template
     delete(name): removes profile dir
     list(): reads VS Code profiles directory and returns names
     link(accountId, profileName): updates AccountStore record
   — Templates defined in src/profile-templates/: codex.json, trae.json, default.json
     Each template: { extensions: string[], colorTheme: string, iconTheme: string }
   — Resolve VS Code profiles dir: macOS ~/Library/Application Support/Code/User/profiles, Linux ~/.config/Code/User/profiles, Windows %APPDATA%\Code\User\profiles

2. src/workspace.js
   — bindProfile(workspacePath, profileName): reads .code-workspace JSON, sets top-level "profile" key, writes back
   — unbind(workspacePath): removes "profile" key
   — getBinding(workspacePath): returns current profile name or null

3. Update src/switcher.js SwitcherService.switch to:
   — look up account.profileName from store
   — pass it to vscode.launchWithProfile

4. cli: profile create|list|link|apply commands
   apply : reads account from store, creates profile if missing, binds workspace, opens VS Code

Write tests for workspace JSON patch (valid JSON round-trip, missing file error).

