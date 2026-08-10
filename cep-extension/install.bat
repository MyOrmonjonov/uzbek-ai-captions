@echo off
setlocal

set "SRC=%~dp0"
set "DEST=%APPDATA%\Adobe\CEP\extensions\ravon-captions"

echo Ravon Captions kengaytmasi o'rnatilmoqda...

if not exist "%DEST%" mkdir "%DEST%"

xcopy /E /I /Y "%SRC%CSXS" "%DEST%\CSXS" >nul
xcopy /E /I /Y "%SRC%client" "%DEST%\client" >nul
xcopy /E /I /Y "%SRC%host" "%DEST%\host" >nul

for %%v in (9 10 11 12) do (
    reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
)

echo.
echo O'rnatildi: %DEST%
echo.
echo Keyingi qadamlar:
echo   1. UzbekAiCaptionsBackend dasturini ishga tushiring
echo   2. Premiere Pro yoki After Effects'ni oching (agar ochiq bo'lsa, qayta oching)
echo   3. Window ^> Extensions ^> Ravon Captions
echo.
pause
