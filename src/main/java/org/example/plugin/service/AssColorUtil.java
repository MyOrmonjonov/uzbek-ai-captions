package org.example.plugin.service;

/**
 * KaraokeStyle's colors are ASS's own &amp;HAABBGGRR hex convention (alpha, then BGR — not RGB).
 * The web tool's style gallery renders a live CSS text preview instead of a rendered video clip
 * per card, so it needs the same colors as plain CSS #RRGGBB.
 */
public final class AssColorUtil {

    private AssColorUtil() {
    }

    /** Converts "&HAABBGGRR" to "#RRGGBB" (alpha is dropped — every preset today uses 00/opaque). */
    public static String toCssHex(String assColor) {
        String hex = assColor.startsWith("&H") ? assColor.substring(2) : assColor;
        if (hex.length() != 8) {
            return "#FFFFFF";
        }
        String bb = hex.substring(2, 4);
        String gg = hex.substring(4, 6);
        String rr = hex.substring(6, 8);
        return "#" + rr + gg + bb;
    }
}
