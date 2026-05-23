@echo off
:: ════════════════════════════════════════════════════
:: Browser Capture v2 — Diagnostics
:: Run this if the extension popup shows "not connected"
:: ════════════════════════════════════════════════════
echo.
echo  === Browser Capture Diagnostics ===
echo.

echo [1] Registry check — Firefox:
REG QUERY "HKCU\Software\Mozilla\NativeMessagingHosts\com.garuda.browser_capture" 2>nul
if %errorlevel% neq 0 echo     NOT FOUND — run install.bat as Administrator

echo.
echo [2] Registry check — Brave:
REG QUERY "HKCU\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.garuda.browser_capture" 2>nul
if %errorlevel% neq 0 echo     NOT FOUND — run install.bat as Administrator

echo.
echo [3] File check — host files:
if exist "C:\BrowserCapture\host.py"  (echo     host.py ........... OK) else (echo     host.py ........... MISSING)
if exist "C:\BrowserCapture\host.bat" (echo     host.bat .......... OK) else (echo     host.bat .......... MISSING)
if exist "C:\BrowserCapture\schema.sql" (echo     schema.sql ........ OK) else (echo     schema.sql ........ MISSING)
if exist "C:\BrowserCapture\brave_host_manifest.json"   (echo     brave_manifest .... OK) else (echo     brave_manifest .... MISSING)
if exist "C:\BrowserCapture\firefox_host_manifest.json" (echo     firefox_manifest .. OK) else (echo     firefox_manifest .. MISSING)

echo.
echo [4] Brave manifest content:
if exist "C:\BrowserCapture\brave_host_manifest.json" (
  type "C:\BrowserCapture\brave_host_manifest.json"
) else (
  echo     File missing — run install.bat
)

echo.
echo [5] Python check:
python --version 2>nul
if %errorlevel% neq 0 (echo     Python NOT found) else (
  python -c "import argon2; print('     argon2-cffi: OK')" 2>nul
  if %errorlevel% neq 0 echo     argon2-cffi: MISSING — run: pip install argon2-cffi
)

echo.
echo [6] Last 20 log lines (host.log):
if exist "%APPDATA%\BrowserCapture\host.log" (
  powershell -command "Get-Content '%APPDATA%\BrowserCapture\host.log' -Tail 20"
) else (
  echo     No log yet — host has never connected successfully
)

echo.
echo [7] Last 20 stderr lines (Python crash traces):
if exist "%APPDATA%\BrowserCapture\host_stderr.log" (
  powershell -command "Get-Content '%APPDATA%\BrowserCapture\host_stderr.log' -Tail 20"
) else (
  echo     No stderr log yet (host.bat may not have run yet)
)

echo.
pause
