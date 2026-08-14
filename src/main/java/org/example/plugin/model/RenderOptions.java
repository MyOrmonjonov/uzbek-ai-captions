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
        boolean cyrillic) {
}
