@echo off
setlocal

cd /d "%~dp0"

if not exist target\Plugin-0.0.1-SNAPSHOT.jar (
    echo Jar topilmadi, avval quriyapmiz...
    call mvnw.cmd -q -DskipTests package
    if errorlevel 1 (
        echo Build muvaffaqiyatsiz tugadi.
        pause
        exit /b 1
    )
)

echo Uzbek AI Captions backend ishga tushmoqda (http://localhost:8971)...
java -jar target\Plugin-0.0.1-SNAPSHOT.jar
