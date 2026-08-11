#!/bin/bash
# Copies cep-extension into a build output directory with client/js/main.js obfuscated
# (javascript-obfuscator) so a customer who unzips the distributed plugin can't just read
# the source and clone it. Everything else (HTML/CSS/manifest/mogrt assets — not
# meaningfully "clonable" the same way, and CEP needs the HTML/manifest to stay as literal
# markup it can parse — plus host/index.jsx, see below) is copied as-is.
#
# host/index.jsx is intentionally left UNOBFUSCATED (just copied as-is below) — it runs in
# Premiere's ExtendScript engine, a genuinely old (ES3-ish) JS engine, not a browser/Node
# context. It was obfuscated here for a while with conservative settings (no control-flow-
# flattening/dead-code-injection/self-defending, verified to emit no arrow functions / let /
# const / classes / template literals), but that was never actually confirmed working inside
# real Premiere, and a customer report of getActiveMediaPath()'s evalScript callback never
# firing at all — even after a 70s retry budget, for a function that does no I/O and should
# return near-instantly — points at the obfuscated host script silently failing to load in
# ExtendScript (which would mean nothing in that file is ever defined, so no evalScript call
# to it could ever get a real response). client/js/main.js runs in a normal CEF/Node context
# and stays obfuscated — its execution is well confirmed working through everything else that
# depends on it.
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

# host/index.jsx is deliberately left as the plain cp -R copy above — see the header comment.

echo "Obfuscated plugin build written to: $DEST"