#!/bin/bash
# Copies cep-extension into a build output directory with client/js/main.js and
# host/index.jsx obfuscated (javascript-obfuscator) so a customer who unzips the
# distributed plugin can't just read the source and clone it. Everything else
# (HTML/CSS/manifest/mogrt assets — not meaningfully "clonable" the same way, and CEP
# needs the HTML/manifest to stay as literal markup it can parse) is copied as-is.
#
# Settings are deliberately conservative: control-flow-flattening/dead-code-injection/
# self-defending are OFF. Those transforms assume a modern JS engine; host/index.jsx runs
# in Premiere's ExtendScript engine (ES3-ish), and self-defending in particular actively
# breaks under non-eval-friendly or unusual execution contexts. Verified (see commit
# message) that the obfuscated output contains no arrow functions / let / const / classes
# / template literals — only var/function, which is what index.jsx already used
# throughout. Still, this has NOT been run inside real Premiere — test before relying on it.
#
# Usage: obfuscate-plugin.sh <source_cep_extension_dir> <dest_dir>
set -e

SRC="$1"
DEST="$2"
if [ -z "$SRC" ] || [ -z "$DEST" ]; then
    echo "Usage: obfuscate-plugin.sh <source_cep_extension_dir> <dest_dir>" >&2
    exit 1
fi

OBF_ARGS=(
    --compact true
    --control-flow-flattening false
    --dead-code-injection false
    --string-array true
    --string-array-encoding base64
    --string-array-threshold 0.75
    --identifier-names-generator hexadecimal
    --rename-globals false
    --self-defending false
    --disable-console-output false
)

rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"

npx --yes javascript-obfuscator@5.5.0 "$DEST/client/js/main.js" --output "$DEST/client/js/main.js" "${OBF_ARGS[@]}"

# CLI requires a .js/.mjs/.cjs extension for both input AND output — output to a temp .js
# name (an --output path ending in .jsx makes the CLI treat it as an output *directory*,
# which collides with the index.jsx file already sitting there from the cp -R above) and
# mv the result over the real index.jsx afterward.
cp "$DEST/host/index.jsx" "$DEST/host/index_obf_tmp.js"
npx --yes javascript-obfuscator@5.5.0 "$DEST/host/index_obf_tmp.js" --output "$DEST/host/index_obf_tmp.out.js" "${OBF_ARGS[@]}"
rm "$DEST/host/index_obf_tmp.js" "$DEST/host/index.jsx"
mv "$DEST/host/index_obf_tmp.out.js" "$DEST/host/index.jsx"

echo "Obfuscated plugin build written to: $DEST"