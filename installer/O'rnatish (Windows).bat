@echo off
setlocal

set "SRC=%~dp0"
set "CEP_DEST=%APPDATA%\Adobe\CEP\extensions\ravon-captions"
set "BACKEND_DEST=%LOCALAPPDATA%\RavonCaptions\Backend"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Ravon Captions o'rnatilmoqda...
echo.

REM --- 0) Eski backend jarayonini to'xtatish ---
REM Backend Windows kirganda avtomatik ishga tushadi (pastdagi Startup yorlig'i orqali), shuning
REM uchun qayta o'rnatishda deyarli har doim allaqachon ishlab turadi. Windows ishlab turgan
REM .exe faylini almashtirishga ruxsat bermaydi (yoki jimgina o'tkazib yuboradi) — shu sabab
REM oldingi versiyada "qayta o'rnatilgan" fayllar aslida yozilmay qolib, mijoz bilmagan holda
REM eski (buzilgan) backend'ni ishlatishda davom etardi. Endi fayllarni ustidan yozishdan oldin
REM eski jarayon majburan to'xtatiladi.
taskkill /IM UzbekAiCaptionsBackend.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul 2>&1

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
REM (PowerShell -Command'ga bir necha qatorli buyruqni "^" bilan bo'lib berish
REM  cmd/PowerShell tirnoq ichida ishonchsiz ekani sinovda tasdiqlandi — shuning
REM  uchun buyruq vaqtinchalik .ps1 fayl orqali, -File bilan ishga tushiriladi.)
set "PS1=%TEMP%\ravon-captions-shortcut.ps1"
> "%PS1%" echo $s = (New-Object -COM WScript.Shell).CreateShortcut('%STARTUP%\RavonCaptionsBackend.lnk')
>> "%PS1%" echo $s.TargetPath = '%BACKEND_DEST%\UzbekAiCaptionsBackend.exe'
>> "%PS1%" echo $s.WorkingDirectory = '%BACKEND_DEST%'
>> "%PS1%" echo $s.Save()
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" >nul 2>&1
del "%PS1%" >nul 2>&1

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
