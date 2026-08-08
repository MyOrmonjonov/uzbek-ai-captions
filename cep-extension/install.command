#!/bin/bash
# Mac equivalent of install.bat — copies this folder's client/host/CSXS into Adobe's CEP
# extensions directory and enables PlayerDebugMode (required since this extension isn't
# code-signed/notarized for the Adobe Marketplace). Mirrors install.bat's logic exactly,
# just with Mac paths (~/Library/Application Support/...) and `defaults write` instead of the
# Windows registry.
set -e

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/uzbek-ai-captions"

echo "Uzbek AI Captions kengaytmasi o'rnatilmoqda..."

mkdir -p "$DEST"
rm -rf "$DEST/CSXS" "$DEST/client" "$DEST/host"
cp -R "$SRC/CSXS" "$DEST/CSXS"
cp -R "$SRC/client" "$DEST/client"
cp -R "$SRC/host" "$DEST/host"

for v in 9 10 11 12; do
    defaults write "com.adobe.CSXS.$v" PlayerDebugMode 1 2>/dev/null || true
done

echo
echo "O'rnatildi: $DEST"
echo
echo "Keyingi qadamlar:"
echo "  1. Backendni ishga tushiring (D:\\Plugin ekvivalenti — run-server.sh yoki java -jar bilan)"
echo "  2. Premiere Pro yoki After Effects'ni oching (agar ochiq bo'lsa, qayta oching)"
echo "  3. Window > Extensions > Uzbek AI Captions"
echo
echo "Eslatma: ffmpeg PATH'da bo'lishi kerak (yoki backend konfiguratsiyasida yo'li ko'rsatilgan bo'lishi kerak)."
echo
read -p "Davom etish uchun Enter bosing..."
