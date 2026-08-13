package org.example.plugin.model;

/**
 * One karaoke-caption preset. "ass" colors are &HAABBGGRR hex (alpha+BGR, not RGB — ASS's own
 * convention), and font sizes are relative to a 1920-px-tall reference frame (KaraokeStylePresets
 * scales PlayResY to the real video height, so a size tuned here at "how big on a 1920-tall
 * frame" reads consistently on any input resolution).
 *
 * template selects which of AssSubtitleBuilder's two rendering strategies this preset uses:
 * - KARAOKE_FILL: one Dialogue line per caption chunk, progressive primary->secondary color
 *   fill via ASS \k tags (classic sing-along look).
 * - WORD_POP: one Dialogue line per WORD (all sharing the same chunk text so libass lays out
 *   every repaint identically), the active word scaling up briefly via \t while the rest sit in
 *   the base color — the bold "TikTok captions" look. \t timing anchors to each Dialogue event's
 *   own Start, which is why this needs one event per word rather than one \k-tagged line.
 */
public record KaraokeStyle(
        String key,
        String displayName,
        String fontName,
        int fontSize,
        boolean bold,
        String baseColorAss,
        String highlightColorAss,
        String outlineColorAss,
        AnimationTemplate template) {

    public enum AnimationTemplate {
        KARAOKE_FILL,
        WORD_POP,
    }
}
