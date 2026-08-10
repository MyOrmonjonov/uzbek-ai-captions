@echo off
setlocal

set "SRC=%~dp0"
set "CEP_DEST=%APPDATA%\Adobe\CEP\extensions\ravon-captions"
set "BACKEND_DEST=%LOCALAPPDATA%\RavonCaptions\Backend"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Ravon Captions o'rnatilmoqda...
echo.

REM --- 1) Premiere/AE panelini o'rnatish ---
if not exist "%CEP_DEST%" mkdir "%CEP_DEST%"
xcopy /E /I /Y "%SRC%plugin\CSXS" "%CEP_DEST%\CSXS" >nul
xcopy /E /I /Y "%SRC%plugin\client" "%CEP_DEST%\client" >nul
xcopy /E /I /Y "%SRC%plugin\host" "%CEP_DEST%\host" >nul

for %%v in (9 10 11 12) do (
    reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

REM --- 2) Backend dasturini doimiy joyga o'rnatish ---
if not exist "%BACKEND_DEST%" mkdir "%BACKEND_DEST%"
xcopy /E /I /Y "%SRC%backend" "%BACKEND_DEST%" >nul

REM --- 3) Windows kirganda avtomatik ishga tushirish ---
powershell -NoProfile -Command ^
  "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP%\RavonCaptionsBackend.lnk'); ^
   $s.TargetPath='%BACKEND_DEST%\UzbekAiCaptionsBackend.exe'; ^
   $s.WorkingDirectory='%BACKEND_DEST%'; ^
   $s.Save()" >nul 2>&1

REM --- 4) Hoziroq ishga tushirish (fonda, konsolsiz) ---
start "" "%BACKEND_DEST%\UzbekAiCaptionsBackend.exe"

echo O'rnatildi!
echo.
echo Keyingi qadamlar:
echo   1. Premiere Pro yoki After Effects'ni yoping va qayta oching
echo   2. Window ^> Extensions ^> Ravon Captions
echo.
echo Eslatma: "Windows protected your PC" chiqsa - "More info" - "Run anyway"ni bosing.
echo Fayl zararsiz, faqat raqamli imzo yo'qligi uchun shu ogohlantirish chiqadi.
echo.
pause
