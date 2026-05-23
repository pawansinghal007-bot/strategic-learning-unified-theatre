@echo off
:: ════════════════════════════════════════════════════
:: Browser Capture v2 — Windows Installer
:: Right-click → Run as Administrator
:: ════════════════════════════════════════════════════

echo.
echo  Browser Capture v2 — Installer
echo.

set INSTALL_DIR=C:\BrowserCapture
set BRAVE_EXT_ID=aegencggpkooibjiidheakooobgiacgm

echo [1/5] Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

echo [2/5] Copying host files...
copy /Y "%~dp0host.py"                    "%INSTALL_DIR%\host.py"
copy /Y "%~dp0schema.sql"                 "%INSTALL_DIR%\schema.sql"
copy /Y "%~dp0host.bat"                   "%INSTALL_DIR%\host.bat"
copy /Y "%~dp0firefox_host_manifest.json" "%INSTALL_DIR%\firefox_host_manifest.json"

echo [3/5] Writing Brave manifest with correct extension ID...
(
  echo {
  echo   "name": "com.garuda.browser_capture",
  echo   "description": "Browser Capture v2 native host",
  echo   "path": "C:\\BrowserCapture\\host.bat",
  echo   "type": "stdio",
  echo   "allowed_origins": [
  echo     "chrome-extension://%BRAVE_EXT_ID%/"
  echo   ]
  echo }
) > "%INSTALL_DIR%\brave_host_manifest.json"
echo        ^^ Brave manifest: OK (%BRAVE_EXT_ID%)

echo [4/5] Registering native hosts in registry...
REG ADD "HKCU\Software\Mozilla\NativeMessagingHosts\com.garuda.browser_capture" /ve /t REG_SZ /d "%INSTALL_DIR%\firefox_host_manifest.json" /f
echo        ^^ Firefox: OK

REG ADD "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.garuda.browser_capture"              /ve /t REG_SZ /d "%INSTALL_DIR%\brave_host_manifest.json" /f
REG ADD "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.garuda.browser_capture" /ve /t REG_SZ /d "%INSTALL_DIR%\brave_host_manifest.json" /f
echo        ^^ Brave: OK

echo [5/5] Checking Python + dependencies...
python --version >nul 2>&1
if %errorlevel% neq 0 (
  echo  [!] Python not found. Install from https://python.org and re-run.
) else (
  python -m pip install argon2-cffi flask flask-cors --quiet
  echo        ^^ Python deps: OK
)

echo.
echo ════════════════════════════════════════════════════
echo  Done! Now:
echo  1. Reload both extensions in Brave and Firefox
echo  2. Open the popup and click Create Account
echo  DB:   %APPDATA%\BrowserCapture\capture.db
echo  Logs: %APPDATA%\BrowserCapture\host.log
echo ════════════════════════════════════════════════════
pause
