@echo off
setlocal

set "DEST=%APPDATA%\Adobe\CEP\extensions\uzbek-ai-captions"

if exist "%DEST%" (
    rmdir /S /Q "%DEST%"
    echo Olib tashlandi: %DEST%
) else (
    echo Topilmadi: %DEST%
)

pause
