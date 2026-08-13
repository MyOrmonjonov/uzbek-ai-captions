#!/bin/bash
set -e

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CEP_DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/ravon-captions"
APPS_DEST="$HOME/Applications"
PLIST="$HOME/Library/LaunchAgents/uz.ravoncaptions.backend.plist"

echo "Ravon Captions o'rnatilmoqda..."
echo

# --- 0) Eski backend jarayonini to'xtatish ---
# Backend kompyuterga kirganda avtomatik ishga tushadi (pastdagi LaunchAgent orqali), shuning
# uchun qayta o'rnatishda deyarli har doim allaqachon ishlab turadi. Eski nusxa fayl darajasida
# almashtirilsa ham (rm -rf + cp -R macOS'da ishlayotgan .app ustida ham ishlaydi), eski
# jarayon xotirada davom etib, yangi nusxa ishga tushganda bir xil portni band qilib qo'yishi
# mumkin — shu sabab avval majburan to'xtatiladi.
pkill -f "RavonCaptionsBackend" 2>/dev/null || true
sleep 1

# --- 1) Premiere/AE panelini o'rnatish ---
mkdir -p "$CEP_DEST"
rm -rf "$CEP_DEST/CSXS" "$CEP_DEST/client" "$CEP_DEST/host"
cp -R "$SRC/plugin/CSXS" "$CEP_DEST/CSXS"
cp -R "$SRC/plugin/client" "$CEP_DEST/client"
cp -R "$SRC/plugin/host" "$CEP_DEST/host"

for v in 9 10 11 12; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done

# --- 2) Backend dasturini doimiy joyga o'rnatish ---
mkdir -p "$APPS_DEST"
rm -rf "$APPS_DEST/RavonCaptionsBackend.app"
cp -R "$SRC/backend/RavonCaptionsBackend.app" "$APPS_DEST/RavonCaptionsBackend.app"
xattr -cr "$APPS_DEST/RavonCaptionsBackend.app" 2>/dev/null || true

# --- 3) Kompyuterga kirganda avtomatik ishga tushirish ---
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>uz.ravoncaptions.backend</string>
    <key>ProgramArguments</key>
    <array>
        <string>$APPS_DEST/RavonCaptionsBackend.app/Contents/MacOS/RavonCaptionsBackend</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST" 2>/dev/null || true

# --- 4) Hoziroq ishga tushirish ---
open "$APPS_DEST/RavonCaptionsBackend.app"

echo
echo "O'rnatildi!"
echo
echo "Keyingi qadamlar:"
echo "  1. Premiere Pro yoki After Effects'ni yoping va qayta oching"
echo "  2. Window > Extensions > Ravon Captions"
echo
echo "Eslatma: agar 'noma'lum dasturchi' ogohlantirishi chiqsa, Finder'da"
echo "RavonCaptionsBackend'ga o'ng tugma bilan bosib 'Open'ni tanlang."
echo
read -p "Davom etish uchun Enter bosing..."