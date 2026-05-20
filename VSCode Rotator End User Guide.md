# VSCode Rotator

## Overview

VSCode Rotator is a local desktop tool for managing and switching between Visual Studio Code account profiles, monitoring Git repositories, and viewing progress logs. It is designed for business users who need to maintain several VS Code authorization profiles and follow workspace health without deep technical setup.

> Note: This is a desktop application. It does not require a cloud login screen and is intended to run on a personal or work computer.

## Getting Started

### System Requirements

- Windows, macOS, or Linux desktop computer
- Node.js 18+ (for developer or unpackaged use)
- Electron desktop runtime (packaged version includes this)
- Local installation of Git if you use the Git Monitor module

### Installation and Launch

1. Install the application package if available.
2. Launch the app from your desktop or Start menu.
3. If you are using the developer version, run:
   - `npm run electron:dev`
   - or open the built installer file if packaged.

### Access Instructions

- There is no username/password login screen.
- Open the app directly.
- The app remembers local configuration and account state on your computer.

> Important: The current UI does not include a “Create new account” button, so account setup may require additional setup or a companion tool outside the UI.

## Login Instructions

### How to sign in

- There is no sign-in form.
- If the app asks for confirmation when you switch accounts, follow the prompt.

### If you do not see accounts

- The app may have no stored accounts yet.
- Contact your administrator or use the companion setup process to add account credentials.

## Dashboard Overview

### What you will see

The Dashboard is the home screen and shows:

- Active Account
- Agent type for the current account
- Recent Events
- System status at the bottom

### Status bar

The bottom status line shows:

- `daemon running` — background service is active
- `daemon paused` — background service is not active
- Active account email or ID
- This gives you a quick indicator of whether the system is monitoring properly

### Screen navigation

Left sidebar buttons:

- Dashboard
- Accounts
- Live Feed
- Git Monitor
- Progress Log
- Settings

Use these buttons to move through the application.

## Module 1 - Dashboard

### Purpose

The Dashboard gives you a quick summary of current account status and recent activity.

### Step-by-Step Instructions

1. Open the app.
2. Click `Dashboard` in the left sidebar.
3. Review the `Active Account` card.
   - If account details appear, that account is currently available.
   - If the card says `No accounts`, there are no stored accounts available.
4. Scan `Recent Events` for the last actions or warnings.

### Expected Outcomes

- If an account is active, you should see email or ID and the agent type.
- If there are no events, the text will show `No recent events`.

### Common Errors

- If `No accounts` appears, your system is not yet configured with account credentials.
- If recent events do not update, the internal monitoring service may be paused.

### Best Practices

- Use Dashboard first to verify the app is working.
- If the daemon is paused, move to `Settings` or restart the app.

## Module 2 - Accounts

### Purpose

The Accounts module shows stored VS Code account profiles and allows switching between them.

### Step-by-Step Instructions

1. Click `Accounts` in the sidebar.
2. Wait for the account list to load.
3. Review each row:
   - Email
   - Agent type
   - Status
   - Last Used
4. To change to a different account:
   - Click `Switch` on the desired row.
   - Confirm the prompt in the popup.
5. The status will refresh after the switch.

### Expected Outcomes

- The selected account is activated.
- The `Last Used` timestamp updates after switching.
- Active or cooldown status may appear.

### What the fields mean

| Field | Meaning |
|---|---|
| Email | Account identifier or email |
| Agent | Type of VS Code authorization profile |
| Status | `active`, `cooldown`, or `retired` |
| Last Used | When the account was last selected |

### Common Errors

- A switch may fail if the account is missing expected credentials.
- If the table shows `No accounts`, there are no stored profiles.
- If account rows do not refresh, click `Refresh`.

### Best Practices

- Always confirm the switch prompt before changing accounts.
- Refresh the list if you know accounts were added outside the UI.

## Module 3 - Live Feed

### Purpose

Live Feed displays real-time event messages from the application and monitoring services.

### Step-by-Step Instructions

1. Click `Live Feed` in the sidebar.
2. Watch the stream of events in the panel.
3. To stop the feed temporarily:
   - Click `Pause`
4. To resume live updates:
   - Click `Resume`

### Expected Outcomes

- The feed shows event time, type, and detail.
- It is updated automatically by the app.

### Common Errors

- If you see no events, the system may not have generated any activity yet.
- If feed remains empty after activity, try `Pause` and `Resume` or restart the app.

### Best Practices

- Use Live Feed to verify account switching and background monitoring.
- Pause the feed if you need to inspect a message.

## Module 4 - Git Monitor

### Purpose

Git Monitor watches repositories and helps you manage repo health.

### Step-by-Step Instructions

1. Click `Git Monitor` in the sidebar.
2. Click `Add repo`.
3. Choose a repository folder from the folder picker.
4. The repository appears as a card with:
   - repository name
   - full folder path
5. To stop monitoring a repo:
   - Click `Remove`

### Expected Outcomes

- Added repos appear immediately.
- The app tracks Git status and uncommitted changes.

### Common Errors

- Repository path may fail if the folder is not a Git repository.
- If no repos appear, the list is empty and you need to add one.

### Best Practices

- Add only repositories you actively work on.
- Remove repos that are no longer relevant.
- Keep Git repositories clean to reduce warnings.

## Module 5 - Progress Log

### Purpose

Progress Log shows the application history and journal entries.

### Step-by-Step Instructions

1. Click `Progress Log` in the sidebar.
2. Choose:
   - `Markdown` for formatted view
   - `Timeline` for raw log text
3. Read the events and history entries.

### Expected Outcomes

- The log shows progress messages and event records.
- Entries refresh automatically every 10 seconds.

### Common Errors

- If the log is empty, no progress events are recorded yet.
- If formatting appears broken, switch to `Timeline`.

### Best Practices

- Use this module to confirm system actions.
- Switch views if text is hard to read.

## Module 6 - Settings

### Purpose

Settings controls the app’s monitoring interval.

### Step-by-Step Instructions

1. Click `Settings`.
2. Locate `Poll interval (ms)`.
3. Enter the number of milliseconds between monitoring checks.
4. Click `Save`.

### Expected Outcomes

- Settings are saved locally.
- The app uses the new polling interval for background monitoring.

### Field Description

| Field | Purpose | Example |
|---|---|---|
| Poll interval (ms) | How often the app checks account and repo state | `30000` = 30 seconds |

### Common Errors

- Invalid numbers may not save correctly.
- If the value is too low, the app may check too frequently.
- If the value is too high, updates may feel delayed.

### Best Practices

- Keep the default interval unless you need faster refresh.
- Do not set extremely low values.

## Troubleshooting

### Common Problems and Fixes

- **No accounts in Accounts or Dashboard**
  - Likely no saved account credentials.
  - Add accounts via the appropriate setup tool or ask your administrator.

- **Switch fails with an error**
  - Confirm the account exists and has valid credentials.
  - Try again after restarting the app.

- **Daemon paused**
  - The bottom status bar shows `daemon paused`.
  - Restart the app to resume monitoring.

- **Live Feed not updating**
  - Click `Pause` then `Resume`.
  - Restart the app if necessary.

- **Git Monitor cannot add repo**
  - Ensure the selected folder contains a Git repository.
  - Confirm Git is installed on your computer.

- **Settings not saving**
  - Enter a valid numeric value.
  - Save again and verify.

### If the app freezes or closes unexpectedly

1. Close the app.
2. Reopen it.
3. Verify the Dashboard and Status Bar update.
4. If the problem continues, contact support with the app version.

## FAQs

### Q: Do I need a username and password?
A: No. This app does not use an internal login form. It runs locally and uses stored account profiles.

### Q: How do I add an account?
A: The current UI does not provide an account creation form. You may need to add accounts through the companion setup process described by your administrator.

### Q: What does `daemon running` mean?
A: It means the app’s background monitoring service is active and watching account and Git status.

### Q: What if `No accounts` appears?
A: There are no saved account profiles in the app yet. Contact your IT administrator.

### Q: Can I use this on a mobile device?
A: No. This is a desktop application. It is designed for a desktop window.

### Q: What are `active`, `cooldown`, and `retired`?
A: These are account status labels.
- `active` = ready to use
- `cooldown` = temporarily unavailable
- `retired` = no longer in use

### Q: How do I stop the app?
A: Close the application window or use the system quit/close option. There is no logout button in this version.

## Admin Guide

### App responsibilities

- Manage account switching
- Monitor Git repositories
- Maintain a progress journal
- Support background daemon service

### Admin notes

- There is no admin login or separate admin UI.
- Admins should ensure account credentials are configured outside the current UI if needed.
- The app stores settings in local files such as `~/.vscode-rotator/config.json`.

### User role differences

- Current version has a single user mode.
- No separate admin or viewer roles are implemented.

## Security Recommendations

- Keep your desktop secure and do not share access to the app.
- Do not share account credentials displayed in the app.
- Use strong local machine security for files stored under `~/.vscode-rotator`.
- Do not add repositories from unknown locations.

## Mobile Responsiveness Notes

- The current application is desktop-only.
- The interface is not optimized for mobile or small-screen devices.
- Use the tool on a laptop or desktop for best results.

## Glossary

| Term | Meaning |
|---|---|
| Daemon | Background service that monitors account and repo status |
| Account | A saved VS Code auth profile or email |
| Agent | The type of VS Code or code assistant profile being used |
| Git Monitor | Module that watches selected Git repositories |
| Progress Log | History of app actions and events |
| Poll interval | Time in milliseconds between automatic checks |
| Cooldown | Temporary pause for an account before it can be used again |
| Retired | Account marked as inactive or no longer used |

## Notes on Missing or Unclear Workflows

- The app does not provide a visible account creation workflow.
- There is no login or logout process.
- There is no clear multi-user or role-based access control.
- The UI does not show how to import or add new credentials directly, which is a documentation gap.
- This guide assumes local desktop use and that account setup may require outside assistance.

> If you need a complete user manual exported to PDF or Confluence, this guide is structured for easy conversion.
