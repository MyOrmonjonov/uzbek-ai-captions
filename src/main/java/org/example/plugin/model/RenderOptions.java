package org.example.plugin.model;

/**
 * Web-tool-only display customization layered on top of a KaraokeStyle (the desktop CEP panel
 * never sends this -- KaraokeCaptionController always passes null, which AssSubtitleBuilder
 * treats as "use the original hardcoded defaults", so the desktop path's output is byte-for-byte
 * unchanged). Every field is optional/nullable-ish so a partially-specified object still works.
 *
 * groupingMode: "custom" (use wordsOnScreen literally) | "sozma_soz" | "qisqa" | "manoga_qarab"
 * (clause-boundary grouping) | "toliq_gap" (whole-sentence grouping). The two algorithmic modes
 * ignore wordsOnScreen and group by punctuation instead -- see AssSubtitleBuilder.groupWords().
 *
 * position: "top" | "middle" | "bottom".
 *
 * textColorHex/accentColorHex are CSS "#RRGGBB" (matching what an &lt;input type="color"&gt;
 * produces), converted to ASS's &amp;HAABBGGRR via AssColorUtil.fromCssHex; null means "use the
 * style preset's own color" (AssColorUtil rejects malformed hex the same way, since this comes
 * straight off the wire). outline is nullable rather than primitive so "not sent" (null) means
 * "on", matching the style presets' original always-on 5px outline -- a primitive default of
 * false would have silently stripped every preset's outline the moment the desktop CEP path
 * (which never sends RenderOptions at all) was compared against a web request that omits it.
 *
 * targetResolution is the desired output HEIGHT in pixels as a string ("720", "1080", "2160"
 * for 4K) -- null (or anything that doesn't parse) means "keep the source's own resolution", the
 * original always-true behavior. Width is derived from it preserving the source's aspect ratio
 * (see KaraokeCaptionService.resolveOutputResolution), not sent separately, since every style
 * this tool targets is a fixed-aspect vertical export.
 */
public record RenderOptions(
        Integer wordsOnScreen,
        Integer wordsPerLine,
        Integer textSizePercent,
        String position,
        boolean uppercase,
        String fontOverride,
        String groupingMode,
        boolean autoEmphasis,
        boolean cyrillic,
        String textColorHex,
        String accentColorHex,
        Boolean outline,
        String targetResolution) {
}
