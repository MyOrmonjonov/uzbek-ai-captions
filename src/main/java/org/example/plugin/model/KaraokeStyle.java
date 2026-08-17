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
 * - SLIDE_IN: one Dialogue line per chunk, an explicit \move (from just off its final position)
 *   plus an alpha fade-in over the first ~220ms, then holds still.
 * - TYPEWRITER: one Dialogue event per revealed character, each showing one more character of
 *   the chunk's text than the last — the classic terminal-typing look. Ignores wordsPerLine
 *   wrapping (chunks using this template are expected to stay short).
 * - COLOR_CYCLE: one Dialogue line per chunk, PrimaryColour chained through a small fixed
 *   palette via \t for the chunk's whole duration.
 * - SHAKE: one Dialogue line per chunk, a quick oscillating \frz wiggle on entrance (settles by
 *   320ms) rather than a continuous shake, which would fight with readability.
 * - PUNCH: one Dialogue line per chunk, scales in from oversized down to normal with a slight
 *   overshoot ("impact" landing), via \fscx/\fscy \t.
 * - CASCADE: one Dialogue line per chunk, but each WORD gets its own staggered fade+rise \t
 *   (via \move) inside that single event, so words appear to fall into place one after another
 *   instead of the whole line popping in at once.
 * - BLUR_IN: one Dialogue line per chunk, animates \blur from blurred to sharp via \t.
 * - BOXED_FILL: textually identical to KARAOKE_FILL (same \k fill), but the Style line uses
 *   BorderStyle 3 (opaque box background, using BackColour) instead of 1 (outline) -- the
 *   "captions on a solid card" look.
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
        SLIDE_IN,
        TYPEWRITER,
        COLOR_CYCLE,
        SHAKE,
        PUNCH,
        CASCADE,
        BLUR_IN,
        BOXED_FILL,
    }
}
