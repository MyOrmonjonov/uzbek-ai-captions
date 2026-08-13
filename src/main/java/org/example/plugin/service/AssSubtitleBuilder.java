package org.example.plugin.service;

import java.util.ArrayList;
import java.util.List;

import org.example.plugin.model.KaraokeStyle;
import org.example.plugin.model.Word;

/**
 * Turns word-level transcription timing into an ASS (Advanced SubStation Alpha) subtitle file
 * that ffmpeg's "ass" filter (libass) burns directly into the video. ASS was picked over hand-
 * rolled frame compositing because its \k (karaoke) and \t (transform/animation) override tags
 * already do exactly this job natively and reliably — see KaraokeStyle's javadoc for how the two
 * animation templates map to \k vs. per-word \t.
 */
final class AssSubtitleBuilder {

    private static final int WORDS_PER_LINE = 5;
    // ASS \k values are in centiseconds and must be positive; a run of words with identical or
    // out-of-order ASR timestamps (rare, but seen with very short interjections) would otherwise
    // produce a zero/negative duration that libass either drops or renders as an instant flash.
    private static final int MIN_CENTISECONDS = 3;

    private AssSubtitleBuilder() {
    }

    static String build(List<Word> words, KaraokeStyle style, int videoWidth, int videoHeight) {
        int playResX = videoWidth > 0 ? videoWidth : 1080;
        int playResY = videoHeight > 0 ? videoHeight : 1920;
        // Font sizes on KaraokeStylePresets are tuned against a 1920-tall reference frame so a
        // preset reads the same size regardless of the actual input resolution.
        int fontSize = Math.max(10, Math.round(style.fontSize() * (playResY / 1920f)));

        StringBuilder sb = new StringBuilder();
        sb.append("[Script Info]\n")
                .append("ScriptType: v4.00+\n")
                .append("PlayResX: ").append(playResX).append('\n')
                .append("PlayResY: ").append(playResY).append('\n')
                .append("ScaledBorderAndShadow: yes\n\n")
                .append("[V4+ Styles]\n")
                .append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
                        + "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
                        + "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n")
                .append("Style: Karaoke,").append(style.fontName()).append(',').append(fontSize).append(',')
                .append(style.baseColorAss()).append(',').append(style.highlightColorAss()).append(',')
                .append(style.outlineColorAss()).append(",&H00000000,")
                .append(style.bold() ? "-1" : "0")
                .append(",0,0,0,100,100,0,0,1,5,0,2,60,60,")
                .append(Math.round(playResY * 0.15)).append(",1\n\n")
                .append("[Events]\n")
                .append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");

        for (List<Word> line : chunk(words, WORDS_PER_LINE)) {
            switch (style.template()) {
                case KARAOKE_FILL -> appendKaraokeFillLine(sb, line);
                case WORD_POP -> appendWordPopLines(sb, line, style);
            }
        }
        return sb.toString();
    }

    private static List<List<Word>> chunk(List<Word> words, int size) {
        List<List<Word>> chunks = new ArrayList<>();
        for (int i = 0; i < words.size(); i += size) {
            chunks.add(words.subList(i, Math.min(words.size(), i + size)));
        }
        return chunks;
    }

    private static void appendKaraokeFillLine(StringBuilder sb, List<Word> line) {
        double start = line.get(0).start();
        double end = line.get(line.size() - 1).end();
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < line.size(); i++) {
            Word w = line.get(i);
            double durationSeconds = (i < line.size() - 1) ? (line.get(i + 1).start() - w.start()) : (w.end() - w.start());
            int centiseconds = Math.max(MIN_CENTISECONDS, (int) Math.round(durationSeconds * 100));
            text.append("{\\k").append(centiseconds).append('}').append(escape(w.text())).append(' ');
        }
        appendDialogue(sb, start, end, text.toString().stripTrailing());
    }

    private static void appendWordPopLines(StringBuilder sb, List<Word> line, KaraokeStyle style) {
        for (int i = 0; i < line.size(); i++) {
            double start = line.get(i).start();
            double end = (i < line.size() - 1) ? line.get(i + 1).start() : line.get(i).end();
            if (end <= start) {
                end = start + (MIN_CENTISECONDS / 100.0);
            }
            StringBuilder text = new StringBuilder();
            for (int j = 0; j < line.size(); j++) {
                String word = escape(line.get(j).text());
                if (j == i) {
                    // Pop-scale the active word up and settle back down, timed relative to THIS
                    // event's own Start (0ms) -- the reason this needs one Dialogue event per
                    // word rather than a single \k line: \t timing anchors to the event's Start,
                    // not to each karaoke syllable within it.
                    text.append("{\\c").append(style.highlightColorAss())
                            .append("\\t(0,120,\\fscx115\\fscy115)\\t(120,240,\\fscx100\\fscy100)}")
                            .append(word).append(' ');
                } else {
                    text.append("{\\c").append(style.baseColorAss()).append('}').append(word).append(' ');
                }
            }
            appendDialogue(sb, start, end, text.toString().stripTrailing());
        }
    }

    private static void appendDialogue(StringBuilder sb, double start, double end, String text) {
        sb.append("Dialogue: 0,").append(formatTime(start)).append(',').append(formatTime(end))
                .append(",Karaoke,,0,0,0,,").append(text).append('\n');
    }

    private static String formatTime(double seconds) {
        long totalCentiseconds = Math.round(Math.max(0, seconds) * 100);
        long hours = totalCentiseconds / 360000;
        long minutes = (totalCentiseconds / 6000) % 60;
        long secs = (totalCentiseconds / 100) % 60;
        long cs = totalCentiseconds % 100;
        return String.format("%d:%02d:%02d.%02d", hours, minutes, secs, cs);
    }

    /** ASS treats {, }, and \ as override-block syntax; a literal newline would break the Dialogue line. */
    private static String escape(String text) {
        return text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")
                .replace("\n", " ").replace("\r", " ");
    }
}
